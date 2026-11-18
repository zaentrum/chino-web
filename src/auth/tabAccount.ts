// The account this tab was loaded for (lib/tabAccount.ts), in the browser:
// a sign-in of another account loads the app anew here, at home, once the
// tab's own data is forgotten; until then the gate shows its splash and
// nothing is written under it.

import { useSyncExternalStore } from 'react';
import { tabAccount } from '../lib/tabAccount';
import { forgetTabData } from '../lib/accountData';
import { toApp } from '../lib/basepath';

/** The tab's sessionStorage, or null where the browser gives none. */
function tabSession(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Forgets what this tab keeps of its account: its stream token and its
 *  hero pool (lib/accountData.ts). Before the tab loads anew for another
 *  account, and at sign out. */
export function forgetTabAccountData(): void {
  forgetTabData(tabSession());
}

const tab = tabAccount({
  forgetTab: forgetTabAccountData,
  reload: () => window.location.replace(toApp('/')),
});

/** A sign-in this tab loaded, by its access token: the UserManager's
 *  userLoaded (auth/oidc.ts) and the provider's user (AuthGate). */
export function tabLoaded(accessToken: string | null | undefined): void {
  tab.loaded(accessToken);
}

/** Whether a write with `bearer` may go from this tab. */
export function tabMayWrite(bearer: string | null | undefined): boolean {
  return tab.mayWrite(bearer);
}

/** Whether the tab is loading anew for another account (AuthGate). */
export function useTabLeaving(): boolean {
  return useSyncExternalStore(tab.subscribe, tab.leaving);
}
