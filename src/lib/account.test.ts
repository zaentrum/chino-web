// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCOUNT_DELETION_UNAVAILABLE,
  accountDeletionAnswer,
  accountDeletionTitle,
  deleteAccount,
  ACCOUNT_DELETION_ANOTHER_ACCOUNT,
  deleteNamedAccount,
} from './account.ts';
import { tabAccount } from './tabAccount.ts';

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

/** An access token as the identity provider issues it: header.payload.signature, base64url. */
function tokenFor(sub: string, n = 1): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'RS256' })}.${b64({ sub, n })}.signature`;
}

/** A check that lets every bearer write: the tests of the dialog's own comparison. */
const anyone = () => true;

/** The bearer a request was sent with. */
function bearerOf(sent: Sent): string | null {
  return new Headers(sent.init.headers).get('authorization');
}

test("16.5.6 a tab never reloaded, its token almost run out: the renewal brings back the next account's sign-in, and nothing is deleted", async () => {
  // The dialog names first; in another tab first signed out and second
  // signed in since, so the browser's sign-in, which the renewal reads, is second's.
  const server = fakeServer(200, { account: 'deleted' });
  let renewals = 0;
  for (const expiresInSec of [30, 5, 0, -10]) {
    const attempt = await deleteNamedAccount({
      named: { accessToken: tokenFor('first'), expiresInSec },
      mayWrite: anyone,
      renew: async () => {
        renewals++;
        return tokenFor('second');
      },
      fetch: server.fetch,
    });
    assert.deepEqual(attempt, { kind: 'another-account' }, String(expiresInSec));
  }
  assert.equal(renewals, 4);
  assert.deepEqual(server.sent, []);
  // Nor where either subject can't be read.
  for (const [named, renewed] of [
    [tokenFor('first'), 'opaque-token'],
    ['opaque-token', tokenFor('first')],
  ]) {
    const attempt = await deleteNamedAccount({ named: { accessToken: named, expiresInSec: 10 }, renew: async () => renewed, mayWrite: anyone, fetch: server.fetch });
    assert.deepEqual(attempt, { kind: 'another-account' });
  }
  assert.deepEqual(server.sent, []);
});

test('16.5.6 renewed for the same account, Delete account deletes with the renewed token; with time left, with its own', async () => {
  const server = fakeServer(200, { account: 'deleted' });
  const renewed = await deleteNamedAccount({
    named: { accessToken: tokenFor('first', 1), expiresInSec: 20 },
    mayWrite: anyone,
    renew: async () => tokenFor('first', 2),
    fetch: server.fetch,
  });
  assert.deepEqual(renewed, { kind: 'answered', bearer: tokenFor('first', 2), answer: { kind: 'deleted' } });
  let renewals = 0;
  const own = await deleteNamedAccount({
    named: { accessToken: tokenFor('first', 1), expiresInSec: 31 },
    mayWrite: anyone,
    renew: async () => {
      renewals++;
      return tokenFor('second');
    },
    fetch: server.fetch,
  });
  assert.deepEqual(own, { kind: 'answered', bearer: tokenFor('first', 1), answer: { kind: 'deleted' } });
  assert.equal(renewals, 0);
  assert.deepEqual(server.sent.map(bearerOf), [`Bearer ${tokenFor('first', 2)}`, `Bearer ${tokenFor('first', 1)}`]);
});

test('16.5.6 a renewal that fails or brings nothing deletes with the named token, as before; without one, nothing is sent', async () => {
  const server = fakeServer(200, { account: 'deleted' });
  for (const renew of [async () => { throw new Error('offline'); }, async () => null, async () => undefined]) {
    const attempt = await deleteNamedAccount({ named: { accessToken: tokenFor('first'), expiresInSec: 1 }, renew, mayWrite: anyone, fetch: server.fetch });
    assert.deepEqual(attempt, { kind: 'answered', bearer: tokenFor('first'), answer: { kind: 'deleted' } });
  }
  assert.equal(server.sent.length, 3);
  const none = await deleteNamedAccount({ named: null, renew: async () => null, mayWrite: anyone, fetch: server.fetch });
  assert.equal(none.kind, 'answered');
  assert.equal(none.kind === 'answered' && none.answer.kind, 'failed');
  assert.equal(server.sent.length, 3);
});

test("16.5.6 Delete account confirmed after the tab took up the next account's sign-in: the dialog's user is that account's, minutes left, and nothing is deleted", async () => {
  // Tab 1 was loaded as first, and the dialog opened with DELETE typed.
  // Another tab signed in as second, tab 1's renewal brought second's
  // sign-in, and the provider re-rendered the dialog with it before the
  // page went: the press names second, its token with 300 s left.
  const tab = tabAccount({ forgetTab: () => undefined, reload: () => undefined });
  tab.loaded(tokenFor('first'));
  tab.loaded(tokenFor('second'));
  const server = fakeServer(200, { account: 'deleted' });
  let renewals = 0;
  const attempt = await deleteNamedAccount({
    named: { accessToken: tokenFor('second'), expiresInSec: 300 },
    renew: async () => {
      renewals++;
      return tokenFor('second', 2);
    },
    mayWrite: tab.mayWrite,
    fetch: server.fetch,
  });
  assert.deepEqual(attempt, { kind: 'another-account' });
  assert.deepEqual(server.sent, []);
  // With 30 s or less left, not even renewed: a renewal would read the store again.
  const late = await deleteNamedAccount({
    named: { accessToken: tokenFor('second'), expiresInSec: 10 },
    renew: async () => {
      renewals++;
      return tokenFor('second', 2);
    },
    mayWrite: tab.mayWrite,
    fetch: server.fetch,
  });
  assert.deepEqual(late, { kind: 'another-account' });
  assert.deepEqual(server.sent, []);
  assert.equal(renewals, 0);
});

test("16.5.6 the token the dialog would send is checked against the tab's account, its own or the renewed one", async () => {
  const server = fakeServer(200, { account: 'deleted' });
  // The tab is first's; a renewal of first's, with this tab leaving meanwhile, sends nothing.
  let leaving = false;
  const mayWrite = (bearer: string) => !leaving && bearer.split('.')[1] === tokenFor('first').split('.')[1];
  const firstRenewed = tokenFor('first');
  const attempt = await deleteNamedAccount({
    named: { accessToken: tokenFor('first'), expiresInSec: 10 },
    renew: async () => {
      leaving = true;
      return firstRenewed;
    },
    mayWrite,
    fetch: server.fetch,
  });
  assert.deepEqual(attempt, { kind: 'another-account' });
  assert.deepEqual(server.sent, []);
  // The tab's own account, staying: deleted as before.
  const tab = tabAccount({ forgetTab: () => undefined, reload: () => undefined });
  tab.loaded(tokenFor('first'));
  const own = await deleteNamedAccount({ named: { accessToken: tokenFor('first'), expiresInSec: 300 }, renew: async () => null, mayWrite: tab.mayWrite, fetch: server.fetch });
  assert.equal(own.kind === 'answered' && own.answer.kind, 'deleted');
  assert.equal(server.sent.length, 1);
});

test('16.5.6 where nothing was sent as another account is signed in now, the dialog says so in the words of 16.C16', () => {
  assert.equal(ACCOUNT_DELETION_ANOTHER_ACCOUNT, 'Another account is signed in now. Open Delete Account again.');
  assert.equal(accountDeletionTitle({ kind: 'failed', message: ACCOUNT_DELETION_ANOTHER_ACCOUNT }), 'Try Again Later');
});

