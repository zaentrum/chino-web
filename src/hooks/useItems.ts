import { useEffect, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { useStreamToken } from './useStreamToken';
import { useCatalogGen } from './useCatalogEvents';
import {
  freshPaging,
  nextPageOffset,
  offsetFor,
  pageFailed,
  pageLoaded,
  pageRequested,
  pagingFor,
  type PageCursor,
  type PagingState,
} from '../lib/paging';

export interface KatalogItem {
  id: string;
  type: string;
  title: string;
  year?: number;
  rating?: number;
  description?: string;
  duration_ms?: number;
  poster_url?: string;
  backdrop_url?: string;
  // The title's age rating, as katalog-api sends it (lib/ratings.ts): the
  // age a viewer must be, and the certification it comes from with its
  // country. Absent when nothing rates the title.
  min_age?: number;
  certification?: string;
  certification_country?: string;
  // Set by chino-api when the current user has marked this item
  // watched (entered credits OR crossed 95% of duration). The presence
  // of this field is what MediaCard reads to render the "Watched" pill.
  watched_at?: string | null;
  // Zap warm-pool transport fields — chino-stream's /api/play/zap-feed
  // attaches a server-picked seekSec to each entry so the client
  // doesn't need to roll its own midpoint. ZapCard short-circuits its
  // useZapMidpoint hook when __zapSeekSec is a positive number. The
  // double-underscore prefix signals "transport-attached, not part of
  // catalogue truth" — every other consumer of KatalogItem ignores
  // these fields.
  __zapSeekSec?: number;
  __zapMidSource?: string;
}

interface ItemsResponse {
  product: string;
  items: KatalogItem[];
  source: 'katalog' | 'fallback';
  katalogErr?: string;
}

/**
 * Fetch `/api/v1/items` from chino-api. Returns the items along with a
 * `source` flag so the caller can decide whether to show real data or fall
 * back to its own static array.
 */
export interface BrowseFilter {
  genre?: string;
  yearMin?: number;
  yearMax?: number;
  ratingMin?: number;
  sort?: 'rating' | 'year' | 'title' | 'newest';
  // Home-only: when true, append `&unwatched=true` so chino-api hides
  // titles the user has finished and backfills from later pages to keep
  // a Home rail at `limit` fresh items. Left unset (and so omitted) by
  // the Browse grids / Search so watched titles stay findable for a
  // rewatch.
  unwatched?: boolean;
}

export function useItems(
  q?: string,
  limit = 50,
  type?: 'movie' | 'series' | 'album',
  filter?: BrowseFilter,
) {
  const auth = useAuth();
  const streamToken = useStreamToken();
  const gen = useCatalogGen(); // live refresh: bumps when the catalog changes
  const [data, setData] = useState<ItemsResponse | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0); // retry() asks again

  // Stable key for the filter so the effect doesn't refetch on every render.
  const fKey = JSON.stringify(filter ?? {});

  useEffect(() => {
    if (auth.isLoading || !auth.isAuthenticated) {
      return;
    }
    const ctrl = new AbortController();
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (limit) params.set('limit', String(limit));
    if (type) params.set('type', type);
    const f: BrowseFilter = filter ?? {};
    if (f.genre) params.set('genre', f.genre);
    if (f.yearMin) params.set('year_min', String(f.yearMin));
    if (f.yearMax) params.set('year_max', String(f.yearMax));
    if (f.ratingMin) params.set('rating_min', String(f.ratingMin));
    if (f.sort) params.set('sort', f.sort);
    if (f.unwatched) params.set('unwatched', 'true');
    const url = `/api/v1/items${params.toString() ? `?${params}` : ''}`;
    setLoading(true);
    // Clear the previous error before refetching. Without this a single
    // failure is permanent: `data` updates on the next success but `error`
    // never does, so the UI shows results and "the catalog is unavailable"
    // at the same time. usePagedItems below already does this — useItems
    // was the copy that drifted.
    setError(null);
    fetch(url, {
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${auth.user?.access_token ?? ''}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`chino-api ${r.status}`);
        return r.json() as Promise<ItemsResponse>;
      })
      .then((j) => {
        // `<img src>` can't set Authorization headers — encode the
        // long-lived stream token in the URL so the artwork proxy
        // accepts it via `?stream=`. Using the stream token (6 h TTL)
        // instead of the OIDC access token (rotates every ~5 min)
        // means the image URLs stay stable across silent renewals and
        // the browser doesn't refetch every poster on the grid every
        // few minutes.
        if (streamToken && j.items) {
          const enc = encodeURIComponent(streamToken);
          j.items = j.items.map((it) => ({
            ...it,
            poster_url: it.poster_url ? `${it.poster_url}?stream=${enc}` : undefined,
            backdrop_url: it.backdrop_url ? `${it.backdrop_url}?stream=${enc}` : undefined,
          }));
        }
        setData(j);
      })
      // An aborted request is not a failure. This effect re-runs whenever the
      // stream token mints or the catalog generation bumps, and its cleanup
      // aborts the in-flight fetch — so on essentially every search the
      // previous request rejected with AbortError and was stored as a
      // catalog outage. That is what put "The catalog is unavailable right
      // now" on screen next to two perfectly good results.
      .catch((e) => {
        if ((e as Error).name !== 'AbortError') setError(e as Error);
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
    // fKey captures every filter field, so the effect refires when any of
    // them change. Stream token is included so the first page loads as
    // soon as it's available (initial mount races: items fetch can
    // resolve before the token mint does).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, limit, type, fKey, auth.isAuthenticated, auth.isLoading, streamToken, gen, attempt]);

  const retry = () => setAttempt((a) => a + 1);

  return { data, error, loading, retry };
}

/**
 * Paged variant of useItems for the Movies / Series browse grids.
 * Accumulates pages of items, exposes loadMore() the IntersectionObserver
 * at the grid's tail can call, and tracks `hasMore` so we stop hammering
 * the endpoint once the catalogue is exhausted.
 *
 * Every piece of paging state is kept under the key of the filter it
 * belongs to (lib/paging.ts), and a filter change fetches its first page
 * directly. It used to reset the list in one effect and fetch in another,
 * which read the previous filter's "no more pages" before the reset
 * landed: after any filter whose results fit on one page, the next change
 * fetched nothing and the grid said "No movies match" - every other
 * filter change.
 */
export function usePagedItems(
  type: 'movie' | 'series' | 'album',
  pageSize: number,
  filter?: BrowseFilter,
  q?: string,
) {
  const auth = useAuth();
  const streamToken = useStreamToken();
  const gen = useCatalogGen(); // live refresh: a catalog change restarts at page 0
  const [attempt, setAttempt] = useState(0); // retry() asks for the same page again

  // The key: any change here is another list, starting at offset 0.
  const fKey = JSON.stringify({ filter: filter ?? {}, q: q ?? '', type, pageSize, gen });
  const [state, setState] = useState<PagingState<KatalogItem>>(() => freshPaging(fKey));
  const [cursor, setCursor] = useState<PageCursor>({ key: fKey, offset: 0 });
  const offset = offsetFor(cursor, fKey);
  const view = pagingFor(state, fKey);

  useEffect(() => {
    if (auth.isLoading || !auth.isAuthenticated) return;
    const key = fKey;
    const ctrl = new AbortController();
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    params.set('limit', String(pageSize));
    params.set('offset', String(offset));
    params.set('type', type);
    const f: BrowseFilter = filter ?? {};
    if (f.genre) params.set('genre', f.genre);
    if (f.yearMin) params.set('year_min', String(f.yearMin));
    if (f.yearMax) params.set('year_max', String(f.yearMax));
    if (f.ratingMin) params.set('rating_min', String(f.ratingMin));
    if (f.sort) params.set('sort', f.sort);
    setState((s) => pageRequested(s, key));
    fetch(`/api/v1/items?${params}`, {
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${auth.user?.access_token ?? ''}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`chino-api ${r.status}`);
        return r.json() as Promise<ItemsResponse>;
      })
      .then((j) => {
        if (ctrl.signal.aborted) return;
        // Use the long-lived stream token in image URLs so silent
        // renews don't reload every poster on the grid.
        const page = (j.items ?? []).map((it) => {
          if (!streamToken) return it;
          const enc = encodeURIComponent(streamToken);
          return {
            ...it,
            poster_url: it.poster_url ? `${it.poster_url}?stream=${enc}` : undefined,
            backdrop_url: it.backdrop_url ? `${it.backdrop_url}?stream=${enc}` : undefined,
          };
        });
        // A short page = end of stream. Definitive signal regardless
        // of whether the server emits a count.
        setState((s) => pageLoaded(s, key, offset, page, pageSize));
      })
      .catch((e) => {
        if (ctrl.signal.aborted || (e as Error).name === 'AbortError') return;
        setState((s) => pageFailed(s, key, e as Error));
      });
    return () => ctrl.abort();
    // streamToken in deps so the page lands once the token is ready
    // (first mount races: the items fetch can resolve before the
    // /me/stream-token mint does); the page fetched again replaces its
    // rows, fresh URLs and all. OIDC token is NOT in deps — the
    // image URLs use stream token, and the bearer header is read at
    // fetch time so a renewal doesn't need a refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset, fKey, auth.isAuthenticated, auth.isLoading, streamToken, attempt]);

  const loadMore = () => {
    const next = nextPageOffset(state, fKey);
    if (next !== null) setCursor({ key: fKey, offset: next });
  };
  const retry = () => setAttempt((a) => a + 1);

  return { items: view.items, error: view.error, loading: view.loading, hasMore: view.hasMore, loadMore, retry };
}
