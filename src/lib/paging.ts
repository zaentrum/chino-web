// The paging behind the Movies and Shows grids (hooks/useItems.ts:
// usePagedItems), as pure state transitions. Every state names the filter it
// belongs to - its key - so nothing of one filter's paging (its offset, its
// "no more pages") can leak into the next one's. Pure: paging.test.ts runs
// it under node --test.

export interface PagingState<T> {
  /** The filter, query, type, page size and catalog generation the items are for. */
  key: string;
  items: T[];
  /** False once a page came back short: there is nothing further to ask for. */
  hasMore: boolean;
  loading: boolean;
  error: Error | null;
}

/** Where the next request starts, and for which filter. */
export interface PageCursor {
  key: string;
  offset: number;
}

/** The state of a filter whose first page has not been asked for yet. */
export function freshPaging<T>(key: string): PagingState<T> {
  return { key, items: [], hasMore: true, loading: true, error: null };
}

/** The state as the grid for `key` sees it. A state kept for another filter
 *  is not this filter's: its first page is on its way, nothing else is
 *  known about it. */
export function pagingFor<T>(state: PagingState<T>, key: string): PagingState<T> {
  return state.key === key ? state : freshPaging<T>(key);
}

/** The offset to fetch for `key`: the page asked for under this key, or 0 -
 *  a filter change fetches its first page directly. */
export function offsetFor(cursor: PageCursor, key: string): number {
  return cursor.key === key ? cursor.offset : 0;
}

export function pageRequested<T>(state: PagingState<T>, key: string): PagingState<T> {
  return { ...pagingFor(state, key), loading: true, error: null };
}

/** A page arrived. It replaces whatever the list held from its offset on, so
 *  a page fetched again (once the stream token is there, say) brings its
 *  fresh URLs instead of being dropped as a duplicate. A short page is the
 *  last one. */
export function pageLoaded<T extends { id: string }>(
  state: PagingState<T>,
  key: string,
  offset: number,
  page: T[],
  pageSize: number,
): PagingState<T> {
  const kept = pagingFor(state, key).items.slice(0, offset);
  const seen = new Set(kept.map((it) => it.id));
  return {
    key,
    items: [...kept, ...page.filter((it) => !seen.has(it.id))],
    hasMore: page.length >= pageSize,
    loading: false,
    error: null,
  };
}

export function pageFailed<T>(state: PagingState<T>, key: string, error: Error): PagingState<T> {
  return { ...pagingFor(state, key), loading: false, error };
}

/** The offset of the page after the ones held, or null when there is none to
 *  ask for: one is loading, the last one failed, or the list is complete. */
export function nextPageOffset<T>(state: PagingState<T>, key: string): number | null {
  const s = pagingFor(state, key);
  if (s.loading || s.error || !s.hasMore) return null;
  return s.items.length;
}
