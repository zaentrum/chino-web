import { useEffect, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import type { KatalogItem } from './useItems';
import { useStreamToken } from './useStreamToken';
import { useCatalogGen } from './useCatalogEvents';
import { isNotFoundStatus } from '../lib/reportPolicy';

export interface CastEntry {
  // katalog-api now carries the catalogue person id on each cast/crew
  // entry so the detail page can link the name to the Person surface.
  // Absent for un-linked credits — the UI skips the link in that case.
  person_id?: string;
  name: string;
  // An open token: actor, creator, director, writer, producer, composer,
  // cinematographer, editor, or any other (lib/credits.ts names them).
  // katalog-api sends the credits role by role, in that order, and within a
  // role in billing order.
  role?: string;
  // The job within the role ("Screenplay"), the part an actor plays, the
  // billing order within the role (0 first) and how many episodes of a
  // series the credit covers. Each is omitted when unknown.
  job?: string;
  character?: string;
  order?: number;
  episode_count?: number;
}

export interface SubtitleRef {
  id: string;
  lang: string;
  label?: string;
  format?: string;
  default?: boolean;
}

export interface TrailerRef {
  site?: string;
  external_id?: string;
  url: string;
  title?: string;
}

export interface SegmentSummary {
  has_intro: boolean;
  has_credits: boolean;
  has_recap: boolean;
  count: number;
}

export interface ItemDetail extends KatalogItem {
  tagline?: string;
  season_number?: number;
  episode_number?: number;
  parent_id?: string;
  genres?: string[];
  cast?: CastEntry[];
  subtitles?: SubtitleRef[];
  trailers?: TrailerRef[];
  segments?: SegmentSummary;
}

/**
 * What became of the request: still on its way, the item, no such item
 * (404, 410, or an id that is not one: 400), or a failure — the catalog
 * did not answer, or answered with an error.
 */
export type ItemStatus = 'loading' | 'ok' | 'not-found' | 'error';

/**
 * Fetch a single catalogue entry by id. Used by the detail page —
 * separate from `useItems` so each item lookup is independent and the
 * player page can reuse it. Tells "not there" from "not loaded" in
 * `status`, so the page can say which instead of spinning forever, and
 * `retry` asks again.
 */
export function useItem(itemId: string | undefined) {
  const auth = useAuth();
  const streamToken = useStreamToken();
  // Live refresh: bumps on catalog changes AND on a bfcache Back
  // restore, so watched_at (and the rest of the payload) doesn't stay
  // stale while the CW-driven state refetches.
  const gen = useCatalogGen();
  const [data, setData] = useState<ItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<ItemStatus>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!itemId || auth.isLoading || !auth.isAuthenticated) return;
    const ctrl = new AbortController();
    setLoading(true);
    fetch(`/api/v1/items/${itemId}`, {
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${auth.user?.access_token ?? ''}` },
    })
      .then((r) => {
        if (r.status === 400 || isNotFoundStatus(r.status)) return null;
        if (!r.ok) throw new Error(`chino-api ${r.status}`);
        return r.json() as Promise<ItemDetail>;
      })
      .then((j) => {
        if (!j) {
          setData(null);
          setStatus('not-found');
          return;
        }
        // Long-lived stream token in image URLs so silent renews
        // don't refetch the hero / poster.
        const enc = streamToken ? encodeURIComponent(streamToken) : '';
        setData({
          ...j,
          poster_url: j.poster_url && enc ? `${j.poster_url}?stream=${enc}` : j.poster_url,
          backdrop_url: j.backdrop_url && enc ? `${j.backdrop_url}?stream=${enc}` : j.backdrop_url,
        });
        setStatus('ok');
      })
      .catch((e) => {
        if (ctrl.signal.aborted || (e as Error).name === 'AbortError') return;
        // A refetch that failed leaves the item on screen as it was.
        setStatus((s) => (s === 'ok' ? s : 'error'));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [itemId, auth.isAuthenticated, auth.isLoading, streamToken, gen, attempt]);

  const retry = () => {
    setStatus((s) => (s === 'ok' ? s : 'loading'));
    setAttempt((a) => a + 1);
  };

  return { data, loading, status, retry };
}
