// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCOUNT_DELETION_UNAVAILABLE,
  accountDeletionAnswer,
  accountDeletionTitle,
  deleteAccount,
} from './account.ts';

interface Sent {
  url: string;
  init: RequestInit;
}

/** A fake chino-api: answers every request with [status] and [body] (JSON
 *  when an object, as writeJSON sends it; plain text when a string), and
 *  records what was sent. */
function fakeServer(status: number, body?: object | string) {
  const sent: Sent[] = [];
  const fetch = async (url: string, init: RequestInit): Promise<Response> => {
    sent.push({ url, init });
    if (body === undefined) return new Response(null, { status });
    if (typeof body === 'string') {
      return new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return { sent, fetch };
}

test('200: the account and its data are deleted', async () => {
  const server = fakeServer(200, { account: 'deleted', deleted: { progress: 12, watched: 30, watchlists: 2, likes: 4 } });
  assert.deepEqual(await deleteAccount({ token: 'tok-1', fetch: server.fetch }), { kind: 'deleted' });
  // The account was gone already: its data is, now, too.
  const gone = fakeServer(200, { account: 'gone', deleted: {} });
  assert.deepEqual(await deleteAccount({ token: 'tok-1', fetch: gone.fetch }), { kind: 'deleted' });
});

test('the request: DELETE /api/v1/me, the bearer in the header and never in the URL', async () => {
  const server = fakeServer(200, { account: 'deleted' });
  await deleteAccount({ token: 'tok-secret', fetch: server.fetch });

  assert.equal(server.sent.length, 1);
  const [{ url, init }] = server.sent;
  assert.equal(url, '/api/v1/me');
  assert.equal(init.method, 'DELETE');
  assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer tok-secret');
  assert.equal(url.includes('tok-secret'), false);
  assert.equal(init.body, undefined);
});

test('409: refused, in the server\'s words', async () => {
  const server = fakeServer(409, { error: 'refused', message: 'You are the last admin of this server: make someone else an admin first.' });
  assert.deepEqual(await deleteAccount({ token: 't', fetch: server.fetch }), {
    kind: 'refused',
    message: 'You are the last admin of this server: make someone else an admin first.',
  });
  // No message to show: still a refusal, said plainly.
  const bare = fakeServer(409);
  assert.deepEqual(await deleteAccount({ token: 't', fetch: bare.fetch }), {
    kind: 'refused',
    message: "This server won't delete your account.",
  });
});

test('501: not available on this server, whatever the body says', async () => {
  const server = fakeServer(501, {
    error: 'account_deletion_unavailable',
    message: 'Accounts are not deleted from the apps on this server: ask whoever runs it.',
  });
  assert.deepEqual(await deleteAccount({ token: 't', fetch: server.fetch }), {
    kind: 'unavailable',
    message: ACCOUNT_DELETION_UNAVAILABLE,
  });
  assert.equal(ACCOUNT_DELETION_UNAVAILABLE, "Deleting your account isn't available on this server — ask its administrator.");
});

test('502: nothing deleted - try again later, with the server\'s message', async () => {
  const server = fakeServer(502, {
    error: 'account_not_deleted',
    message: 'Your account could not be deleted right now, so nothing was. Try again later.',
  });
  const answer = await deleteAccount({ token: 't', fetch: server.fetch });
  assert.deepEqual(answer, {
    kind: 'failed',
    message: 'Your account could not be deleted right now, so nothing was. Try again later.',
  });
  assert.equal(answer.kind !== 'deleted' && accountDeletionTitle(answer), 'Try Again Later');
});

test('any other answer is a failure too, and only a JSON message is shown', async () => {
  const dataNotDeleted = fakeServer(500, { error: 'data_not_deleted', message: 'Your data could not be deleted, so nothing was. Try again later.' });
  assert.deepEqual(await deleteAccount({ token: 't', fetch: dataNotDeleted.fetch }), {
    kind: 'failed',
    message: 'Your data could not be deleted, so nothing was. Try again later.',
  });
  // A proxy's page, a plain-text error, an empty body: no server words.
  const proxy = fakeServer(502, '<html><body>502 Bad Gateway</body></html>');
  assert.deepEqual(await deleteAccount({ token: 't', fetch: proxy.fetch }), {
    kind: 'failed',
    message: "Your account couldn't be deleted right now (HTTP 502).",
  });
  const plain = fakeServer(503, 'upstream connect error\n');
  assert.deepEqual(await deleteAccount({ token: 't', fetch: plain.fetch }), {
    kind: 'failed',
    message: "Your account couldn't be deleted right now (HTTP 503).",
  });
  // A sign-in the server no longer takes.
  const expired = fakeServer(401, 'unauthorized\n');
  assert.deepEqual(await deleteAccount({ token: 't', fetch: expired.fetch }), {
    kind: 'failed',
    message: 'This server no longer accepts your sign-in. Sign in again, then try once more.',
  });
});

test('only a 200 signs out: another 2xx is no proof the account is gone', () => {
  for (const status of [201, 202, 204]) {
    assert.equal(accountDeletionAnswer(status, null).kind, 'failed', String(status));
  }
});

test('a request that never reaches the server is a failure, not a throw', async () => {
  const offline = async (): Promise<Response> => {
    throw new TypeError('Failed to fetch');
  };
  assert.deepEqual(await deleteAccount({ token: 't', fetch: offline }), {
    kind: 'failed',
    message: "The server couldn't be reached.",
  });
});

test('every answer but a deletion has a short title-case heading', () => {
  assert.equal(accountDeletionTitle({ kind: 'refused', message: 'x' }), 'Not Deleted');
  assert.equal(accountDeletionTitle({ kind: 'unavailable', message: 'x' }), 'Not Available');
  assert.equal(accountDeletionTitle({ kind: 'failed', message: 'x' }), 'Try Again Later');
});

test('a long server message is cut to a few sentences', async () => {
  const server = fakeServer(409, { error: 'refused', message: 'x'.repeat(1000) });
  const answer = await deleteAccount({ token: 't', fetch: server.fetch });
  assert.equal(answer.kind, 'refused');
  assert.equal(answer.kind === 'refused' && answer.message.length, 300);
});
