// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gateScreen } from './authGate.ts';
import { tabAccount } from './tabAccount.ts';

const base = { leaving: false, isLoading: false, isAuthenticated: true, error: false, accountDeleted: false };

function tokenFor(sub: string): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'RS256' })}.${b64({ sub })}.signature`;
}

test('once the tab loads anew for another account, the gate shows its splash in place of every screen, whatever else holds', () => {
  for (const isLoading of [false, true]) {
    for (const isAuthenticated of [false, true]) {
      for (const error of [false, true]) {
        for (const accountDeleted of [false, true]) {
          assert.equal(gateScreen({ leaving: true, isLoading, isAuthenticated, error, accountDeleted }), 'splash');
        }
      }
    }
  }
});

test("the tab's account changing: the screens that showed the first account give way, before the second's token reaches them", () => {
  const tab = tabAccount({ forgetTab: () => undefined, reload: () => undefined });
  const shows = () => gateScreen({ ...base, leaving: tab.leaving() });
  tab.loaded(tokenFor('first'));
  assert.equal(shows(), 'app');
  // The renewal brings the second account's sign-in; the provider re-renders with it.
  tab.loaded(tokenFor('second'));
  assert.equal(shows(), 'splash');
});

test('otherwise, as before: account deleted, the failed sign-in, the splash while signing in, the app', () => {
  assert.equal(gateScreen(base), 'app');
  assert.equal(gateScreen({ ...base, isAuthenticated: false, accountDeleted: true }), 'account-deleted');
  // Still loading: the splash, the mark or not.
  assert.equal(gateScreen({ ...base, isLoading: true, isAuthenticated: false, accountDeleted: true }), 'splash');
  assert.equal(gateScreen({ ...base, isAuthenticated: false, error: true }), 'sign-in-failed');
  assert.equal(gateScreen({ ...base, error: true }), 'sign-in-failed');
  assert.equal(gateScreen({ ...base, isAuthenticated: false }), 'splash');
  assert.equal(gateScreen({ ...base, isLoading: true }), 'splash');
  // Signed in, the mark left over: the app (the gate forgets the mark).
  assert.equal(gateScreen({ ...base, accountDeleted: true }), 'app');
});
