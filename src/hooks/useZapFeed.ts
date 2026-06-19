import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import type { KatalogItem } from './useItems';
import type { ZapItemFeatures } from './useZapPreferences';

/** ε for ε-greedy sampling: 60 % of picks ignore the score and pick
 *  uniformly from the pool. Higher than a textbook ε because on a
 *  cold Zap session the preference vector is empty — without enough
 *  exploration the "exploit" branch collapses to "always pick the
 *  highest-rated item" and the queue order feels deterministic across
 *  sessions. Preferences still steer the feed once they accumulate
 *  via the 40 % exploit branch. */
const EPSILON = 0.6;

/** Tiny additive jitter to every score in the exploit branch so two
 *  equally-rated candidates (e.g. all the unwatched 9.0+ titles in
 *  the pool) don't always tie-break the same way. ±0.05 is comparable
 *  to the rating-bias delta between 9.5 and 10.0, so it can flip the
 *  pick at the top of the rating distribution but is small enough
 *  that a learned genre preference (which sums to ~0.5+ after a
 *  couple of dwells) will still dominate. */
const SCORE_JITTER = 0.05;

/** Fisher-Yates in place. Returns the same array for chaining
 *  convenience. Math.random() is good enough for "vary the order the
 *  user sees" — we don't need crypto-grade entropy. */
function shuffleInPlace<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }
  return items;
}

/** How many items we keep in the candidate pool. Larger → more variety,
 *  more upfront API load. 60 is enough that after dedup against watched
 *  + already-shown we still have headroom. */
const POOL_SIZE_PER_TYPE = 30;

/** Server warm-pool max — matches zapPoolSize on chino-stream. We don't
 *  request more than this even when the client wants more, because the
 *  server clamps anyway and there's no point burning a request. */
const ZAP_FEED_LIMIT = 8;

/** Hard timeout on the server warm-pool fetch. The fetch is on the
 *  hot path of refill() so we'd rather miss it and use the cold pool
 *  than block the channel-flip waiting for chino-stream. */
const ZAP_FEED_TIMEOUT_MS = 1500;

/** Shape of one item returned by GET /api/v1/play/zap-feed. */
interface ZapFeedItem {
  id?: string;
  type?: string;
  title?: string;
  year?: number;
  rating?: number;
  duration_ms?: number;
  poster_url?: string;
  backdrop_url?: string;
  seek_sec?: number;
  mid_source?: string;
}

interface UseZapFeedOpts {
  /** Score function from useZapPreferences. Default: zero everywhere.
   *  Re-read through a ref so passing a fresh closure each render
   *  doesn't churn the hook's internal callable identity. */
  scoreItem?: (features: ZapItemFeatures) => number;
}

interface UseZapFeedResult {
  /** Items in the order the pager should consume them. Items are POPPED
   *  by markShown() — the array shrinks as the user zaps through. */
  queue: KatalogItem[];
  /** Mark an id as already shown so it never resurfaces this session.
   *  Idempotent — safe to call from React's strict-mode double-invoke. */
  markShown: (id: string) => void;
  /** Top up the queue when it gets short. Called by ZapSection on
   *  every advance. */
  refill: () => void;
  loading: boolean;
  /** Pool is exhausted (no more candidates after dedup). Tell the user. */
  empty: boolean;
}

/**
 * Build a candidate pool for the Zap pager out of existing catalog
 * endpoints. V1 makes three parallel fetches:
 *
 *   - GET /api/v1/items?type=movie&sort=rating
 *   - GET /api/v1/items?type=series&sort=newest
 *   - GET /api/v1/items?type=episode&sort=newest
 *
 * dedups against the user's watch history + a session-local shown-set,
 * then ε-greedy samples a queue of N items using the provided scoring
 * function. When the queue drops below 5 we sample more from the same
 * pool until it's exhausted.
 *
 * Note on scoring: the pool here is KatalogItem (id/title/year/rating
 * only — no genres/cast yet). Scoring keys on `type` for V1; full
 * feature-based scoring (genres + cast) kicks in inside ZapCard once
 * it lazy-loads /api/v1/items/{id}. Re-sorting the unshown tail by the
 * updated vector is V2 work.
 */
