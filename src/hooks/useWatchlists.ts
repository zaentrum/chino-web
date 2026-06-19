import { useCallback, useEffect, useState } from 'react';
import { useAuth } from 'react-oidc-context';

/**
 * Multiple named watchlists — the lists-aware layer that sits on top of
 * the legacy single-watchlist flag (see useUserFlags.ts, which now rides
 * on the default list for back-compat).
 *
 * Every user always has exactly one default list named "Watchlist"
 * (isDefault=true), created lazily server-side on first access. The
 * default list is always FIRST in the lists array; the rest follow by
 * createdAt asc.
 *
 * Memberships ("which lists is item X in?") power the picker checkmarks
 * and the "saved" badge on cards. We keep a module-level membership cache
 * so a card grid shares ONE fetch and toggles broadcast to every
 * subscriber, mirroring the useUserFlags store design.
 */

export interface Watchlist {
  id: string;
  name: string;
  itemCount: number;
  isDefault: boolean;
  createdAt: string;
}

export interface WatchlistDetail {
  id: string;
  name: string;
  isDefault: boolean;
  items: string[]; // itemIds, newest-added first
}

// Other components listen for this to refetch their lists / memberships
// after a mutation lands (cross-component, same-tab). Mirrors the
// `chino:flag-changed` event the legacy flags hook dispatches.
const LISTS_CHANGED = 'chino:lists-changed';

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

// ---------------------------------------------------------------------------
// API layer — one function per endpoint in the frozen contract.
// All take the OIDC access token explicitly so they can be called from
// hooks, event handlers, and module-level fetchers alike.
// ---------------------------------------------------------------------------

export async function listWatchlists(token: string): Promise<Watchlist[]> {
  const r = await fetch('/api/v1/me/watchlists', { headers: authHeaders(token) });
  if (!r.ok) throw new Error(`watchlists ${r.status}`);
  const j = (await r.json()) as { lists: Watchlist[] };
  return j.lists ?? [];
}

