import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from 'react-oidc-context';
import { useStreamToken } from './useStreamToken';
import { pickZapMidpoint, stampFirstCardSeek } from './useZapMidpoint';
import { zapPrefetcher, type ZapPrefetchTarget } from '../lib/zapPrefetch';
import type { KatalogItem } from './useItems';

// Background segment prefetch for the Zap pager. Drives the
// module-level `zapPrefetcher` off the feed queue + the active card so
// that swiping to the next card — and opening Zap cold — begins
// instantly. See src/lib/zapPrefetch.ts for the cache/LRU/concurrency
// engine; this hook is just the React glue that decides WHICH cards to
// warm and HOW to build each card's master URL (which must match what
// ZapCard actually plays, byte-for-byte on the caps/quality params).

/** How many cards ahead of the active one we warm. 3 keeps us a couple
 *  of swipes ahead without burning bytes on cards the user is unlikely
 *  to reach this session. The engine dedups, so re-settling on the same
 *  card costs nothing. */
const LOOKAHEAD = 3;

/** Caps advertised on the master URL. MUST equal ZapCard's ZAP_CAPS so
 *  the warmed master URL is byte-identical to the one the player builds
 *  (same stream token + q + caps → same cache key). The per-device-
 *  correct format itself comes from the upstream packaged-ids feed
 *  filter + single-rendition passthrough, not from these caps selecting
 *  a rung — matching them just guarantees we hit the same cache entry. */
const ZAP_CAPS = 'avc,hvc,aac,opus,mp3';

/** Replicates ZapCard.pickQuality() so the warmed rung matches the rung
 *  the card will request. Kept in lockstep by hand — a mismatch just
 *  warms a rung the player won't read (wasted bytes, not a correctness
 *  bug), exactly the failure mode the server-side prewarm already
 *  tolerates. */
function pickQuality(): 'low' | 'medium' {
  type NavConn = { effectiveType?: string; saveData?: boolean };
  const c = (navigator as Navigator & { connection?: NavConn }).connection;
  if (!c) return 'medium';
  if (c.saveData) return 'low';
  if (c.effectiveType && /^(slow-2g|2g|3g)$/.test(c.effectiveType)) return 'low';
  return 'medium';
}

/** Build the master.m3u8 URL for a queue item exactly as ZapCard does:
 *  same stream token, same q, same caps. Returns null when we can't yet
 *  build a usable URL (no stream token) or when the card has no sane
 *  seek point (too-short content → 'fallback'). */
function buildTarget(
  item: KatalogItem,
  streamToken: string,
  bearer: string | undefined,
): ZapPrefetchTarget | null {
  // Resolve the seek the same way ZapCard's midpoint memo does: prefer
  // a stamped seekSec, else derive from duration. We don't have the
  // analyzer segments here (ZapCard fetches them per-card), so this is
  // exact ONLY when the item carries a stamped __zapSeekSec — i.e. the
  // server warm-pool seek, OR the deterministic first card (stampFirst-
  // CardSeek). For those the warmed bytes are exactly what the player
  // reads. For un-stamped look-ahead cards ZapCard re-rolls a fresh
  // random ratio per mount, so DEFAULT_RATIO here is only a best-guess
  // approximation of which segments to warm — a cache miss there costs
  // a cold fetch, not correctness.
  let seekSec: number;
  if (typeof item.__zapSeekSec === 'number' && item.__zapSeekSec > 0) {
    seekSec = item.__zapSeekSec;
  } else {
    const mid = pickZapMidpoint({ durationMs: item.duration_ms });
    if (mid.source === 'fallback' || mid.seekSec <= 0) return null;
    seekSec = mid.seekSec;
  }

  const params = new URLSearchParams({
    stream: streamToken,
    q: pickQuality(),
    caps: ZAP_CAPS,
  });
  return {
    id: item.id,
    masterUrl: `/api/v1/items/${item.id}/play/master.m3u8?${params.toString()}`,
    seekSec,
    bearer,
  };
}

interface UseZapPrefetchOpts {
  /** The pager queue from useZapFeed. We warm the next LOOKAHEAD
   *  entries after the active card. */
  queue: KatalogItem[];
  /** The currently-settled card id. null until the first card mounts. */
  activeId: string | null;
}

/**
 * Wire the byte-prefetch into the Zap pager. Two triggers:
 *   (1) feed yields / grows  → warm the head of the queue
 *   (2) a card settles       → warm further ahead of the new active card
 * Both funnel through the same `prefetchAhead` so the engine's dedup +
 * concurrency cap + LRU budget govern everything.
 *
 * Cancellation: every in-flight warm is aborted on unmount (leaving
 * Zap). Bookkeeping survives so a re-entry still dedups against what we
 * already warmed this session.
 */
