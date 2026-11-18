// What this browser keeps of an account besides its sign-in, and forgetting
// it once the account is deleted (docs/chino, settings 16.5.6): after Delete
// account and after chino-api answered account_deleted alike
// (lib/deletedAccountSignOut.ts). Two parts, as whose it is can be told
// apart or not:
//
// The tab's (forgetTabData), the deleted account's, as the tab held it:
//  - the stream token, sessionStorage `chino:streamToken`
//    (lib/streamTokenCache.ts): the account's stream pass;
//  - the hero pool, sessionStorage `chino:hero-pool:v5` (lib/heroPool.ts):
//    the titles the hero rotates, as the account may see them, kept up to an
//    hour, with the stream pass inside their artwork's addresses.
//
// The browser's, for all its tabs and kept for no account by name
// (forgetBrowserData): forgotten only where the stored sign-in was the
// deleted account's or nobody's, never under another account signed in
// since in another tab:
//  - the binge sessions, localStorage `chino:bingeSession:<series>`
//    (lib/settings.ts): which episode of a series played last, and when;
//  - the service worker's artwork cache (public/sw.js), keyed by those
//    addresses: the worker is asked to drop it, and never waited for.
//
// What stays is the browser's own, no account's: the settings
// (`chino:settings:v1`, this device's preferences, whoever signs in), the
// fill (`chino:picture:fill`), the install hint dismissed
// (`chino:ios-install-hint-dismissed`), the server's subtitle languages
// (`chino:subtitleLanguages`), the tab's sign-in steps (`chino.signInAgain`)
// and the mark that says the account is deleted (`chino:accountDeleted`).
// Pure: accountData.test.ts runs it under node --test.

import { STREAM_TOKEN_KEY } from './streamTokenCache.ts';
import { HERO_POOL_KEY } from './heroPool.ts';

/** A binge session's key is this and its series' id. */
export const BINGE_SESSION_PREFIX = 'chino:bingeSession:';

/** The message that asks the service worker to drop its artwork cache. */
export const FORGET_ARTWORK = 'FORGET_ARTWORK';

type KeyStore = Pick<Storage, 'length' | 'key' | 'removeItem'>;

function remove(store: KeyStore, key: string): void {
  try {
    store.removeItem(key);
  } catch {
    /* storage off */
  }
}

function keysStarting(store: KeyStore, prefix: string): string[] {
  const keys: string[] = [];
  try {
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key !== null && key.startsWith(prefix)) keys.push(key);
    }
  } catch {
    /* storage off */
  }
  return keys;
}

/** Forgets the tab's part (above) from `session`, the tab's sessionStorage;
 *  null where the browser gives none. At once. */
export function forgetTabData(session: KeyStore | null): void {
  if (!session) return;
  remove(session, STREAM_TOKEN_KEY);
  remove(session, HERO_POOL_KEY);
}

/**
 * Forgets the browser's part (above): the binge sessions go from `local`
 * (localStorage; null where the browser gives none) at once, and
 * `askWorker` sends the service worker {type: FORGET_ARTWORK}. Returns
 * without waiting for the worker, whatever its answer, or none; never fails.
 */
export function forgetBrowserData(local: KeyStore | null, askWorker: (message: { type: string }) => unknown): void {
  if (local) {
    for (const key of keysStarting(local, BINGE_SESSION_PREFIX)) remove(local, key);
  }
  try {
    Promise.resolve(askWorker({ type: FORGET_ARTWORK })).catch(() => undefined);
  } catch {
    /* no worker to ask */
  }
}
