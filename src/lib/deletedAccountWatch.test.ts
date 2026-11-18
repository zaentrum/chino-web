// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MAX_BODY_BYTES,
  authorizationOf,
  isChinoApi,
  saysAccountDeleted,
  watchingForDeletedAccount,
} from './deletedAccountWatch.ts';

const ORIGIN = 'https://media.example.org';
const SRC = join(import.meta.dirname, '..');

const deletedBody = JSON.stringify({
  error: 'account_deleted',
  detail: "the account's deletion has begun: nothing more is kept for it",
});

function json(status: number, body: string, contentType = 'application/json'): Response {
  return new Response(body, { status, headers: { 'Content-Type': contentType } });
}

/** A fetch that answers every request with `answer()`, and notes each
 *  request's URL and when the watch said the account was deleted, with the
 *  Authorization it handed on. */
function server(answer: () => Response) {
  const log: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    log.push(`sent ${typeof input === 'string' ? input : input instanceof URL ? input.href : input.url}`);
    return answer();
  }) as typeof fetch;
  const watched = watchingForDeletedAccount(fetchImpl, ORIGIN, (authorization) => log.push(`deleted ${authorization}`));
  return { log, watched };
}

test('16.5.6 a write answered 401 account_deleted signs out before the caller has the answer, sent once', async () => {
  const { log, watched } = server(() => json(401, deletedBody));
  const res = await watched('/api/v1/me/likes/title-1', { method: 'PUT', headers: { Authorization: 'Bearer t' } });
  log.push('answered');
  assert.deepEqual(log, ['sent /api/v1/me/likes/title-1', 'deleted Bearer t', 'answered']);
  // The caller still reads the answer as it came.
  assert.equal(res.status, 401);
  assert.equal(((await res.json()) as { error: string }).error, 'account_deleted');
});

test('16.5.6 the lists read and a new stream token answered account_deleted sign out too, by Request or URL', async () => {
  for (const input of [new Request(`${ORIGIN}/api/v1/me/watchlists`), new URL(`${ORIGIN}/api/v1/me/stream-token`)]) {
    const { log, watched } = server(() => json(401, deletedBody));
    await watched(input);
    assert.equal(log.filter((l) => l.startsWith('deleted')).length, 1, String(input));
  }
});

test("16.5.6 the sign-out is handed the refused request's Authorization, as fetch was given it", () => {
  const url = `${ORIGIN}/api/v1/me/likes/title-1`;
  assert.equal(authorizationOf(url, { headers: { Authorization: 'Bearer first' } }), 'Bearer first');
  assert.equal(authorizationOf(url, { headers: new Headers({ authorization: 'Bearer first' }) }), 'Bearer first');
  assert.equal(authorizationOf(url, { headers: [['Authorization', 'Bearer first']] }), 'Bearer first');
  assert.equal(authorizationOf(new Request(url, { headers: { Authorization: 'Bearer first' } })), 'Bearer first');
  // init's headers take the place of the Request's, as in fetch.
  assert.equal(
    authorizationOf(new Request(url, { headers: { Authorization: 'Bearer first' } }), { headers: { Authorization: 'Bearer second' } }),
    'Bearer second',
  );
  assert.equal(authorizationOf(new Request(url, { headers: { Authorization: 'Bearer first' } }), { headers: {} }), null);
  // None: a request without one, a stream token in the address only.
  assert.equal(authorizationOf(url), null);
  assert.equal(authorizationOf(`${url}?stream=s`, { method: 'PUT' }), null);
});

test("16.5.6 the content type's case doesn't count", async () => {
  for (const type of ['Application/JSON', 'APPLICATION/JSON; charset=UTF-8', 'application/problem+json']) {
    assert.equal(await saysAccountDeleted(json(401, deletedBody, type)), true, type);
  }
  assert.equal(await saysAccountDeleted(json(401, deletedBody, 'Text/Plain')), false);
});

test('16.5.6 no more than MAX_BODY_BYTES of a 401 is read: a longer body is not that answer, and the caller still has it whole', async () => {
  const long = JSON.stringify({ error: 'account_deleted', detail: 'x'.repeat(MAX_BODY_BYTES) });
  const { log, watched } = server(() => json(401, long));
  const res = await watched('/api/v1/me/likes/title-1', { method: 'PUT', headers: { Authorization: 'Bearer t' } });
  assert.deepEqual(log, ['sent /api/v1/me/likes/title-1']);
  assert.equal(await res.text(), long);
  // Just within it: read.
  const within = JSON.stringify({ error: 'account_deleted', detail: '' });
  const padded = within + ' '.repeat(MAX_BODY_BYTES - within.length);
  assert.equal(await saysAccountDeleted(json(401, padded)), true);
  assert.equal(await saysAccountDeleted(json(401, `${padded} `)), false);
});

