// Once the person has deleted their account, the app signs them out and
// starts over, and the start screen says the account is deleted instead of
// sending them straight on to the sign-in page. The same goes where the
// server answers that the account is deleted, from this tab or elsewhere
// (signOutDeletedAccount). The mark lives in sessionStorage: it is this
// tab's, and goes with it.

import { watchingForDeletedAccount } from '../lib/deletedAccountWatch';
import { bearerToken, deletedAccountSignOut } from '../lib/deletedAccountSignOut';
import { forgetWatchlistChoice } from '../hooks/useWatchlistByKind';
import { forgetBrowserData } from '../lib/accountData';
import { toApp } from '../lib/basepath';
import { oidcUserManager } from './oidc';
import { forgetTabAccountData } from './tabAccount';

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

/** Sends `message` to the service worker this page runs under, if any: at
 *  once to the one that controls the page, so it leaves before a reload;
 *  else to the registration's active one once the browser names it. */
function askServiceWorker(message: { type: string }): void {
  if (!('serviceWorker' in navigator)) return;
  const workers = navigator.serviceWorker;
  if (workers.controller) {
    workers.controller.postMessage(message);
    return;
  }
  void workers
    .getRegistration()
    .then((registration) => registration?.active?.postMessage(message))
    .catch(() => undefined);
}

// The sign-out's parts in this browser; what it decides is
// lib/deletedAccountSignOut.ts's.
const signOut = deletedAccountSignOut({
  mark: markAccountDeleted,
  stopRenewal: () => oidcUserManager()?.stopSilentRenew(),
  forgetTab: forgetTabAccountData,
  forgetBrowser: () => forgetBrowserData(storage('localStorage'), askServiceWorker),
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
 * renewals stop and what the tab keeps of the account goes. The stored
 * sign-in goes where it is that account's, and then what the browser keeps
 * for all its tabs (lib/accountData.ts); where it is nobody's, that goes
 * too, and the app loads anew; where it is another's, it stays, and the app
 * loads anew (lib/deletedAccountSignOut.ts).
 */
export function signOutDeletedAccount(authorization: string | null): Promise<void> {
  watchSignIns();
  // Its copy of Separate movies and shows, kept by its subject, goes in
  // every tab, whoever is signed in by now.
  forgetWatchlistChoice(bearerToken(authorization));
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
