import { useEffect, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { useStreamToken } from './useStreamToken';
import type { ExtraRef, TrailerRef } from './useItem';
import { heroPoolOrder, heroTrailer } from '../lib/heroPool';

export interface HeroEntry {
  id: string;
  /** 'movie' or 'series': what Play does depends on it. */
  type: string;
  title: string;
  description?: string;
  year?: number;
  rating?: number;
  backdrop_url?: string;
  poster_url?: string;
  // YouTube video id parsed from the trailer URL. Empty when the entry
  // is in the pool with a trailer this server plays and no YouTube link.
  ytKey: string;
  /** The trailer this server plays, which the hero's Trailer opens on the
   *  trailer page (lib/heroPool.ts). */
  extraId?: string;
  /** Without one: the link to a trailer online its Trailer opens. */
  trailerUrl?: string;
}

/**
 * useHeroPool returns a (cached, shuffled) list of catalogue items
 * that have a trailer: one this server plays, or a YouTube link
 * (lib/heroPool.ts) - the ones this server plays first. The hero strip
 * cycles through these every ~20 s. Implementation notes:
 *
 *  - The /v1/items list endpoint doesn't include trailers (kept
 *    lightweight). We fetch a small pool of candidates (top-rated +
 *    recent) and then issue per-item /v1/items/{id} requests in
 *    parallel to harvest trailers. Cached in sessionStorage so a SPA
 *    re-render doesn't refetch.
 *  - We bias toward high-rating items (rating >= 7) because trailers
 *    for B-list catalogue tend to be missing or low-quality.
 *  - Poster / backdrop URLs are rewritten with the long-lived stream
 *    token so silent renews don't break artwork.
 */
// Bump key when the upstream query shape changes — old caches built
// under different filters live forever in sessionStorage otherwise.
// v3 added series to the pool: in the live catalogue only 1 movie has
// a trailer enriched, while 328 series do, so a movie-only query
// produced a 1-entry pool and the rotation never kicked in
// (rotation requires pool.length >= 2). Mixing both pools fills the
// 8-slot rotation reliably. v4 records each entry's type: Play on a
// series plays an episode, not the series' own id. v5 lets in a title
// whose trailer this server plays, first, and records what each entry's
// Trailer opens.
const CACHE_KEY = 'chino:hero-pool:v5';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h — fresh enough that newly-added items show up next session

interface PoolCache { at: number; entries: HeroEntry[] }

export function useHeroPool(): HeroEntry[] {
  const auth = useAuth();
  const streamToken = useStreamToken();
  const [pool, setPool] = useState<HeroEntry[]>(() => readCache()?.entries ?? []);

  useEffect(() => {
    if (auth.isLoading || !auth.isAuthenticated) return;
    const cached = readCache();
    if (cached && Date.now() - cached.at < CACHE_TTL_MS && cached.entries.length > 0) {
      setPool(cached.entries);
      return;
    }
    const token = auth.user?.access_token;
    if (!token) return;
    const ctrl = new AbortController();
    void (async () => {
      try {
        // Movies AND series: in the live catalogue only ~1 movie has a
        // trailer enriched, while ~328 series do. A movie-only query
        // produced a single-entry pool and the rotation never kicked
        // in (rotation requires pool.length >= 2). Pull both in
        // parallel, concat the results, shuffle below.
        const headers = { Authorization: `Bearer ${token}` };
        const [rMov, rSer] = await Promise.all([
          fetch('/api/v1/items?limit=40&type=movie&sort=newest', { signal: ctrl.signal, headers }),
          fetch('/api/v1/items?limit=40&type=series&sort=newest', { signal: ctrl.signal, headers }),
        ]);
        if (!rMov.ok && !rSer.ok) return;
        type RawItem = { id: string; type?: string; title: string; description?: string; year?: number; rating?: number; backdrop_url?: string; poster_url?: string };
        const jMov = rMov.ok ? (await rMov.json()) as { items: RawItem[] } : { items: [] };
        const jSer = rSer.ok ? (await rSer.json()) as { items: RawItem[] } : { items: [] };
        const candidates: RawItem[] = [
          ...(jMov.items ?? []).map((it) => ({ ...it, type: it.type || 'movie' })),
          ...(jSer.items ?? []).map((it) => ({ ...it, type: it.type || 'series' })),
        ];
        const enc = streamToken ? encodeURIComponent(streamToken) : '';
        // Parallel detail fetches. Limited to 40 → minor traffic.
        const settled = await Promise.allSettled(
          candidates.map((c) =>
            fetch(`/api/v1/items/${c.id}`, {
              signal: ctrl.signal,
              headers: { Authorization: `Bearer ${token}` },
            }).then((rr) => (rr.ok ? rr.json() : null)),
          ),
        );
        const entries: HeroEntry[] = [];
        for (let i = 0; i < settled.length; i++) {
          const s = settled[i];
          if (s.status !== 'fulfilled' || !s.value) continue;
          const d = s.value as { trailers?: TrailerRef[]; extras?: ExtraRef[]; description?: string };
          // A trailer this server plays, or a YouTube link; else not one
          // for the hero.
          const trailer = heroTrailer(d);
          if (!trailer) continue;
          const c = candidates[i];
          entries.push({
            id: c.id,
            type: c.type ?? 'movie',
            title: c.title,
            description: d.description || c.description,
            year: c.year,
            rating: c.rating,
            backdrop_url: c.backdrop_url && enc ? `${c.backdrop_url}?stream=${enc}` : c.backdrop_url,
            poster_url: c.poster_url && enc ? `${c.poster_url}?stream=${enc}` : c.poster_url,
            ytKey: trailer.ytKey,
            extraId: trailer.extraId,
            trailerUrl: trailer.url,
          });
        }
        // Those this server plays first, each group shuffled so the
        // rotation isn't always rating-sorted; eight of them.
        const sliced = heroPoolOrder(entries);
        if (sliced.length > 0) {
          writeCache({ at: Date.now(), entries: sliced });
          setPool(sliced);
        }
      } catch {
        // swallow — pool stays empty, hero falls back to its static
        // "first recent movie" rendering.
      }
    })();
    return () => ctrl.abort();
  }, [auth.isAuthenticated, auth.isLoading, auth.user?.access_token, streamToken]);

  return pool;
}

function readCache(): PoolCache | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PoolCache;
  } catch {
    return null;
  }
}
function writeCache(p: PoolCache) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(p));
  } catch {
    // quota or disabled storage — pool just won't survive a reload.
  }
}