export function useZapPrefetch({ queue, activeId }: UseZapPrefetchOpts): void {
  const auth = useAuth();
  const streamToken = useStreamToken();
  const bearer = auth.user?.access_token;

  // Read queue/token through refs so the warm callback identity stays
  // stable and effects don't churn on every queue tick.
  const queueRef = useRef(queue);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  const streamTokenRef = useRef(streamToken);
  useEffect(() => { streamTokenRef.current = streamToken; }, [streamToken]);
  const bearerRef = useRef(bearer);
  useEffect(() => { bearerRef.current = bearer; }, [bearer]);

  /** Warm the LOOKAHEAD cards starting AFTER `fromId` (or from the head
   *  when fromId is null/not-found). Dedup is the engine's job — we
   *  just enumerate candidates and hand them over. */
  const prefetchAhead = useCallback((fromId: string | null) => {
    const token = streamTokenRef.current;
    if (!token) return;
    const q = queueRef.current;
    if (q.length === 0) return;
    const idx = fromId ? q.findIndex((it) => it.id === fromId) : -1;
    // Start at the card AFTER the active one (idx + 1); when there's no
    // active card yet (cold open) start at the head so the very first
    // card is warmed first.
    const start = idx >= 0 ? idx + 1 : 0;
    const slice = q.slice(start, start + LOOKAHEAD);
    for (const item of slice) {
      if (zapPrefetcher.hasWarmed(item.id)) continue;
      const target = buildTarget(item, token, bearerRef.current);
      if (!target) continue;
      void zapPrefetcher.prefetch(target);
    }
  }, []);

  // Trigger (1): feed yields / grows. Warm the head of the queue as soon
  // as cards (and the stream token) are available, before the user has
  // settled on anything.
  useEffect(() => {
    if (!streamToken || queue.length === 0) return;
    prefetchAhead(activeId);
    // queue identity changes when useZapFeed appends — re-run so newly
    // appended look-ahead cards get warmed too.
  }, [queue, streamToken, activeId, prefetchAhead]);

  // Trigger (2) is folded into the effect above via `activeId` in the
  // dep array: each settle re-runs prefetchAhead from the new active
  // card, warming further ahead. Kept as one effect to avoid
  // double-firing the same warm on a tick where both queue and activeId
  // change together.

  // Cancellation: abort all in-flight warms when the pager unmounts
  // (user leaves Zap / route change). Preserve the warmed bookkeeping.
  useEffect(() => {
    return () => zapPrefetcher.cancelAll();
  }, []);
}

/**
 * App-start warm. Kick a lightweight prefetch of just the FIRST upcoming
 * Zap card so that opening Zap from a cold home screen is instant.
 *
 * Deliberately decoupled from the screens: the caller passes the
 * top-ranked candidate (id + duration + the server seekSec if known); we
 * stamp the DETERMINISTIC first-card seek (FIRST_CARD_RATIO) onto it,
 * build the master URL, and warm exactly one card, once per session.
 * Because the Zap screen stamps its own first card with the SAME
 * deterministic helper, the init + seek-window segments we warm here are
 * exactly the bytes that card plays first — no random-roll mismatch.
 * Returns nothing — fire and forget. No-op without a stream token (the
 * home screen may render before the token mints; the caller can
 * re-invoke once it has one).
 */
export function useZapAppStartWarm(firstCandidate: KatalogItem | null | undefined): void {
  const auth = useAuth();
  const streamToken = useStreamToken();
  const bearer = auth.user?.access_token;

  useEffect(() => {
    if (!streamToken || !firstCandidate) return;
    if (!zapPrefetcher.markAppStartWarmed()) return; // already done this session
    // Stamp the deterministic seek so this warm targets the SAME card[0]
    // (top-ranked candidate + fixed ratio) the Zap screen will show.
    const target = buildTarget(stampFirstCardSeek(firstCandidate), streamToken, bearer);
    if (!target) return;
    void zapPrefetcher.prefetch(target);
    // Intentionally do NOT cancelAll on unmount here: the whole point is
    // the bytes survive the home→zap transition. The Zap pager owns
    // cancellation of the look-ahead warms.
  }, [streamToken, firstCandidate, bearer]);
}

// Re-export the target shape for any caller that wants to warm ad-hoc.
export type { ZapPrefetchTarget } from '../lib/zapPrefetch';
