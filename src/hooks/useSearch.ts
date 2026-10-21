import { useEffect, useMemo, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import type { KatalogItem } from './useItems';
import type { PersonSummary } from './usePeople';
import { useStreamToken } from './useStreamToken';
import { useCatalogGen } from './useCatalogEvents';
import { withStreamToken } from '../lib/artwork';
import {
  mergeAsBefore,
  searchAsBeforeUrls,
  searchIsMissing,
  searchUrl,
  type SearchMatch,
  type SearchRequest,
  type SearchSeries,
} from '../lib/search';

/** A title a search found: a catalogue item, how it matched, and an
 *  episode's series. */
export interface SearchHit extends KatalogItem {
  match?: SearchMatch;
  series?: SearchSeries;
}

/** A person a search found. */
export interface SearchPerson extends PersonSummary {
  match?: SearchMatch;
}

export interface SearchResult {
  /** Best first, films and series ranked together: rendered in this order. */
  items: SearchHit[];
  people: SearchPerson[];
}

/**
 * One search of the catalog, GET /api/v1/search (lib/search.ts): the titles
 * ranked together by how they match the query, and the people apart, in one
 * call. A server older than the search answers 404; it is then searched as
 * before, films, then series, then people. Artwork URLs carry the stream
 * token, added on the way out as usePeople does, so a token minted after the
 * results arrived fixes them without searching again. A catalog change
 * searches again, as the lists do.
 */
export function useSearch(q: string | undefined, request: SearchRequest) {
  const auth = useAuth();
  const streamToken = useStreamToken();
  const gen = useCatalogGen();
  const [data, setData] = useState<SearchResult | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(!!q);
  const key = JSON.stringify(request);

  useEffect(() => {
    if (auth.isLoading || !auth.isAuthenticated) return;
    if (!q) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    const get = (url: string) =>
      fetch(url, { signal: ctrl.signal, headers: { Authorization: `Bearer ${auth.user?.access_token ?? ''}` } });
    const json = async <T,>(r: Response): Promise<T> => {
      if (!r.ok) throw new Error(`chino-api ${r.status}`);
      return (await r.json()) as T;
    };
    const asBefore = async (): Promise<SearchResult> => {
      const urls = searchAsBeforeUrls(q, request);
      const [movies, series, people] = await Promise.all([
        get(urls.movies).then((r) => json<{ items?: SearchHit[] }>(r)),
        get(urls.series).then((r) => json<{ items?: SearchHit[] }>(r)),
        // People were best effort before the search, and stay so here.
        get(urls.people)
          .then((r) => json<{ people?: SearchPerson[] }>(r))
          .catch((e) => {
            if ((e as Error).name === 'AbortError') throw e;
            return { people: [] as SearchPerson[] };
          }),
      ]);
      return { items: mergeAsBefore(movies.items ?? [], series.items ?? []), people: people.people ?? [] };
    };
    setLoading(true);
    setError(null); // a recovered outage must not still read as broken
    get(searchUrl(q, request))
      .then((r) =>
        searchIsMissing(r.status)
          ? asBefore()
          : json<Partial<SearchResult>>(r).then((j) => ({ items: j.items ?? [], people: j.people ?? [] })),
      )
      .then((res) => setData(res))
      // An aborted search is not a failure: the next keystroke, a minted
      // stream token or a catalog change cut it short.
      .catch((e) => {
        if ((e as Error).name !== 'AbortError') setError(e as Error);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
    // key stands for request's fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, key, auth.isAuthenticated, auth.isLoading, gen]);

  const withArtwork = useMemo(
    () =>
      data && {
        items: data.items.map((it) => ({
          ...it,
          poster_url: withStreamToken(it.poster_url, streamToken),
          backdrop_url: withStreamToken(it.backdrop_url, streamToken),
          series: it.series && { ...it.series, poster_url: withStreamToken(it.series.poster_url, streamToken) },
        })),
        people: data.people.map((p) => ({
          ...p,
          profile_url: p.has_profile ? withStreamToken(p.profile_url, streamToken) : undefined,
        })),
      },
    [data, streamToken],
  );

  return { data: withArtwork, error, loading };
}
