// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tabAccount } from './tabAccount.ts';
import { markWatched, saveProgress, type PlayerWriter } from './playerWrites.ts';

const SRC = join(import.meta.dirname, '..');

/** An access token as the identity provider issues it: header.payload.signature, base64url. */
function tokenFor(sub: string, n = 1): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'RS256' })}.${b64({ sub, n })}.signature`;
}

/** A tab: its account, how often it loaded the app anew, what it did in
 *  order, and its player's writes as they went out. */
function tab() {
  let reloads = 0;
  const did: string[] = [];
  const account = tabAccount({
    forgetTab: () => did.push('forget tab'),
    reload: () => {
      reloads++;
      did.push('reload');
    },
  });
  const sent: string[] = [];
  const player: PlayerWriter = {
    mayWrite: (bearer) => account.mayWrite(bearer),
    send: async (url, init) => {
      const auth = new Headers(init.headers).get('authorization') ?? '';
      sent.push(`${init.method} ${url} as ${subjectIn(auth)}`);
    },
  };
  return { account, player, sent, did, reloads: () => reloads };
}

function subjectIn(authorization: string): string {
  const payload = authorization.replace(/^Bearer /, '').split('.')[1] ?? '';
  try {
    return (JSON.parse(Buffer.from(payload, 'base64url').toString()) as { sub?: string }).sub ?? '?';
  } catch {
    return '?';
  }
}

test('the first sign-in a tab loads is its account; a renewal of the same account changes nothing', () => {
  const t = tab();
  t.account.loaded(tokenFor('first', 1));
  t.account.loaded(tokenFor('first', 2));
  t.account.loaded(tokenFor('first', 3));
  assert.equal(t.reloads(), 0);
  // The player goes on writing with the renewed token, and with the one before.
  assert.equal(saveProgress(t.player, tokenFor('first', 3), 'title-1', 120, 3600), true);
  assert.equal(markWatched(t.player, tokenFor('first', 2), 'title-1'), true);
  assert.deepEqual(t.sent, ['POST /api/v1/items/title-1/progress as first', 'POST /api/v1/me/items/title-1/watched as first']);
});

test("a loaded sign-in of another account loads the app anew, once, and the player sends nothing more", () => {
  const t = tab();
  t.account.loaded(tokenFor('first'));
  t.account.loaded(tokenFor('second'));
  assert.equal(t.reloads(), 1);
  // Neither under the other account, nor, from the old screen, under the tab's own.
  assert.equal(saveProgress(t.player, tokenFor('second'), 'title-1', 130, 3600), false);
  assert.equal(markWatched(t.player, tokenFor('second'), 'title-1'), false);
  assert.equal(saveProgress(t.player, tokenFor('first'), 'title-1', 130, 3600), false);
  assert.equal(markWatched(t.player, tokenFor('first'), 'title-1'), false);
  assert.deepEqual(t.sent, []);
  // Loaded again, either way: still the one reload under way.
  t.account.loaded(tokenFor('second', 2));
  t.account.loaded(tokenFor('first', 2));
  assert.equal(t.reloads(), 1);
});

test("a write with another account's bearer never goes, even before the tab has seen that sign-in loaded", () => {
  const t = tab();
  t.account.loaded(tokenFor('first'));
  assert.equal(saveProgress(t.player, tokenFor('second'), 'title-1', 10, 3600), false);
  assert.equal(markWatched(t.player, tokenFor('second'), 'title-1'), false);
  assert.equal(t.account.mayWrite('not-a-jwt'), false);
  assert.equal(t.account.mayWrite(''), false);
  assert.equal(t.account.mayWrite(null), false);
  assert.deepEqual(t.sent, []);
  // The tab's own account still writes.
  assert.equal(saveProgress(t.player, tokenFor('first', 2), 'title-1', 10, 3600), true);
  assert.equal(t.reloads(), 0);
});

test("a sign-in whose subject can't be read changes nothing; before one names an account, writes go as before", () => {
  const t = tab();
  t.account.loaded('not-a-jwt');
  t.account.loaded(null);
  t.account.loaded(undefined);
  assert.equal(t.reloads(), 0);
  assert.equal(t.account.mayWrite(tokenFor('first')), true);
  t.account.loaded(tokenFor('first'));
  t.account.loaded('not-a-jwt');
  assert.equal(t.reloads(), 0);
  assert.equal(t.account.mayWrite(tokenFor('first')), true);
});

test("the player's writes go out as before for the tab's account", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const w: PlayerWriter = {
    mayWrite: () => true,
    send: async (url, init) => {
      calls.push({ url, init });
    },
  };
  assert.equal(saveProgress(w, 't', 'title-1', 61, 3600), true);
  assert.equal(markWatched(w, 't', 'title 2'), true);
  assert.deepEqual(calls, [
    {
      url: '/api/v1/items/title-1/progress',
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t' },
        body: JSON.stringify({ position_sec: 61, duration_sec: 3600 }),
        keepalive: true,
      },
    },
    { url: '/api/v1/me/items/title%202/watched', init: { method: 'POST', headers: { Authorization: 'Bearer t' } } },
  ]);
  // A send that fails, at once or later, is dropped as before.
  const failing: PlayerWriter = {
    mayWrite: () => true,
    send: () => {
      throw new Error('offline');
    },
  };
  assert.equal(saveProgress(failing, 't', 'title-1', 61, 3600), true);
  const rejecting: PlayerWriter = { mayWrite: () => true, send: () => Promise.reject(new Error('offline')) };
  assert.equal(markWatched(rejecting, 't', 'title-1'), true);
  await new Promise((r) => setTimeout(r, 0));
});

test('two tabs, end to end: one signing out and in as another account never makes the other write as it', () => {
  // The browser's one stored sign-in, which every tab's renewal reads.
  const browser = { stored: tokenFor('first', 1) };
  const renew = (t: ReturnType<typeof tab>, n: number) => {
    // A renewal goes with the stored sign-in and brings back that account's token.
    const sub = subjectIn(`Bearer ${browser.stored}`);
    const renewed = tokenFor(sub, n);
    browser.stored = renewed;
    t.account.loaded(renewed);
    return renewed;
  };
  // Tabs 1 and 2 load as first; tab 1 plays a title.
  const tab1 = tab();
  tab1.account.loaded(browser.stored);
  let tab2 = tab();
  tab2.account.loaded(browser.stored);
  let tab1Token = browser.stored;
  assert.equal(saveProgress(tab1.player, tab1Token, 'title-1', 100, 3600), true);
  // Tab 1 renews: the same account, nothing changes.
  tab1Token = renew(tab1, 2);
  assert.equal(saveProgress(tab1.player, tab1Token, 'title-1', 110, 3600), true);
  // In tab 2, first signs out and second signs in: the sign-in loads the app
  // anew in tab 2, whose first sign-in is second's, and the store holds it.
  browser.stored = tokenFor('second', 1);
  tab2 = tab();
  tab2.account.loaded(browser.stored);
  assert.equal(saveProgress(tab2.player, browser.stored, 'title-9', 5, 1800), true);
  // Tab 1 was never reloaded. Its renewal reads the store and brings back second's sign-in.
  tab1Token = renew(tab1, 3);
  assert.equal(tab1.reloads(), 1);
  // Its mounted player, with either token, sends nothing more.
  assert.equal(saveProgress(tab1.player, tab1Token, 'title-1', 120, 3600), false);
  assert.equal(markWatched(tab1.player, tab1Token, 'title-1'), false);
  assert.equal(saveProgress(tab1.player, tokenFor('first', 2), 'title-1', 120, 3600), false);
  assert.deepEqual(tab1.sent, ['POST /api/v1/items/title-1/progress as first', 'POST /api/v1/items/title-1/progress as first']);
  // Tab 2 is second's, from its start.
  assert.deepEqual(tab2.sent, ['POST /api/v1/items/title-9/progress as second']);
  assert.equal(tab2.reloads(), 0);
});

test("before it loads anew, the tab forgets its account's stream token and hero pool, so the next account's home doesn't show them", () => {
  const t = tab();
  t.account.loaded(tokenFor('first'));
  t.account.loaded(tokenFor('first', 2));
  assert.deepEqual(t.did, []);
  t.account.loaded(tokenFor('second'));
  assert.deepEqual(t.did, ['forget tab', 'reload']);
  t.account.loaded(tokenFor('second', 2));
  assert.deepEqual(t.did, ['forget tab', 'reload']);
});

test('the gate hears once that the tab loads anew, before the old screens would render the other account', () => {
  const t = tab();
  const heard: string[] = [];
  const stop = t.account.subscribe(() => heard.push(`leaving ${t.account.leaving()} after ${t.did.length}`));
  t.account.loaded(tokenFor('first'));
  t.account.loaded(tokenFor('first', 2));
  assert.equal(t.account.leaving(), false);
  assert.deepEqual(heard, []);
  t.account.loaded(tokenFor('second'));
  t.account.loaded(tokenFor('third'));
  assert.equal(t.account.leaving(), true);
  // Told before the tab's data goes and the page is replaced.
  assert.deepEqual(heard, ['leaving true after 0']);
  stop();
  const other = tab();
  let calls = 0;
  other.account.subscribe(() => calls++)();
  other.account.loaded(tokenFor('first'));
  other.account.loaded(tokenFor('second'));
  assert.equal(calls, 0);
});

// What only the app wires up, read from its source; what it decides is above.
test("every sign-in a tab loads is checked; the gate gives way; the player's, the Zap's and the reports' writes check; the tab's data goes", () => {
  const oidc = readFileSync(join(SRC, 'auth', 'oidc.ts'), 'utf8');
  const made = oidc.indexOf('manager = new UserManager(');
  const added = oidc.indexOf('manager.events.addUserLoaded((user) => tabLoaded(user.access_token));');
  assert.ok(made >= 0 && added > made, 'the UserManager checks each sign-in it loads');
  assert.ok(added < oidc.indexOf('userManager: manager,'), 'before the provider has it');
  const gate = readFileSync(join(SRC, 'auth', 'AuthGate.tsx'), 'utf8');
  assert.match(gate, /useLayoutEffect\(\(\) => \{\s*if \(auth\.user\) tabLoaded\(auth\.user\.access_token\);\s*\}, \[auth\.user\]\);/);
  const player = readFileSync(join(SRC, 'components', 'PlayerPage.tsx'), 'utf8');
  assert.match(player, /mayWrite: tabMayWrite,/);
  assert.match(player, /if \(!markWatched\(PLAYER_WRITES, token, itemId\)\) return;\s*markedWatchedRef\.current = true;/);
  assert.match(player, /saveProgress\(PLAYER_WRITES, token, itemId, pos, total\);/);
  assert.match(player, /if \(!q\.length \|\| !token \|\| !tabMayWrite\(token\)\) return;/);
  assert.match(player, /trailerPlayReportedRef\.current \|\| !token \|\| !tabMayWrite\(token\)\) return;/);
  // No write of its own around the check.
  assert.doesNotMatch(player, /fetch\(`\/api\/v1\/me\/items\/[^`]*\/watched`/);
  assert.equal(player.match(/fetch\(`\/api\/v1\/items\/\$\{itemId\}\/progress`/g)?.length, 1, 'the resume read alone');
  // The gate gives way once the tab leaves; the tab forgets its data before it loads anew, and at sign out.
  assert.match(gate, /const leaving = useTabLeaving\(\);/);
  assert.match(gate, /const screen = gateScreen\(\{\s*leaving,/);
  assert.match(gate, /if \(screen !== 'app'\) \{/);
  const bound = readFileSync(join(SRC, 'auth', 'tabAccount.ts'), 'utf8');
  assert.match(bound, /tabAccount\(\{\s*forgetTab: forgetTabAccountData,\s*reload: \(\) => window\.location\.replace\(toApp\('\/'\)\),/);
  for (const file of [['components', 'Header.tsx'], ['components', 'ProfilePage.tsx']]) {
    const source = readFileSync(join(SRC, ...file), 'utf8');
    assert.match(source, /forgetTabAccountData\(\);\s*void auth\.signoutRedirect\(\);/, file.join('/'));
    // The browser's copy of the account's Separate movies and shows goes too.
    assert.match(source, /forgetWatchlistChoice\(auth\.user\?\.access_token\);\s*forgetTabAccountData\(\);/, file.join('/'));
    assert.doesNotMatch(source, /forgetStreamToken/, file.join('/'));
  }
  // The Zap's events and prewarm, and the bug reports, check too.
  const zapEvents = readFileSync(join(SRC, 'hooks', 'useZapTelemetry.ts'), 'utf8');
  assert.match(zapEvents, /if \(!tabMayWrite\(token\)\) return;\s*const events = queueRef\.current\.splice/);
  const zap = readFileSync(join(SRC, 'components', 'sections', 'ZapSection.tsx'), 'utf8');
  assert.match(zap, /window\.setTimeout\(\(\) => \{\s*\/\/[^\n]*\n\s*if \(!tabMayWrite\(token\)\) return;\s*prewarmedRef/);
  const feedback = readFileSync(join(SRC, 'lib', 'feedback.ts'), 'utf8');
  assert.match(feedback, /const token = reportBearer\(accessToken\(\), tabMayWrite\);/);
  assert.ok(feedback.indexOf('reportBearer(accessToken(), tabMayWrite);\n  if (token)') < feedback.indexOf("await fetch('/api/v1/feedback'"));
  const reporter = readFileSync(join(SRC, 'lib', 'errorReporter.ts'), 'utf8');
  assert.ok(reporter.indexOf('if (!mayReport()) return null;') >= 0, 'automatic reports are skipped');
  assert.ok(reporter.indexOf('if (!mayReport()) return null;') < reporter.indexOf('autoReportCount += 1;'), 'before a slot is taken');
});
