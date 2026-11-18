// Signing out an account that is deleted (docs/chino, settings 16.5.6):
// after Delete account (components/DeleteAccountDialog.tsx), and where
// chino-api answered a request account_deleted (lib/deletedAccountWatch.ts).
// What touches the browser comes in as parts (auth/accountDeleted.ts binds
// them), so deletedAccountSignOut.test.ts runs the decision under
// node --test.
//
// The sign-in the browser keeps is one for all its tabs (oidc-client-ts's
// user in localStorage); each tab holds its own copy in memory, and nothing
// syncs them. So the request that was refused says whose account is
// deleted, not the store: the stored sign-in is removed only where it is
// that account's - its `sub` the subject of the request's bearer (read from
// the JWT's payload, not verified: here it only tells accounts apart), or
// its access token that very bearer. Any other - an account signed in since
// in another tab, nobody, a bearer that can't be read - stays, and the tab
// loads the app anew, which reads the store again.

import { subjectOf } from './streamTokenCache.ts';

/** The sign-in the browser keeps for all its tabs. */
export interface StoredSignIn {
  /** Its profile's `sub`. */
  sub: string | null;
  accessToken: string | null;
}

/** What signs out, in the browser (auth/accountDeleted.ts). */
export interface SignOutParts {
  /** The tab's mark: the start screen says the account is deleted, and no
   *  screen renews the sign-in (lib/signInAgain.ts onSignedOut). */
  mark(): void;
  /** No renewal of this tab's sign-in starts by itself from now on. */
  stopRenewal(): void;
  /** Forgets what the tab keeps of the account (lib/accountData.ts
   *  forgetTabData). At once. */
  forgetTab(): void;
  /** Forgets what the browser keeps for all its tabs (lib/accountData.ts
   *  forgetBrowserData). At once; the service worker is asked, never
   *  waited for. */
  forgetBrowser(): void;
  /** The sign-in the browser keeps; null for none. */
  stored(): Promise<StoredSignIn | null>;
  /** Removes the stored sign-in; this tab's goes from memory with it. */
  remove(): Promise<void>;
  /** Loads the app anew in this tab, at home: it reads the store again. */
  reload(): void;
}

/** An account, as a request or a sign-in names it. */
interface Who {
  token: string | null;
  sub: string | null;
}

export interface DeletedAccountSignOut {
  /** The account of the bearer in `authorization` (a request's
   *  Authorization; null for none) is deleted: it is signed out here. */
  signOut(authorization: string | null): Promise<void>;
  /** A sign-in was loaded (a renewal that was under way, most likely):
   *  where it is an account signed out here as deleted, it is signed out
   *  again. */
  loaded(user: StoredSignIn): Promise<void>;
}

/** The token of an Authorization "Bearer …"; null for any other. */
export function bearerToken(authorization: string | null | undefined): string | null {
  const m = /^\s*bearer\s+(\S+)\s*$/i.exec(authorization ?? '');
  return m ? m[1] : null;
}

/** Whether `stored` is the account `who` names: the same subject, or the
 *  very token. A bearer that can't be read names none. */
export function isStoredAccount(stored: StoredSignIn | null, who: Who): boolean {
  if (!stored) return false;
  if (who.sub !== null && stored.sub === who.sub) return true;
  return who.token !== null && stored.accessToken === who.token;
}

/**
 * The sign-out, over `parts`. Each sign-out sets the mark first, before the
 * caller has the answer; then stops the tab's own renewals and forgets what
 * the tab keeps of the account. Then it reads the store, and decides whose
 * it is before it forgets anything more:
 *
 *  - the account's: the stored sign-in is removed, the mark set again (a
 *    screen that held the sign-in once more in between may have taken it
 *    away), and then what the browser keeps for all its tabs is forgotten. A
 *    removal that fails loads the app anew after that;
 *  - nobody's: what the browser keeps goes too, and the app loads anew;
 *  - another account's, signed in since in another tab: what the browser
 *    keeps is that account's as much, and stays; the app loads anew.
 *
 * Nothing waits for the service worker.
 *
 * One runs at a time: the 401s that come at once are one sign-out, and once
 * it ends, by whatever way, the next can run. A 401 for an account this tab
 * signed out before, which the store no longer holds, changes nothing more.
 * A sign-in loaded later for such an account - a renewal under way while it
 * was signed out - is signed out again (after the one running, if one is).
 */
export function deletedAccountSignOut(parts: SignOutParts): DeletedAccountSignOut {
  let running: Promise<void> | null = null;
  let recheck: Who | null = null;
  // The accounts signed out here as deleted, by subject.
  const gone = new Set<string>();

  async function run(who: Who, renewal: boolean): Promise<void> {
    parts.mark();
    parts.stopRenewal();
    parts.forgetTab();
    const before = who.sub !== null && gone.has(who.sub);
    if (who.sub !== null) gone.add(who.sub);
    const stored = await parts.stored();
    if (stored && isStoredAccount(stored, who)) {
      if (stored.sub !== null) gone.add(stored.sub);
      let removed = true;
      try {
        await parts.remove();
      } catch {
        removed = false;
      }
      parts.mark();
      parts.forgetBrowser();
      if (!removed) parts.reload();
      return;
    }
    // Signed out here before, and the store doesn't hold it again: nothing
    // of it is left in this tab. A sign-in just loaded may be in memory
    // still, with the store already empty: anew, then.
    if (before && !renewal) return;
    if (stored === null) parts.forgetBrowser();
    parts.reload();
  }

  function start(who: Who, renewal: boolean): Promise<void> {
    const mine = (async () => {
      try {
        await run(who, renewal);
      } catch {
        parts.reload();
      } finally {
        running = null;
        const next = recheck;
        recheck = null;
        if (next) start(next, true);
      }
    })();
    // The run waits before it ends, by whatever way, so its `finally` comes
    // after this.
    running = mine;
    return mine;
  }

  return {
    signOut(authorization) {
      if (running) return running;
      const token = bearerToken(authorization);
      return start({ token, sub: subjectOf(token) }, false);
    },
    loaded(user) {
      if (user.sub === null || !gone.has(user.sub)) return Promise.resolve();
      const who = { token: user.accessToken, sub: user.sub };
      if (!running) return start(who, true);
      recheck = who;
      // The check after the one running: `running` is that check by then.
      return running.then(() => running ?? undefined);
    },
  };
}
