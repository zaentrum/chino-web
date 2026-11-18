// A tab stays with the account it was loaded for, as the phone app stays
// with the account it opened. The browser keeps one sign-in for all its
// tabs (oidc-client-ts's user in localStorage), and a tab's renewal reads
// it: once another tab signs out and in as another account, the next
// renewal of a tab that was never reloaded loads that account, and the
// screens it shows, a player playing among them, would go on writing under
// it. So the first sign-in a tab loads is its account: a renewal of the same
// account (the same subject) changes nothing, and a sign-in of another one
// loads the app anew in the tab, at home, which then is that account's from
// its start: the tab's own data (its stream token, its hero pool) goes
// first, and the old screens give way to the gate's splash and write
// nothing more. A write checks the account of its bearer before it goes
// (mayWrite), so nothing is written under another account even before the
// tab has seen its sign-in loaded.
//
// Subjects are the access token's `sub`, read and not verified: here they
// only tell accounts apart. A sign-in whose subject can't be read changes
// nothing; until one names an account, writes go as before. Pure:
// tabAccount.test.ts runs it under node --test.

import { subjectOf } from './streamTokenCache.ts';

export interface TabAccount {
  /** A sign-in this tab loaded, by its access token: the provider's first
   *  user, a renewal, a sign-in's return. */
  loaded(accessToken: string | null | undefined): void;
  /** Whether a write with `bearer` may go: it is the account this tab was
   *  loaded for, and the tab isn't loading anew. */
  mayWrite(bearer: string | null | undefined): boolean;
  /** Whether the tab is loading anew, for another account: the gate shows
   *  its splash in place of the screens (lib/authGate.ts). */
  leaving(): boolean;
  /** Calls `listener` once the tab starts loading anew; the call that stops it. */
  subscribe(listener: () => void): () => void;
}

export function tabAccount(parts: {
  /** Forgets what the tab keeps of its account (lib/accountData.ts
   *  forgetTabData): the next account's start must not find it. */
  forgetTab(): void;
  /** Loads the app anew in this tab, at home (auth/tabAccount.ts). */
  reload(): void;
}): TabAccount {
  // The account this tab was loaded for: null until a sign-in names one.
  let mine: string | null = null;
  let leaving = false;
  const listeners = new Set<() => void>();
  return {
    loaded(accessToken) {
      const sub = subjectOf(accessToken);
      if (leaving || sub === null) return;
      if (mine === null) {
        mine = sub;
        return;
      }
      if (sub === mine) return;
      leaving = true;
      listeners.forEach((listener) => listener());
      parts.forgetTab();
      parts.reload();
    },
    mayWrite(bearer) {
      if (leaving || !bearer) return false;
      // Before any sign-in names an account, nothing tells one from another.
      return mine === null || subjectOf(bearer) === mine;
    },
    leaving: () => leaving,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
