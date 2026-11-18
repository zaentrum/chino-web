// What this browser keeps of an account besides its sign-in, and forgetting
// it once the account is deleted (docs/chino, settings 16.5.6): after Delete
// account and after chino-api answered account_deleted alike
// (lib/deletedAccountSignOut.ts).
//
//  - the stream token, sessionStorage `chino:streamToken`
//    (lib/streamTokenCache.ts): the account's stream pass;
//  - the hero pool, sessionStorage `chino:hero-pool:v5` (lib/heroPool.ts):
//    the titles the hero rotates, as the account may see them, kept up to an
//    hour, with the stream pass inside their artwork's addresses;
//  - the binge sessions, localStorage `chino:bingeSession:<series>`
//    (lib/settings.ts): which episode of a series played last, and when;
//  - the service worker's artwork cache (public/sw.js), keyed by those
//    addresses: the worker is asked to drop it.
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

/**
 * Forgets what the browser keeps of the account (above): the keys go from
 * `local` (localStorage) and `session` (the tab's sessionStorage) at once,
 * null where the browser gives none; `askWorker` sends the service worker
 * {type: FORGET_ARTWORK}. Settles once the worker is asked; never fails.
 */
export function forgetAccountData(
  stores: { local: KeyStore | null; session: KeyStore | null },
  askWorker: (message: { type: string }) => Promise<void>,
): Promise<void> {
  const { local, session } = stores;
  if (session) {
    remove(session, STREAM_TOKEN_KEY);
    remove(session, HERO_POOL_KEY);
  }
  if (local) {
    for (const key of keysStarting(local, BINGE_SESSION_PREFIX)) remove(local, key);
  }
  try {
    return askWorker({ type: FORGET_ARTWORK }).catch(() => undefined);
  } catch {
    return Promise.resolve();
  }
}