export function useZapFeed(opts: UseZapFeedOpts = {}): UseZapFeedResult {
  const auth = useAuth();

  const [pool, setPool] = useState<KatalogItem[]>([]);
  const [queue, setQueue] = useState<KatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);

  // Session-shown set is a ref because we don't want it to trigger
  // re-renders — it's a filter, not display state.
  const shownRef = useRef<Set<string>>(new Set());
  const watchedRef = useRef<Set<string>>(new Set());
  // Mirror queue length into a ref so refill() can early-bail without
  // listing `queue` as a dep (which would re-create the callable on
  // every advance and trigger StrictMode double-fires).
  const queueLenRef = useRef(0);
  useEffect(() => { queueLenRef.current = queue.length; }, [queue.length]);
  // Single-flight gate on the server fetch: rapid swipes during
  // refill cascade would otherwise issue a fetch per swipe, draining
  // PlaysServed counters on the server faster than the worker can
  // refill the pool.
  const fetchInFlightRef = useRef(false);

  // scoreItem via ref so the hook's internal sample() identity stays
  // stable across renders even when the caller passes a fresh closure.
  const scoreItemRef = useRef(opts.scoreItem);
  useEffect(() => { scoreItemRef.current = opts.scoreItem; }, [opts.scoreItem]);

  const token = auth.user?.access_token;

  useEffect(() => {
    if (auth.isLoading || !auth.isAuthenticated || !token) return;
    const ctrl = new AbortController();
    setLoading(true);

    const fetchList = (qs: string): Promise<KatalogItem[]> =>
      fetch(`/api/v1/items?${qs}`, {
        signal: ctrl.signal,
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { items?: KatalogItem[] } | null) => j?.items ?? [])
        .catch(() => [] as KatalogItem[]);

    // Watched IDs — used to dedupe. /me/watched returns the full
    // history; we only need the ids so a 200-item ceiling is plenty.
    const fetchWatched = (): Promise<Set<string>> =>
      fetch('/api/v1/me/watched?limit=200', {
        signal: ctrl.signal,
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { items?: { id?: string }[] } | null) => {
          const s = new Set<string>();
          for (const it of j?.items ?? []) {
            if (it?.id) s.add(it.id);
          }
          return s;
        })
        .catch(() => new Set<string>());

    // Set of item ids that have a finished CMAF package on disk.
    // Packaged items skip ffmpeg entirely and serve in <50ms, so the
    // Zap pager filters its candidate pool to ONLY these — current
    // on-demand transcode cold-start is 1-3s, way outside the
    // channel-flip UX budget. Falls back to "no filter" if the
    // endpoint is missing or 5xx so older deploys still get a Zap
    // pool, just with the cold-start UX.
    const fetchPackagedIDs = (): Promise<Set<string> | null> =>
      fetch('/api/v1/play/packaged-ids', {
        signal: ctrl.signal,
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { ids?: string[] } | null) => {
          if (!j?.ids) return null;
          return new Set(j.ids);
        })
        .catch(() => null);

    Promise.all([
      fetchList(`type=movie&sort=rating&limit=${POOL_SIZE_PER_TYPE}`),
      fetchList(`type=series&sort=newest&limit=${POOL_SIZE_PER_TYPE}`),
      // Episodes are optional — if the API doesn't yet support
      // type=episode for q-less browse, this returns [] and we keep
      // the movie+series mix. No error path for the user.
      fetchList(`type=episode&sort=newest&limit=${POOL_SIZE_PER_TYPE}`),
      fetchWatched(),
      fetchPackagedIDs(),
    ]).then(([movies, series, episodes, watched, packagedIds]) => {
      watchedRef.current = watched;
      // Stamp watched_at locally too so the dedup catches items that
      // were marked watched in this session by another tab.
      const allByID = new Map<string, KatalogItem>();
      for (const it of [...movies, ...series, ...episodes]) {
        if (!it.id) continue;
        if (allByID.has(it.id)) continue;
        if (watched.has(it.id)) continue;
        if (it.watched_at) continue;
        // Filter to packaged items only when the listing is
        // available. Until packaged coverage expands, this trades
        // pool size for a snappier UX — packaged items serve in
        // tens of ms vs 1-3s cold-start on on-demand transcode.
        if (packagedIds && !packagedIds.has(it.id)) continue;
        allByID.set(it.id, it);
      }
      // Shuffle so that even the "exploit" branch (which iterates
      // candidates in array order looking for highest score) doesn't
      // bias toward a fixed prefix of the original list. Without
      // this, /api/v1/items?sort=rating leaves the pool already
      // sorted, and on a cold preference vector the first pick is
      // always the top-rated title in the catalog — same every
      // session.
      const fresh = shuffleInPlace(Array.from(allByID.values()));
      setPool(fresh);
      setEmpty(fresh.length === 0);
      setLoading(false);
    });

    return () => ctrl.abort();
    // streamToken is NOT a dep: none of the fetches above use it (the
    // bearer-Authorization paths in chino-api handle our needs), and
    // listing it as a dep used to double-fire the pool refetch on
    // cold mount as the token transitioned null → string.
  }, [auth.isLoading, auth.isAuthenticated, token]);

  // Sample a batch out of the pool. Stable across renders because all
  // scoring goes through scoreItemRef — no hook-input churn.
  const sample = useCallback((n: number, currentQueue: KatalogItem[], currentPool: KatalogItem[]): KatalogItem[] => {
    const inQueue = new Set(currentQueue.map((i) => i.id));
    const candidates = currentPool.filter((it) => !shownRef.current.has(it.id) && !inQueue.has(it.id));
    if (candidates.length === 0) return [];

    const picks: KatalogItem[] = [];
    const taken = new Set<string>();
    const scoreItem = scoreItemRef.current;
    for (let i = 0; i < n && candidates.length - taken.size > 0; i += 1) {
      // ε-greedy: with probability ε pick uniformly at random;
      // otherwise pick the highest-scoring remaining candidate.
      const explore = Math.random() < EPSILON;
      let choice: KatalogItem | undefined;
      const available = candidates.filter((c) => !taken.has(c.id));
      if (explore || !scoreItem) {
        choice = available[Math.floor(Math.random() * available.length)];
      } else {
        let bestScore = -Infinity;
        for (const c of available) {
          // Score with only type — genres/cast aren't on KatalogItem.
          // Real feature-based scoring happens once ZapCard fetches
          // ItemDetail; this is just the pre-bias.
          const s = scoreItem({ type: c.type });
          // Tiny rating tilt so two equally-unknown candidates aren't
          // identical and the deterministic .find() always returns
          // the first one in feed order. Stratifies by rating without
          // forming a hard tier. The jitter on top breaks ties
          // randomly so the same "10.0 / 9.8 / 9.5" trio doesn't
          // resolve to the same pick every session.
          const total = s + ((c.rating ?? 0) / 100) + (Math.random() * SCORE_JITTER);
          if (total > bestScore) {
            bestScore = total;
            choice = c;
          }
        }
      }
      if (!choice) break;
      picks.push(choice);
      taken.add(choice.id);
    }
    return picks;
  }, []);

  // Server warm-pool feed: chino-stream maintains an in-RAM pool of
  // pre-warmed candidates with seekSec baked in. This is the PRIMARY
  // source — the cold pool building above stays as the fallback when
  // the server returns empty (cold pod / first-N seconds after boot)
  // or 5xx. ZapCard reads __zapSeekSec / __zapMidSource to skip its
  // own client-side random-roll for these items.
  const fetchZapFeed = useCallback(async (limit: number): Promise<KatalogItem[]> => {
    if (!token) return [];
    const n = Math.max(1, Math.min(ZAP_FEED_LIMIT, limit));
    const ctrl = new AbortController();
    const tid = window.setTimeout(() => ctrl.abort(), ZAP_FEED_TIMEOUT_MS);
    try {
      const r = await fetch(`/api/v1/play/zap-feed?limit=${n}`, {
        signal: ctrl.signal,
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) return [];
      const j = (await r.json()) as { items?: ZapFeedItem[] };
      const items = j.items ?? [];
      return items
        .filter((it): it is ZapFeedItem & { id: string } => typeof it.id === 'string' && it.id.length > 0)
        .map((it) => ({
          id: it.id,
          type: it.type ?? 'movie',
          title: it.title ?? '',
          year: it.year || undefined,
          rating: it.rating || undefined,
          duration_ms: it.duration_ms || undefined,
          poster_url: it.poster_url || undefined,
          backdrop_url: it.backdrop_url || undefined,
          __zapSeekSec: typeof it.seek_sec === 'number' && it.seek_sec > 0 ? it.seek_sec : undefined,
          __zapMidSource: it.mid_source,
        }));
    } catch {
      return [];
    } finally {
      window.clearTimeout(tid);
    }
  }, [token]);

  // Initial fill. Race the server warm-pool fetch against the cold
  // pool fetch — whichever lands first with usable items wins. If the
  // server is empty (cold pod), the cold-pool effect below will fill
  // the queue via sample() when its pool resolves.
  useEffect(() => {
    if (queue.length > 0 || !token) return;
    let cancelled = false;
    (async () => {
      const items = await fetchZapFeed(ZAP_FEED_LIMIT);
      if (cancelled || items.length === 0) return;
      setQueue((q) => {
        if (q.length > 0) return q; // someone else filled
        const dedup = items.filter(
          (it) => !shownRef.current.has(it.id) && !watchedRef.current.has(it.id),
        );
        return dedup;
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // Only react to token + the first-fill condition. The queue is
    // read for its current length; the effect re-runs each render but
    // bails immediately when queue is non-empty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, fetchZapFeed]);

  // Cold-pool initial fill — runs if the server fetch above came back
  // empty (or hasn't returned yet). Idempotent against the server
  // path because of the `q.length > 0` early return.
  useEffect(() => {
    if (pool.length === 0) return;
    setQueue((q) => (q.length > 0 ? q : sample(ZAP_FEED_LIMIT, q, pool)));
  }, [pool, sample]);

  const refill: UseZapFeedResult['refill'] = useCallback(() => {
    // Gate via refs — no `queue` in this callable's deps, so its
    // identity stays stable across advances and StrictMode's double
    // invocation doesn't double-fetch.
    if (queueLenRef.current >= 5) return;
    if (fetchInFlightRef.current) return;
    const need = ZAP_FEED_LIMIT - queueLenRef.current;
    fetchInFlightRef.current = true;
    void fetchZapFeed(need)
      .then((serverItems) => {
        if (serverItems.length === 0) {
          // Server gave us nothing — fall back to client sample from
          // the cold pool. Uses functional setQueue so the read is
          // current at apply time.
          setQueue((q2) => {
            if (q2.length >= 5) return q2;
            const more = sample(ZAP_FEED_LIMIT - q2.length, q2, pool);
            if (more.length === 0 && q2.length === 0) setEmpty(true);
            return [...q2, ...more];
          });
          return;
        }
        setQueue((q2) => {
          const inQ = new Set(q2.map((it) => it.id));
          const fresh = serverItems.filter(
            (it) => !inQ.has(it.id) && !shownRef.current.has(it.id),
          );
          if (fresh.length === 0) return q2;
          return [...q2, ...fresh];
        });
      })
      .finally(() => {
        fetchInFlightRef.current = false;
      });
  }, [pool, sample, fetchZapFeed]);

  const markShown: UseZapFeedResult['markShown'] = useCallback((id) => {
    if (!id) return;
    shownRef.current.add(id);
    setQueue((q) => q.filter((it) => it.id !== id));
  }, []);

  // Stable wrapper so consumers in handleDwellEnd etc. don't see a
  // new `feed` identity on every render of ZapSection.
  return useMemo<UseZapFeedResult>(() => ({
    queue,
    markShown,
    refill,
    loading,
    empty,
  }), [queue, markShown, refill, loading, empty]);
}