test('16.5.6 a 401 whose body never ends is read no further than the cap; one that says it is longer is not read', async () => {
  let enqueued = 0;
  const endless = new ReadableStream<Uint8Array>({
    pull(c) {
      const chunk = new TextEncoder().encode('{"error":"account_deleted"}'.padEnd(1000, ' '));
      enqueued += chunk.byteLength;
      c.enqueue(chunk);
    },
  });
  const res = new Response(endless, { status: 401, headers: { 'Content-Type': 'application/json' } });
  assert.equal(await saysAccountDeleted(res), false);
  assert.ok(enqueued <= MAX_BODY_BYTES + 4 * 1000, `read ${enqueued} bytes`);

  let pulled = 0;
  const declared = new Response(
    new ReadableStream<Uint8Array>(
      {
        pull(c) {
          pulled++;
          c.enqueue(new TextEncoder().encode(deletedBody));
          c.close();
        },
      },
      // Pulled only when read.
      { highWaterMark: 0 },
    ),
    { status: 401, headers: { 'Content-Type': 'application/json', 'Content-Length': String(MAX_BODY_BYTES + 1) } },
  );
  assert.equal(await saysAccountDeleted(declared), false);
  assert.equal(pulled, 0);
});

test('a 401 that does not say account_deleted is left to the sign-in, as before', async () => {
  for (const answer of [
    () => new Response('invalid token', { status: 401, headers: { 'Content-Type': 'text/plain' } }),
    () => json(401, JSON.stringify({ error: 'token_audience' })),
    () => json(401, 'not json'),
    () => new Response(null, { status: 401 }),
    () => json(401, ''),
  ]) {
    const { log, watched } = server(answer);
    const res = await watched('/api/v1/me/likes/title-1', { method: 'PUT' });
    assert.equal(res.status, 401);
    assert.deepEqual(log, ['sent /api/v1/me/likes/title-1']);
  }
});

test('16.5.6 a write that waited out an open deletion, 503 account busy, signs nobody out', async () => {
  const { log, watched } = server(
    () => new Response('account busy', { status: 503, headers: { 'Content-Type': 'text/plain', 'Retry-After': '5' } }),
  );
  const res = await watched('/api/v1/items/title-1/progress', { method: 'POST' });
  assert.equal(res.status, 503);
  assert.equal(res.headers.get('Retry-After'), '5');
  assert.equal(await res.text(), 'account busy');
  assert.deepEqual(log, ['sent /api/v1/items/title-1/progress']);
});

test("only chino-api's answer counts: not an addon's through the portal, not another origin's", async () => {
  for (const url of ['/api/portal/apps/notes/x', 'https://elsewhere.example.org/api/v1/me/likes/title-1', '/other']) {
    const { log, watched } = server(() => json(401, deletedBody));
    await watched(url);
    assert.deepEqual(log, [`sent ${url}`], url);
  }
  assert.equal(isChinoApi('/api/v1/me/watchlists', ORIGIN), true);
  assert.equal(isChinoApi(`${ORIGIN}/api/v1/me`, ORIGIN), true);
  assert.equal(isChinoApi('/api/config', ORIGIN), false);
});

test('a success, and an answer other than 401, are not looked into', async () => {
  assert.equal(await saysAccountDeleted(json(200, deletedBody)), false);
  assert.equal(await saysAccountDeleted(json(403, deletedBody)), false);
  assert.equal(await saysAccountDeleted(json(401, deletedBody)), true);
});

// What only the components wire up; what they decide is tested in lib:
// lib/deletedAccountSignOut.test.ts, lib/signInAgain.test.ts.
test('the app watches every request from its start; the watch, a screen and Delete Account go through the decisions in lib', () => {
  const main = readFileSync(join(SRC, 'main.tsx'), 'utf8');
  assert.ok(main.indexOf('installDeletedAccountWatch();') >= 0, 'main.tsx installs the watch');
  assert.ok(main.indexOf('installDeletedAccountWatch();') < main.indexOf('void bootstrap();'), 'before the app starts');
  const auth = readFileSync(join(SRC, 'auth', 'accountDeleted.ts'), 'utf8');
  assert.match(auth, /watchingForDeletedAccount\(window\.fetch\.bind\(window\), window\.location\.origin, \(authorization\) => \{\s*void signOutDeletedAccount\(authorization\);/);
  assert.match(auth, /signOutDeletedAccount\(authorization: string \| null\): Promise<void> \{\s*watchSignIns\(\);\s*return signOut\.signOut\(authorization\);\s*\}/);
  assert.match(auth, /addUserLoaded\(\(user\) => \{\s*void signOut\.loaded\(/);
  // The stored sign-in is removed by the sign-out's part alone, which lib decides on.
  assert.equal(auth.match(/removeUser\(/g)?.length, 1);
  assert.match(auth, /remove: async \(\) => \{[^}]*await manager\.removeUser\(\);/);
  const couldntLoad = readFileSync(join(SRC, 'components', 'CouldntLoad.tsx'), 'utf8');
  assert.match(couldntLoad, /onSignedOut\(Date\.now\(\), \{ marks: readSignInMarks, accountDeleted: accountWasDeleted \}/);
  const dialog = readFileSync(join(SRC, 'components', 'DeleteAccountDialog.tsx'), 'utf8');
  assert.match(dialog, /await signOutDeletedAccount\(token \? `Bearer \$\{token\}` : null\);/);
  assert.doesNotMatch(dialog, /removeUser\(/);
});
