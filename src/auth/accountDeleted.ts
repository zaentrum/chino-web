// Once the person has deleted their account, the app signs them out and
// starts over, and the start screen says the account is deleted instead of
// sending them straight on to the sign-in page. The same goes where the
// server answers that the account is deleted, from this tab or elsewhere
// (signOutDeletedAccount). The mark lives in sessionStorage: it is this
// tab's, and goes with it.

import { watchingForDeletedAccount } from '../lib/deletedAccountWatch';
import { deletedAccountSignOut } from '../lib/deletedAccountSignOut';
import { forgetAccountData } from '../lib/accountData';
import { toApp } from '../lib/basepath';
import { oidcUserManager } from './oidc';

const KEY = 'chino:accountDeleted';

/** Set just before the deleted account is signed out. */
export function markAccountDeleted(): void {
  try {
    window.sessionStorage.setItem(KEY, '1');
  } catch {
    /* storage off: the start screen is the sign-in page, as after a sign-out */
  }
}

export function accountWasDeleted(): boolean {
  try {
    return window.sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function forgetAccountDeleted(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* storage off */
  }
}

function storage(which: 'localStorage' | 'sessionStorage'): Storage | null {
  try {
    return window[which];
  } catch {
    return null;
  }
}

/** Sends `message` to the service worker this page runs under, if any. */
async function askServiceWorker(message: { type: string }): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  registration?.active?.postMessage(message);
}

// The sign-out's parts in this browser; what it decides is
// lib/deletedAccountSignOut.ts's.
const signOut = deletedAccountSignOut({
  mark: markAccountDeleted,
  stopRenewal: () => oidcUserManager()?.stopSilentRenew(),
  forget: () => forgetAccountData({ local: storage('localStorage'), session: storage('sessionStorage') }, askServiceWorker),
  stored: async () => {
    const user = await oidcUserManager()?.getUser();
    return user ? { sub: user.profile?.sub ?? null, accessToken: user.access_token ?? null } : null;
  },
  remove: async () => {
    const manager = oidcUserManager();
    if (!manager) throw new Error('no sign-in to remove');
    await manager.removeUser();
  },
  reload: () => window.location.replace(toApp('/')),
});

let watchingSignIns = false;

/** From now on each sign-in this tab loads - a renewal under way, most
 *  likely - is checked: one of an account signed out as deleted is signed
 *  out again. */
function watchSignIns(): void {
  const manager = oidcUserManager();
  if (watchingSignIns || !manager) return;
  watchingSignIns = true;
  manager.events.addUserLoaded((user) => {
    void signOut.loaded({ sub: user.profile?.sub ?? null, accessToken: user.access_token ?? null });
  });
}

/**
 * The account of `authorization`'s bearer is deleted - Delete Account
 * deleted it, or chino-api answered a request account_deleted
 * (lib/deletedAccountWatch.ts) - and it is signed out on this tab. The mark
 * goes first, so the start screen says the account is deleted (AuthGate)
 * and no screen renews the sign-in (useSignInAgain); then this tab's
 * renewals stop, what the browser keeps of the account goes
 * (lib/accountData.ts), and the stored sign-in goes where it is that
 * account's; where it is another's, or nobody's, the app loads anew
 * (lib/deletedAccountSignOut.ts).
 */
export function signOutDeletedAccount(authorization: string | null): Promise<void> {
  watchSignIns();
  return signOut.signOut(authorization);
}

let watching = false;

/** From now on each of chino-api's answers is looked at for an account
 *  deleted (signOutDeletedAccount). Once, before the app starts. */
export function installDeletedAccountWatch(): void {
  if (watching) return;
  watching = true;
  window.fetch = watchingForDeletedAccount(window.fetch.bind(window), window.location.origin, (authorization) => {
    void signOutDeletedAccount(authorization);
  });
}
