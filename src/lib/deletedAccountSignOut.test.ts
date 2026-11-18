// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bearerToken,
  deletedAccountSignOut,
  isStoredAccount,
  type SignOutParts,
  type StoredSignIn,
} from './deletedAccountSignOut.ts';
import { watchingForDeletedAccount } from './deletedAccountWatch.ts';
import { BINGE_SESSION_PREFIX, FORGET_ARTWORK, forgetBrowserData, forgetTabData } from './accountData.ts';
import { STREAM_TOKEN_KEY } from './streamTokenCache.ts';
import { HERO_POOL_KEY } from './heroPool.ts';
import { gateScreen } from './authGate.ts';

const ORIGIN = 'https://media.example.org';

/** A bearer as the identity provider issues it: header.payload.signature, base64url. */
function bearerFor(sub: string, n = 1): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'RS256' })}.${b64({ sub, n })}.signature`;
}

function signIn(sub: string, n = 1): StoredSignIn {
  return { sub, accessToken: bearerFor(sub, n) };
}

/** The browser: one stored sign-in for all its tabs. */
function browser(stored: StoredSignIn | null) {
  return { stored };
}

/** A Storage with these entries. */
function storage(entries: Record<string, string> = {}) {
  const data = new Map(Object.entries(entries));
  return {
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => {
      data.delete(k);
    },
    keys: () => [...data.keys()].sort(),
  };
}

/** A tab of `b`: the sign-out over parts that note, in order, what they do.
 *  `parts` puts others in their place. */
function tab(
  b: { stored: StoredSignIn | null },
  opts: { removeFails?: boolean; stored?: () => Promise<StoredSignIn | null>; parts?: Partial<SignOutParts> } = {},
) {
  const log: string[] = [];
  const parts: SignOutParts = {
    mark: () => log.push('mark'),
    stopRenewal: () => log.push('stop renewal'),
    forgetTab: () => log.push('forget tab'),
    forgetBrowser: () => log.push('forget browser'),
    stored: async () => {
      log.push('stored?');
      return opts.stored ? opts.stored() : b.stored;
    },
    remove: async () => {
      log.push('remove');
      if (opts.removeFails) throw new Error('storage refused');
      b.stored = null;
    },
    reload: () => log.push('reload'),
    ...opts.parts,
  };
  return { log, signOut: deletedAccountSignOut(parts) };
}

/** What each sign-out does before it decides; what it does once it removed the account's sign-in. */
const SIGN_OUT = ['mark', 'stop renewal', 'forget tab', 'stored?'];
const REMOVED = ['remove', 'mark', 'forget browser'];

/** `p`, or a failure after a second: a sign-out that waits forever fails the test instead of hanging it. */
function settles<T>(p: Promise<T>, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} never settled`)), 1000);
  });
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}

test("16.5.6 the mark first, before the caller has the answer; then whose sign-in it is, and only then what the browser keeps goes", async () => {
  const b = browser(signIn('first'));
  const t = tab(b);
  const done = t.signOut.signOut(`Bearer ${bearerFor('first')}`);
  // At once, before anything is awaited: the screen that gets the 401 next
  // sees the mark; the tab's own part is forgotten, and the store is being read.
  assert.deepEqual(t.log, SIGN_OUT);
  await done;
  assert.deepEqual(t.log, [...SIGN_OUT, ...REMOVED]);
  assert.equal(b.stored, null);
});

