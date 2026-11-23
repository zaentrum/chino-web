import { useEffect, useSyncExternalStore } from 'react';
import { useAuth } from 'react-oidc-context';
import { byKind, settingsChoice, type ByKindState } from '../lib/watchlistKinds';
import { HttpError } from '../lib/loadFailure';
import { subjectOf } from '../lib/streamTokenCache';
import { watchlistKindsOffered } from '../lib/runtimeConfig';
import { tabMayWrite } from '../auth/tabAccount';

// Separate movies and shows in this tab (lib/watchlistKinds.ts): the store
// is the tab's, its copy the browser's, its requests chino-api's
// /api/v1/me/settings.

/** The tab's bearer, as the provider last gave it to a screen. */
let bearer: string | null = null;

function localStore(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The account's `watchlist_by_kind` in an answer of /api/v1/me/settings;
 *  one without it fails as the request would (lib/watchlistKinds.ts). */
async function choiceOf(r: Response): Promise<boolean> {
  if (!r.ok) throw new HttpError(r.status, 'settings');
  return settingsChoice(await r.json());
}

const store = byKind({
  offered: watchlistKindsOffered,
  bearer: () => bearer,
  mayWrite: (b) => tabMayWrite(b),
  read: async (b) => choiceOf(await fetch('/api/v1/me/settings', { headers: { Authorization: `Bearer ${b}` } })),
  save: async (b, on) =>
    choiceOf(
      await fetch('/api/v1/me/settings', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${b}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ watchlist_by_kind: on }),
      }),
    ),
  local: typeof window === 'undefined' ? null : localStore(),
});

// Another tab of this browser saved or read the choice, or its account left.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => store.heard(e.key, e.newValue));
}

export interface WatchlistByKind extends ByKindState {
  /** The server keeps the setting and fills a list by kind. */
  offered: boolean;
  /** Every list is drawn split: offered, and the choice on. */
  split: boolean;
  press(on: boolean): void;
}

/**
 * Separate movies and shows for the tab's account: drawn at once with the
 * choice as last known, and with `read` asked again as the screen opens -
 * it may have been changed on another device.
 */
export function useWatchlistByKind(read: boolean): WatchlistByKind {
  const auth = useAuth();
  const token = auth.user?.access_token ?? null;
  bearer = token;
  const state = useSyncExternalStore(store.subscribe, store.state);
  const offered = watchlistKindsOffered();
  useEffect(() => {
    if (read && token) void store.read();
    // A renewed bearer asks nothing new.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [read, !!token]);
  return { ...state, offered, split: offered && state.on, press: (on) => void store.press(on) };
}

/** The account of `accessToken` leaves this browser - signed out, or
 *  deleted: its copy of the choice goes, in every tab. */
export function forgetWatchlistChoice(accessToken: string | null | undefined): void {
  store.forget(subjectOf(accessToken));
}
