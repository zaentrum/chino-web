import { useEffect, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import type { ItemDetail } from './useItem';
import { useStreamToken } from './useStreamToken';

/**
 * Fetch catalogue metadata for an explicit list of item ids, preserving
 * the input order. There's no batch endpoint on chino-api, so we fan out
 * to `/api/v1/items/{id}` (same route useItem uses) and assemble the
 * results. Used by the Watchlist page to render a list's contents as a
 * grid of MediaCards.
 *
 * Order is honoured because the contract returns a list's items
 * newest-added first and the grid should reflect that. Failed / missing
 * lookups are dropped silently so a stale id (item removed from the
 * catalogue) doesn't break the whole grid.
 */
export function useItemsByIds(ids: string[]) {
  const auth = useAuth();
  const streamToken = useStreamToken();
  const [items, setItems] = useState<ItemDetail[]>([]);
  const [loading, setLoading] = useState(true);

  const idsKey = ids.join(',');

  useEffect(() => {
    if (auth.isLoading || !auth.isAuthenticated) return;
    const token = auth.user?.access_token;
    if (!token) return;
    if (ids.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const enc = streamToken ? encodeURIComponent(streamToken) : '';
    Promise.all(
      ids.map((id) =>
        fetch(`/api/v1/items/${encodeURIComponent(id)}`, {
          signal: ctrl.signal,
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((r) => (r.ok ? (r.json() as Promise<ItemDetail>) : null))
          .catch(() => null),
      ),
    )
      .then((results) => {
        const next = results
          .filter((j): j is ItemDetail => !!j)
          .map((j) => ({
            ...j,
            poster_url: j.poster_url && enc ? `${j.poster_url}?stream=${enc}` : j.poster_url,
            backdrop_url: j.backdrop_url && enc ? `${j.backdrop_url}?stream=${enc}` : j.backdrop_url,
          }));
        setItems(next);
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
    // idsKey captures the exact id set + order; streamToken so artwork
    // URLs land once the token is minted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, auth.isAuthenticated, auth.isLoading, streamToken]);

  return { items, loading };
}
