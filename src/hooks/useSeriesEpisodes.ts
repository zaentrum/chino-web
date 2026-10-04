import { useEffect, useMemo, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import type { KatalogItem } from './useItems';
import { useCatalogGen } from './useCatalogEvents';
import { useStreamToken } from './useStreamToken';

export interface EpisodeItem extends KatalogItem {
  season_number?: number;
  episode_number?: number;
  parent_id?: string;
  watched_at?: string | null;
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

  useEffect(() => {
    if (!seriesId || auth.isLoading || !auth.isAuthenticated) return;
    const ctrl = new AbortController();
    setLoading(true);
    fetch(`/api/v1/series/${seriesId}/episodes`, {
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${auth.user?.access_token ?? ''}` },
    })
      .then((r) => (r.ok ? r.json() : { seasons: [] }))
      .then((j) => setRaw(j.seasons ?? []))
      .catch(() => setRaw([]))
      .finally(() => setLoading(false));
    return () => ctrl.abort();
    // The bearer is read when the effect runs, not tracked: a silent
    // renewal must not refetch the episodes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesId, auth.isAuthenticated, auth.isLoading, gen]);

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

  return { seasons, loading };
}
