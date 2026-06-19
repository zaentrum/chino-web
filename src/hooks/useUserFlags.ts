import { useCallback, useEffect, useState } from 'react';
import { useAuth } from 'react-oidc-context';

/**
 * Watchlist + Likes — flat sets of item ids the user has flagged.
 *
 * Backed by a module-level cache per kind so every MediaCard on the page
 * shares ONE network fetch instead of one-per-card. Toggles mutate the
 * shared set and broadcast to all subscribers; cross-tab updates still
 * arrive via the `chino:flag-changed` window event from DetailPage etc.
 *
 * The 'watchlist' kind rides on the DEFAULT named list: the back-compat
 * /me/watchlist routes still mirror the default list server-side, so this
 * hook stays the single-bookmark signal ("in default list"). It also
 * listens for `chino:lists-changed` so a toggle made via the multi-list
 * picker (which may add to a non-default list) re-syncs the icon — the
 * "saved" state reflects "in default list" here; the richer "in >=1 list"
 * signal comes from useMemberships in useWatchlists.ts.
 */
export type FlagKind = 'watchlist' | 'likes';

interface FlagState {
  ids: Set<string>;
  toggle: (itemId: string, present: boolean) => Promise<void>;
  has: (itemId: string) => boolean;
}

type Listener = (ids: Set<string>) => void;

interface Store {
  ids: Set<string>;
  listeners: Set<Listener>;
  loaded: boolean;
  inflight: Promise<void> | null;
  token: string | null;
}

const stores: Record<FlagKind, Store> = {
  watchlist: emptyStore(),
  likes: emptyStore(),
};

function emptyStore(): Store {
  return { ids: new Set(), listeners: new Set(), loaded: false, inflight: null, token: null };
}

function notify(store: Store) {
  // Hand out a fresh Set so React's setState sees a new reference.
  const snapshot = new Set(store.ids);
  store.ids = snapshot;
  store.listeners.forEach((l) => l(snapshot));
}

async function fetchInto(store: Store, kind: FlagKind, token: string) {
  if (store.inflight && store.token === token) {
    await store.inflight;
    return;
  }
  store.token = token;
  store.inflight = (async () => {
    try {
      const r = await fetch(`/api/v1/me/${kind}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) return;
      const j = (await r.json()) as { items: string[] };
      store.ids = new Set(j.items ?? []);
      store.loaded = true;
      notify(store);
    } catch {
      // Network errors swallowed — empty set is fine, the next toggle
      // or visibility change will recover.
    }
  })();
  try {
    await store.inflight;
  } finally {
    store.inflight = null;
  }
}

function useFlag(kind: FlagKind): FlagState {
  const auth = useAuth();
  const store = stores[kind];
  const [ids, setIds] = useState<Set<string>>(store.ids);

  useEffect(() => {
    const listener: Listener = (next) => setIds(next);
    store.listeners.add(listener);

    const token = auth.user?.access_token;
    if (auth.isAuthenticated && token && (!store.loaded || store.token !== token)) {
      void fetchInto(store, kind, token);
    } else if (store.loaded) {
      // Sync this subscriber to the current cached value.
      setIds(store.ids);
    }

    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<{ kind?: FlagKind }>).detail;
      if (detail && detail.kind !== kind) return;
      const t = auth.user?.access_token;
      if (t) void fetchInto(store, kind, t);
    };
    window.addEventListener('chino:flag-changed', onChange);
    // The watchlist flag mirrors the default list — a multi-list picker
    // toggle (chino:lists-changed) can move the item in/out of the
    // default, so re-sync this set on that event too.
    const onListsChange = () => {
      if (kind !== 'watchlist') return;
      const t = auth.user?.access_token;
      if (t) void fetchInto(store, kind, t);
    };
    window.addEventListener('chino:lists-changed', onListsChange);
    return () => {
      store.listeners.delete(listener);
      window.removeEventListener('chino:flag-changed', onChange);
      window.removeEventListener('chino:lists-changed', onListsChange);
    };
  }, [auth.isAuthenticated, auth.user?.access_token, kind, store]);

  const toggle = useCallback(
    async (itemId: string, present: boolean) => {
      const token = auth.user?.access_token;
      if (!token) return;
      // Optimistic update on the shared store — all subscribers see the
      // flip immediately.
      if (present) store.ids.add(itemId);
      else store.ids.delete(itemId);
      notify(store);
      try {
        await fetch(`/api/v1/me/${kind}/${encodeURIComponent(itemId)}`, {
          method: present ? 'PUT' : 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // Network error — leave the optimistic state; next reload syncs.
      }
      window.dispatchEvent(new CustomEvent('chino:flag-changed', { detail: { kind } }));
    },
    [auth.user?.access_token, kind, store],
  );

  return { ids, toggle, has: useCallback((id) => ids.has(id), [ids]) };
}

export const useWatchlist = () => useFlag('watchlist');
export const useLikes = () => useFlag('likes');