test("16.5.6 another account's stored sign-in stays: a tab never reloaded refused for the account it still holds", async () => {
  // Tabs 1 and 2 are signed in as first.
  const b = browser(signIn('first'));
  const tab1 = tab(b);
  const firstsBearer = b.stored!.accessToken!;
  // In tab 2, first is deleted and second signs in: the store holds second.
  b.stored = signIn('second');
  // Tab 1 was never reloaded and still holds first's token. It sends a write
  // with it, and chino-api answers 401 account_deleted.
  const fetchImpl = (async () =>
    new Response(JSON.stringify({ error: 'account_deleted' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch;
  let signingOut: Promise<void> = Promise.resolve();
  const watched = watchingForDeletedAccount(fetchImpl, ORIGIN, (authorization) => {
    signingOut = tab1.signOut.signOut(authorization);
  });
  const res = await watched('/api/v1/me/likes/title-1', { method: 'PUT', headers: { Authorization: `Bearer ${firstsBearer}` } });
  assert.equal(res.status, 401);
  await signingOut;
  // second's sign-in stays, and so does what the browser keeps; tab 1 loads the app anew, which reads it.
  assert.deepEqual(b.stored, signIn('second'));
  assert.deepEqual(tab1.log, [...SIGN_OUT, 'reload']);
});

test("16.5.6 the two tabs: the stale tab leaves the binge sessions and the artwork cache of the account signed in since alone, late 401s too", async () => {
  const b = browser(signIn('second'));
  // What the browser keeps, for all its tabs: second's binge session since.
  const local = storage({ [`${BINGE_SESSION_PREFIX}series-2`]: '{"episodeId":"e3","ts":2}', 'chino:settings:v1': '{}' });
  // What tab 1 keeps, for first, the account it held.
  const session = storage({ [STREAM_TOKEN_KEY]: '{"sub":"first"}', [HERO_POOL_KEY]: '{"at":1}', 'chino:subtitleLanguages': '["en"]' });
  const asked: unknown[] = [];
  const tab1 = tab(b, {
    parts: {
      forgetTab: () => forgetTabData(session),
      forgetBrowser: () =>
        forgetBrowserData(local, (message) => {
          asked.push(message);
        }),
    },
  });
  const bearer = `Bearer ${bearerFor('first')}`;
  await tab1.signOut.signOut(bearer);
  await tab1.signOut.signOut(bearer);
  await tab1.signOut.signOut(bearer);
  assert.deepEqual(local.keys(), [`${BINGE_SESSION_PREFIX}series-2`, 'chino:settings:v1']);
  assert.deepEqual(asked, []);
  // Tab 1's own part was first's, and went.
  assert.deepEqual(session.keys(), ['chino:subtitleLanguages']);
  assert.deepEqual(b.stored, signIn('second'));
});

test("16.5.6 where the stored sign-in was the deleted account's or nobody's, what the browser keeps goes, after the removal", async () => {
  for (const stored of [signIn('first'), null]) {
    const b = browser(stored);
    const local = storage({ [`${BINGE_SESSION_PREFIX}series-1`]: '{"episodeId":"e1","ts":1}', 'chino:settings:v1': '{}' });
    const asked: unknown[] = [];
    let removedFirst = false;
    const t = tab(b, {
      parts: {
        forgetBrowser: () => {
          removedFirst = b.stored === null;
          forgetBrowserData(local, (message) => {
            asked.push(message);
          });
        },
      },
    });
    await t.signOut.signOut(`Bearer ${bearerFor('first')}`);
    assert.equal(removedFirst, true, String(stored?.sub));
    assert.deepEqual(local.keys(), ['chino:settings:v1']);
    assert.deepEqual(asked, [{ type: FORGET_ARTWORK }]);
  }
});

test('16.5.6 a service worker whose registration never settles stops neither the removal nor Delete account, which goes on', async () => {
  const b = browser(signIn('first'));
  const local = storage({ [`${BINGE_SESSION_PREFIX}series-1`]: '{}' });
  const t = tab(b, { parts: { forgetBrowser: () => forgetBrowserData(local, () => new Promise(() => undefined)) } });
  // The dialog waits for this sign-out (components/DeleteAccountDialog.tsx).
  await settles(t.signOut.signOut(`Bearer ${bearerFor('first')}`), 'the sign-out');
  assert.equal(b.stored, null);
  assert.deepEqual(local.keys(), []);
  // Nor where it loads anew: nobody's sign-in stored.
  const nobody = tab(browser(null), { parts: { forgetBrowser: () => forgetBrowserData(local, () => new Promise(() => undefined)) } });
  await settles(nobody.signOut.signOut(`Bearer ${bearerFor('first')}`), 'the sign-out');
  assert.deepEqual(nobody.log.slice(-1), ['reload']);
});

test('16.5.6 a renewal that lands after the sign-out, and a screen that takes the mark away meanwhile: it still ends on "account deleted"', async () => {
  // The screen: the gate's own choice (lib/authGate.ts) over the sign-in it
  // holds and the tab's mark; it takes the mark away whenever it holds one.
  const screen = { user: null as StoredSignIn | null, marked: false };
  const shows = () =>
    gateScreen({ leaving: false, isLoading: false, isAuthenticated: screen.user !== null, error: false, accountDeleted: screen.marked });
  const b = browser(signIn('first'));
  const t = tab(b, {
    parts: {
      mark: () => {
        screen.marked = true;
      },
      stored: async () => {
        // A render while the store is read: the screen holds the renewed sign-in and forgets the mark.
        if (screen.user) screen.marked = false;
        return b.stored;
      },
      remove: async () => {
        b.stored = null;
        screen.user = null;
      },
    },
  });
  await t.signOut.signOut(`Bearer ${bearerFor('first')}`);
  assert.equal(shows(), 'account-deleted');
  // The renewal under way comes back: it stores first's sign-in again, and the screen holds it.
  b.stored = signIn('first', 2);
  screen.user = b.stored;
  screen.marked = false;
  assert.equal(shows(), 'app');
  await t.signOut.loaded(b.stored);
  assert.equal(b.stored, null);
  // Not the splash, after which the gate sends to the sign-in page.
  assert.equal(shows(), 'account-deleted');
});

test('16.5.6 a bearer that cannot be read is not taken for the stored sign-in, unless it is its very token', async () => {
  for (const authorization of ['Bearer opaque-token', 'Bearer a.b.c', 'Basic Zmlyc3Q6eA==', '', null]) {
    const b = browser(signIn('second'));
    const t = tab(b);
    await t.signOut.signOut(authorization);
    assert.deepEqual(b.stored, signIn('second'), String(authorization));
    assert.deepEqual(t.log, [...SIGN_OUT, 'reload'], String(authorization));
  }
  // The token the store holds, opaque or not, is the stored account's.
  const b = browser({ sub: 'first', accessToken: 'opaque-token' });
  const t = tab(b);
  await t.signOut.signOut('Bearer opaque-token');
  assert.equal(b.stored, null);
  assert.deepEqual(t.log, [...SIGN_OUT, ...REMOVED]);
});

test('16.5.6 nobody signed in in the browser: nothing to remove; what the browser keeps goes, and the tab loads the app anew', async () => {
  const b = browser(null);
  const t = tab(b);
  await t.signOut.signOut(`Bearer ${bearerFor('first')}`);
  assert.equal(b.stored, null);
  assert.deepEqual(t.log, [...SIGN_OUT, 'forget browser', 'reload']);
});

test('16.5.6 one sign-out at a time: the 401s that come together are one; once it ends the next can run, a failed one too', async () => {
  const b = browser(signIn('first'));
  const t = tab(b);
  const bearer = `Bearer ${bearerFor('first')}`;
  await Promise.all([t.signOut.signOut(bearer), t.signOut.signOut(bearer), t.signOut.signOut(bearer)]);
  assert.deepEqual(t.log, [...SIGN_OUT, ...REMOVED]);

  // A removal that fails loads the app anew, and the next sign-out runs.
  const b2 = browser(signIn('first'));
  const t2 = tab(b2, { removeFails: true });
  await t2.signOut.signOut(bearer);
  assert.deepEqual(t2.log, [...SIGN_OUT, ...REMOVED, 'reload']);
  await t2.signOut.signOut(bearer);
  assert.deepEqual(t2.log, [...SIGN_OUT, ...REMOVED, 'reload', ...SIGN_OUT, ...REMOVED, 'reload']);

  // One that throws ends too: the app loads anew, and the next runs.
  const b3 = browser(signIn('first'));
  let calls = 0;
  const t3 = tab(b3, {
    stored: async () => {
      calls++;
      if (calls === 1) throw new Error('storage off');
      return b3.stored;
    },
  });
  await t3.signOut.signOut(bearer);
  assert.deepEqual(t3.log, [...SIGN_OUT, 'reload']);
  await t3.signOut.signOut(bearer);
  assert.equal(b3.stored, null);
});

test('16.5.6 a 401 for the account this tab signed out already, which the store no longer holds, changes nothing more', async () => {
  const b = browser(signIn('first'));
  const t = tab(b);
  const bearer = `Bearer ${bearerFor('first')}`;
  await t.signOut.signOut(bearer);
  // A write that was under way answers later.
  await t.signOut.signOut(bearer);
  assert.deepEqual(t.log, [...SIGN_OUT, ...REMOVED, ...SIGN_OUT]);
  // Nor when second has signed in in another tab since: this tab stays signed out.
  b.stored = signIn('second');
  await t.signOut.signOut(bearer);
  assert.deepEqual(b.stored, signIn('second'));
  assert.deepEqual(t.log, [...SIGN_OUT, ...REMOVED, ...SIGN_OUT, ...SIGN_OUT]);
});

test('16.5.6 a renewal under way that stores the deleted account again is signed out again; the mark with it', async () => {
  const b = browser(signIn('first'));
  const t = tab(b);
  await t.signOut.signOut(`Bearer ${bearerFor('first')}`);
  assert.equal(b.stored, null);
  // The renewal that was under way comes back and stores first's sign-in again.
  b.stored = signIn('first', 2);
  await t.signOut.loaded(b.stored);
  assert.equal(b.stored, null);
  assert.deepEqual(t.log, [...SIGN_OUT, ...REMOVED, ...SIGN_OUT, ...REMOVED]);
  // A 401 after that runs again too: nothing latches.
  b.stored = signIn('first', 3);
  await t.signOut.signOut(`Bearer ${bearerFor('first', 3)}`);
  assert.equal(b.stored, null);
});

test('16.5.6 a renewal that lands while the sign-out runs is checked once it ends', async () => {
  const b = browser(signIn('first'));
  let answer!: (s: StoredSignIn | null) => void;
  let first = true;
  const t = tab(b, {
    stored: () => {
      if (!first) return Promise.resolve(b.stored);
      first = false;
      return new Promise((resolve) => {
        answer = resolve;
      });
    },
  });
  const signingOut = t.signOut.signOut(`Bearer ${bearerFor('first')}`);
  await new Promise((r) => setTimeout(r, 0));
  // The renewal stores first's sign-in and the tab loads it, while the sign-out waits for the store.
  b.stored = signIn('first', 2);
  const checked = t.signOut.loaded(b.stored);
  answer(b.stored);
  await signingOut;
  await checked;
  // The sign-out removed it; the check after it finds the store empty, and
  // the tab, which may hold the renewed sign-in in memory, loads anew.
  assert.equal(b.stored, null);
  assert.deepEqual(t.log, [...SIGN_OUT, ...REMOVED, ...SIGN_OUT, 'forget browser', 'reload']);
});

test('a sign-in of another account, or before any sign-out, is left alone', async () => {
  const b = browser(signIn('second'));
  const t = tab(b);
  await t.signOut.loaded(signIn('second'));
  assert.deepEqual(t.log, []);
  await t.signOut.loaded({ sub: null, accessToken: 'opaque-token' });
  assert.deepEqual(t.log, []);
  // first is signed out here; second's sign-in, loaded after, stays.
  const b2 = browser(signIn('first'));
  const t2 = tab(b2);
  await t2.signOut.signOut(`Bearer ${bearerFor('first')}`);
  b2.stored = signIn('second');
  await t2.signOut.loaded(b2.stored);
  assert.deepEqual(b2.stored, signIn('second'));
  assert.deepEqual(t2.log, [...SIGN_OUT, ...REMOVED]);
});

test('the bearer of an Authorization, and whether a stored sign-in is its account', () => {
  assert.equal(bearerToken('Bearer abc'), 'abc');
  assert.equal(bearerToken('bearer  abc '), 'abc');
  assert.equal(bearerToken('Basic abc'), null);
  assert.equal(bearerToken('Bearer'), null);
  assert.equal(bearerToken(null), null);
  const stored = signIn('first');
  assert.equal(isStoredAccount(stored, { token: bearerFor('first', 9), sub: 'first' }), true);
  assert.equal(isStoredAccount(stored, { token: bearerFor('second'), sub: 'second' }), false);
  assert.equal(isStoredAccount(stored, { token: stored.accessToken, sub: null }), true);
  assert.equal(isStoredAccount(stored, { token: 'opaque-token', sub: null }), false);
  assert.equal(isStoredAccount(null, { token: stored.accessToken, sub: 'first' }), false);
  assert.equal(isStoredAccount({ sub: null, accessToken: null }, { token: null, sub: null }), false);
});
