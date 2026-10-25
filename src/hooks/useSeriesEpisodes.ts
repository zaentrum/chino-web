import { useEffect, useMemo, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import type { KatalogItem } from './useItems';
import { useCatalogGen } from './useCatalogEvents';
import { useStreamToken } from './useStreamToken';
import { HttpError } from '../lib/loadFailure';

export interface EpisodeItem extends KatalogItem {
  season_number?: number;
  episode_number?: number;
  parent_id?: string;
  watched_at?: string | null;
  // One file that holds several episodes (lib/episodeFiles.ts): on its
  // holder, the others' ids and the last episode number it holds; on each
  // of the others, the holder's id.
  coveredBy?: string;
  covers?: string[];
  episodeEnd?: number;
  // On the holder: how long its file is, as measured - the length of the
  // one thing that plays, not of any one episode it holds (chino-api).
  file_duration_ms?: number;
}

export interface Season {
  season: number;
  episodes: EpisodeItem[];
}

export function useSeriesEpisodes(seriesId: string | undefined) {
  const auth = useAuth();
  // Live refresh: bumps on catalog changes AND on a bfcache Back
  // restore, so the per-episode watched checks don't stay stale next
  // to the freshly-refetched continue-watching row state.
  const gen = useCatalogGen();
  // Episode artwork carries the stream token, like every other image: it
  // lives 6 h and survives a silent renewal, so a renewal neither refetches
  // the list nor re-downloads every thumbnail, and the bearer stays out of
  // URLs (and so out of access logs).
  const streamToken = useStreamToken();
  const [raw, setRaw] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  // Why the episodes couldn't load (an HttpError with its status, or the
  // network's), for the page to say so where they go - never a series
  // with no episodes (lib/loadFailure.ts). A refetch that fails keeps the
  // episodes shown as they were.
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!seriesId || auth.isLoading || !auth.isAuthenticated) return;
    const ctrl = new AbortController();
    setLoading(true);
    fetch(`/api/v1/series/${seriesId}/episodes`, {
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${auth.user?.access_token ?? ''}` },
    })
      .then((r) => {
        if (!r.ok) throw new HttpError(r.status);
        return r.json() as Promise<{ seasons?: Season[] }>;
      })
      .then((j) => {
        setRaw(j.seasons ?? []);
        setError(null);
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted || (e as Error)?.name === 'AbortError') return;
        setError(e);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
    // The bearer is read when the effect runs, not tracked: a silent
    // renewal must not refetch the episodes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesId, auth.isAuthenticated, auth.isLoading, gen, attempt]);

  const retry = () => {
    setLoading(true);
    setAttempt((a) => a + 1);
  };

  const seasons = useMemo<Season[]>(() => {
    const enc = streamToken ? encodeURIComponent(streamToken) : '';
    return raw.map((s) => ({
      season: s.season,
      episodes: (s.episodes ?? []).map((e) => ({
        ...e,
        poster_url: e.poster_url && enc ? `${e.poster_url}?stream=${enc}` : e.poster_url,
        backdrop_url: e.backdrop_url && enc ? `${e.backdrop_url}?stream=${enc}` : e.backdrop_url,
      })),
    }));
  }, [raw, streamToken]);

  // Failed with nothing older to show: what the page says instead.
  const failed = error !== null && raw.length === 0 ? error : null;
  return { seasons, loading, error: failed, retry };
}