export async function createWatchlist(token: string, name: string): Promise<Watchlist> {
  const r = await fetch('/api/v1/me/watchlists', {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!r.ok) throw await listError(r);
  return (await r.json()) as Watchlist;
}

export async function renameWatchlist(token: string, listId: string, name: string): Promise<Watchlist> {
  const r = await fetch(`/api/v1/me/watchlists/${encodeURIComponent(listId)}`, {
    method: 'PATCH',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!r.ok) throw await listError(r);
  return (await r.json()) as Watchlist;
}

export async function deleteWatchlist(token: string, listId: string): Promise<void> {
  const r = await fetch(`/api/v1/me/watchlists/${encodeURIComponent(listId)}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  if (!r.ok) throw await listError(r);
}

export async function getWatchlist(token: string, listId: string): Promise<WatchlistDetail> {
  const r = await fetch(`/api/v1/me/watchlists/${encodeURIComponent(listId)}`, {
    headers: authHeaders(token),
  });
  if (!r.ok) throw new Error(`watchlist ${r.status}`);
  return (await r.json()) as WatchlistDetail;
}

export async function addItemToList(token: string, listId: string, itemId: string): Promise<void> {
  await fetch(
    `/api/v1/me/watchlists/${encodeURIComponent(listId)}/items/${encodeURIComponent(itemId)}`,
    { method: 'PUT', headers: authHeaders(token) },
  );
}

export async function removeItemFromList(token: string, listId: string, itemId: string): Promise<void> {
  await fetch(
    `/api/v1/me/watchlists/${encodeURIComponent(listId)}/items/${encodeURIComponent(itemId)}`,
    { method: 'DELETE', headers: authHeaders(token) },
  );
}

/**
 * Which of the caller's lists each item belongs to. Items in no list may
 * be omitted from the map; callers should treat a missing key as `[]`.
 */
export async function getMemberships(
  token: string,
  ids: string[],
): Promise<Record<string, string[]>> {
  if (ids.length === 0) return {};
  const qs = ids.map((i) => encodeURIComponent(i)).join(',');
  const r = await fetch(`/api/v1/me/watchlists/memberships?ids=${qs}`, {
    headers: authHeaders(token),
  });
  if (!r.ok) throw new Error(`memberships ${r.status}`);
  const j = (await r.json()) as { memberships: Record<string, string[]> };
  return j.memberships ?? {};
}

// Surfaces the server's error message ("name exists", "too many lists",
// "cannot delete default") so the UI can show it inline. Falls back to a
// generic status-coded message when the body isn't the expected shape.
async function listError(r: Response): Promise<Error> {
  let msg = `request failed (${r.status})`;
  try {
    const j = (await r.json()) as { error?: string; message?: string };
    msg = j.error || j.message || msg;
  } catch {
    // non-JSON body — keep the status-coded fallback
  }
  const err = new Error(msg) as Error & { status?: number };
  err.status = r.status;
  return err;
}

// ---------------------------------------------------------------------------
// useWatchlists — the lists overview, with create/rename/delete that keep
// the local array in sync and broadcast so the picker + badges refresh.
// ---------------------------------------------------------------------------

export function useWatchlists() {
  const auth = useAuth();
  const [lists, setLists] = useState<Watchlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const token = auth.user?.access_token;

  const reload = useCallback(async () => {
    if (!token) return;
    try {
      setError(null);
      const next = await listWatchlists(token);
      setLists(next);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (auth.isLoading || !auth.isAuthenticated || !token) return;
    void reload();
    const onChange = () => void reload();
    window.addEventListener(LISTS_CHANGED, onChange);
    return () => window.removeEventListener(LISTS_CHANGED, onChange);
  }, [auth.isAuthenticated, auth.isLoading, token, reload]);

  const create = useCallback(
    async (name: string): Promise<Watchlist> => {
      if (!token) throw new Error('not signed in');
      const created = await createWatchlist(token, name);
      // Optimistically splice in — keep default first, others by createdAt.
      setLists((prev) => orderLists([...prev, created]));
      window.dispatchEvent(new CustomEvent(LISTS_CHANGED));
      return created;
    },
    [token],
  );

  const rename = useCallback(
    async (listId: string, name: string): Promise<Watchlist> => {
      if (!token) throw new Error('not signed in');
      const updated = await renameWatchlist(token, listId, name);
      setLists((prev) => prev.map((l) => (l.id === listId ? updated : l)));
      window.dispatchEvent(new CustomEvent(LISTS_CHANGED));
      return updated;
    },
    [token],
  );

  const remove = useCallback(
    async (listId: string): Promise<void> => {
      if (!token) throw new Error('not signed in');
      await deleteWatchlist(token, listId);
      setLists((prev) => prev.filter((l) => l.id !== listId));
      window.dispatchEvent(new CustomEvent(LISTS_CHANGED));
    },
    [token],
  );

  return { lists, loading, error, reload, create, rename, remove };
}

// Default list first, the rest by createdAt ascending — matches the
// server's GET /me/watchlists ordering so optimistic inserts don't jump
// around when the next reload arrives.
function orderLists(lists: Watchlist[]): Watchlist[] {
  return [...lists].sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

// ---------------------------------------------------------------------------
// Membership store — shared cache for "is item X in any list?" so a grid
// of cards issues ONE memberships fetch. Cards register the ids they care
// about; the store batches a fetch and notifies subscribers. Toggles
// (add/remove) optimistically mutate the cache and broadcast.
// ---------------------------------------------------------------------------

type MembershipMap = Record<string, string[]>;
type MembershipListener = (map: MembershipMap) => void;

interface MembershipStore {
  map: MembershipMap;
  listeners: Set<MembershipListener>;
  pending: Set<string>; // ids requested but not yet fetched
  flushTimer: ReturnType<typeof setTimeout> | null;
  token: string | null;
}

const membershipStore: MembershipStore = {
  map: {},
  listeners: new Set(),
  pending: new Set(),
  flushTimer: null,
  token: null,
};

function notifyMemberships() {
  const snapshot = { ...membershipStore.map };
  membershipStore.map = snapshot;
  membershipStore.listeners.forEach((l) => l(snapshot));
}

function scheduleMembershipFlush(token: string) {
  membershipStore.token = token;
  if (membershipStore.flushTimer) return;
  // Coalesce a burst of card registrations (a whole grid mounts in the
  // same tick) into a single memberships request.
  membershipStore.flushTimer = setTimeout(() => {
    membershipStore.flushTimer = null;
    const ids = Array.from(membershipStore.pending);
    membershipStore.pending.clear();
    if (ids.length === 0 || !membershipStore.token) return;
    void getMemberships(membershipStore.token, ids)
      .then((res) => {
        // Items absent from the response are in no list — record [] so we
        // don't re-request them on every render.
        for (const id of ids) membershipStore.map[id] = res[id] ?? [];
        notifyMemberships();
      })
      .catch(() => {
        // Swallow — an empty membership set just means no badge; the next
        // toggle or lists-changed event recovers.
      });
  }, 30);
}

/**
 * Subscribe to membership info for a set of item ids. Returns a map of
 * itemId -> listIds and a `savedSet` of ids that are in >=1 list (the
 * cheap signal cards use for the "saved" badge).
 */
export function useMemberships(ids: string[]) {
  const auth = useAuth();
  const token = auth.user?.access_token;
  const [map, setMap] = useState<MembershipMap>(membershipStore.map);

  // Stable key so the effect only refires when the actual id set changes,
  // not on every render that produces a fresh array literal.
  const idsKey = ids.join(',');

  useEffect(() => {
    const listener: MembershipListener = (next) => setMap(next);
    membershipStore.listeners.add(listener);

    if (auth.isAuthenticated && token) {
      let needsFetch = false;
      for (const id of ids) {
        if (!(id in membershipStore.map)) {
          membershipStore.pending.add(id);
          needsFetch = true;
        }
      }
      if (needsFetch) scheduleMembershipFlush(token);
    }

    const onChange = () => {
      // A list mutation can change membership for ANY id we're tracking —
      // re-request the full known set.
      const t = auth.user?.access_token;
      if (!t) return;
      for (const id of Object.keys(membershipStore.map)) membershipStore.pending.add(id);
      for (const id of ids) membershipStore.pending.add(id);
      scheduleMembershipFlush(t);
    };
    window.addEventListener(LISTS_CHANGED, onChange);

    return () => {
      membershipStore.listeners.delete(listener);
      window.removeEventListener(LISTS_CHANGED, onChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, auth.isAuthenticated, token]);

  const savedSet = new Set(
    Object.entries(map)
      .filter(([, lists]) => lists.length > 0)
      .map(([id]) => id),
  );

  return { map, savedSet };
}

/**
 * Toggle an item's membership in a single list with an optimistic update
 * to the shared membership cache. Broadcasts so the picker checkmarks,
 * the lists overview counts and card badges all refresh.
 */
export async function toggleMembership(
  token: string,
  listId: string,
  itemId: string,
  present: boolean,
): Promise<void> {
  const current = membershipStore.map[itemId] ?? [];
  membershipStore.map[itemId] = present
    ? Array.from(new Set([...current, listId]))
    : current.filter((l) => l !== listId);
  notifyMemberships();
  try {
    if (present) await addItemToList(token, listId, itemId);
    else await removeItemFromList(token, listId, itemId);
  } catch {
    // Leave the optimistic state; the next lists-changed reload syncs.
  }
  window.dispatchEvent(new CustomEvent(LISTS_CHANGED));
  // The legacy single-watchlist flag mirrors the DEFAULT list — nudge it
  // so the existing bookmark icon stays in sync when the default changes.
  window.dispatchEvent(new CustomEvent('chino:flag-changed', { detail: { kind: 'watchlist' } }));
}

export { LISTS_CHANGED };
