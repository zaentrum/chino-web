// Framework-light client-side byte prefetch for the Zap pager.
//
// Goal: when the user swipes to the next Zap card — and when Zap is
// opened from a cold home screen — the first frame should paint
// *instantly* instead of waiting on a network round-trip. We get there
// by walking the same HLS chain hls.js will later walk, and fetch()-ing
// the bytes so they land in the browser's HTTP cache (segments carry
// `Cache-Control: immutable`, so a plain low-priority GET warms the
// exact cache entry hls.js reads moments later).
//
// The chain, per card:
//   master.m3u8  →  video media playlist (a variant URI, or the master
//                   itself when it's single-rendition)
//                →  EXT-X-MAP init segment
//                →  the media segment(s) whose cumulative EXTINF time
//                   covers the card's seek window [seekSec, seekSec+~12s]
//   master.m3u8  →  each #EXT-X-MEDIA:TYPE=AUDIO rendition playlist
//                →  its EXT-X-MAP init + the audio segments overlapping
//                   the same seek window (so hls.js doesn't cold-fetch
//                   audio while the video is warm)
//
// KEY IDEA: the format we warm is already the per-device-correct one —
// not because we pick a rung here, but because the Zap feed is filtered
// to packaged items (upstream packaged-ids feed filter) which chino-
// stream serves via single-rendition passthrough. We prefetch the SAME
// master URL the player builds (same stream token + caps), so we follow
// the server to exactly the bytes it will hand the player. We never
// re-rank by bandwidth or hardcode a quality.
//
// This is a pure side-effect cache warmer. It owns NO React state and
// renders nothing. hls.js remains the only thing that *plays* — we just
// make sure the bytes it wants are already on disk.
//
// Being a good citizen (all enforced below):
//   - prefetch only the next 2-3 not-yet-cached cards
//   - only the seek-window segments (~10-15s), never whole movies
//   - cap concurrency (1-2 downloads at once)
//   - dedup by item id
//   - cancel all in-flight work on demand (leaving Zap)
//   - LRU-evict so the warmed set stays bounded (~200 MB)

/** Seconds of media we want warm starting at the card's seek point.
 *  ~12s covers the first couple of HLS segments hls.js loads before
 *  its own buffer pipeline takes over. Bigger = more bytes burned on a
 *  card the user may swipe straight past. */
const WINDOW_SEC = 12;

/** Hard ceiling on segments fetched per card regardless of EXTINF
 *  durations. Guards against a pathologically short target-duration
 *  playlist (e.g. 1s parts) turning a 12s window into 12 fetches. */
const MAX_SEGMENTS_PER_CARD = 4;

/** Concurrency cap across ALL prefetch byte downloads. 2 keeps us off
 *  the player's bandwidth when it spins up for the active card while
 *  still making real progress on the look-ahead. */
const MAX_CONCURRENCY = 2;

/** Bounded warmed-byte budget. Once we exceed this we LRU-evict the
 *  oldest warmed entries (drop them from our bookkeeping; the browser
 *  HTTP cache then ages them out normally). ~200 MB matches the mobile
 *  client's on-disk cap and is comfortably below a desktop cache. */
const MAX_CACHE_BYTES = 200 * 1024 * 1024;

/** Per-request timeout. A stuck segment fetch must not pin a
 *  concurrency slot forever. */
const FETCH_TIMEOUT_MS = 8000;

/** What the caller hands us to warm one card. Mirrors exactly what
 *  ZapCard builds for playback so the warmed bytes are the ones the
 *  player actually reads. */
export interface ZapPrefetchTarget {
  /** Dedup key — the catalog item id. */
  id: string;
  /** The fully-built master.m3u8 URL (same stream token, q, caps the
   *  player uses). The caps in here are what make the variant
   *  per-device-correct. */
  masterUrl: string;
  /** Where the card seeks to. We warm [seekSec, seekSec + WINDOW_SEC),
   *  NOT segment 0 — Zap lands mid-scene. */
  seekSec: number;
  /** Optional Authorization bearer. master/variant/segment requests on
   *  chino-stream accept the stream token in the URL, but passing the
   *  bearer too is harmless and matches the rest of the app. */
  bearer?: string;
}

interface WarmedEntry {
  /** Approx bytes we pulled for this id (init + segments). */
  bytes: number;
  /** Last-touch epoch ms for LRU ordering. */
  touchedAt: number;
}

/**
 * Module-singleton prefetcher. We keep it module-level (not per-hook)
 * so dedup + the LRU budget + the concurrency gate are shared across
 * every mount of the Zap pager in a session — re-entering Zap doesn't
 * re-warm cards we already warmed, and two screens can't blow the
 * concurrency cap between them.
 */
class ZapPrefetcher {
  /** ids fully (or partially) warmed → bookkeeping for LRU + dedup. */
  private warmed = new Map<string, WarmedEntry>();
  /** ids with an in-flight warm — dedup so two settle events don't
   *  double-fetch the same card. */
  private inflight = new Map<string, AbortController>();
  /** Total approx warmed bytes, kept in sync with `warmed`. */
  private totalBytes = 0;
  /** Live concurrency counter + a tiny FIFO of waiters so we never run
   *  more than MAX_CONCURRENCY byte downloads at once. Each waiter
   *  resolves to whether it was HANDED a slot (true) or woken by an
   *  abort/cancel (false). A `settled` guard makes each waiter fire its
   *  resolver exactly once so the abort path and the hand-off path can
   *  never both act on the same waiter. */
  private active = 0;
  private waiters: Array<{ settled: boolean; grant: (gotSlot: boolean) => void }> = [];

  /** True once we've already kicked the app-start single-card warm, so
   *  re-renders of the home screen don't re-fire it. */
  private appStartWarmed = false;

  hasWarmed(id: string): boolean {
    return this.warmed.has(id) || this.inflight.has(id);
  }

  markAppStartWarmed(): boolean {
    if (this.appStartWarmed) return false;
    this.appStartWarmed = true;
    return true;
  }

  /**
   * Warm a single card. No-op (returns immediately) when the id is
   * already warmed or in flight — dedup. The returned promise resolves
   * when the card's window is warm (or aborted / errored — we never
   * reject, a failed warm just means the player pays the cold cost).
   */
  async prefetch(target: ZapPrefetchTarget): Promise<void> {
    const { id } = target;
    if (!id || !target.masterUrl) return;
    if (this.hasWarmed(id)) return;

    const ctrl = new AbortController();
    this.inflight.set(id, ctrl);
    let bytes = 0;
    try {
      bytes = await this.warmCard(target, ctrl.signal);
    } catch {
      // Swallow: a failed/aborted warm is non-fatal. The player will
      // just fetch cold.
    } finally {
      this.inflight.delete(id);
    }
    if (ctrl.signal.aborted) return;
    // Record even a partial/zero warm so dedup holds and we don't
    // hammer a card whose playlist 404s every settle.
    this.record(id, bytes);
  }

  /** Cancel every in-flight warm. Called when leaving Zap / unmount /
   *  route-change. Bookkeeping (warmed set, budget) is preserved so a
   *  later re-entry still dedups. */
  cancelAll(): void {
    for (const ctrl of this.inflight.values()) ctrl.abort();
    this.inflight.clear();
    // Release any still-pending waiters so their host promises settle.
    // grant(false) = "no slot for you" (we're tearing down), and the
    // `settled` guard inside grant makes a double-release (e.g. a
    // per-signal abort listener also firing) a no-op. We do NOT touch
    // `active` here: in-flight fetches own those slots and will release
    // them via their own finally → releaseSlot().
    const waiters = this.waiters;
    this.waiters = [];
    for (const w of waiters) w.grant(false);
  }

  // ---- internals ----

  private record(id: string, bytes: number): void {
    const prev = this.warmed.get(id);
    if (prev) this.totalBytes -= prev.bytes;
    this.warmed.set(id, { bytes, touchedAt: Date.now() });
    this.totalBytes += bytes;
    this.evictIfNeeded();
  }

  /** LRU eviction: while we're over budget, drop the least-recently
   *  touched warmed entry from our bookkeeping. We don't (can't
   *  portably) purge the browser HTTP cache directly; dropping the
   *  entry just makes the id eligible to be re-warmed later and stops
   *  it counting against the budget — the browser ages the actual
   *  bytes out under its own cache pressure. */
  private evictIfNeeded(): void {
    if (this.totalBytes <= MAX_CACHE_BYTES) return;
    const byAge = Array.from(this.warmed.entries()).sort(
      (a, b) => a[1].touchedAt - b[1].touchedAt,
    );
    for (const [id, entry] of byAge) {
      if (this.totalBytes <= MAX_CACHE_BYTES) break;
      this.warmed.delete(id);
      this.totalBytes -= entry.bytes;
    }
  }

  /** Acquire a concurrency slot, awaiting if all are taken. Returns
   *  true exactly when this call now OWNS a slot — the caller must then
   *  call releaseSlot() exactly once. Returns false when the wait was
   *  cut short by an abort/cancel; in that case NO slot is owned and the
   *  caller must NOT releaseSlot().
   *
   *  Slot ownership is transferred, never re-counted: a waiter that is
   *  granted a slot does NOT increment `active` (the releasing fetch
   *  already counts it and hands it over without decrementing). This is
   *  what fixes the old leak — previously releaseSlot() decremented and
   *  the woken waiter re-incremented, but an aborted waiter left in the
   *  FIFO would be shifted by releaseSlot(), get the decrement, and
   *  never re-increment → `active` drifted down and concurrency shrank. */
  private async acquireSlot(signal: AbortSignal): Promise<boolean> {
    if (signal.aborted) return false;
    if (this.active < MAX_CONCURRENCY) {
      this.active += 1;
      return true;
    }
    return new Promise<boolean>((resolve) => {
      // One-shot resolver shared by the hand-off path and the abort
      // path. `settled` guarantees the slot is granted (or not) exactly
      // once, and that the waiter is pulled from the FIFO on abort so
      // releaseSlot() can never hand a slot to a dead waiter.
      const waiter = {
        settled: false,
        grant: (gotSlot: boolean) => {
          if (waiter.settled) return;
          waiter.settled = true;
          signal.removeEventListener('abort', onAbort);
          // gotSlot=true means releaseSlot() transferred its slot to us:
          // `active` already accounts for it, so we do NOT re-increment.
          resolve(gotSlot);
        },
      };
      const onAbort = () => {
        const i = this.waiters.indexOf(waiter);
        if (i >= 0) this.waiters.splice(i, 1);
        waiter.grant(false);
      };
      signal.addEventListener('abort', onAbort, { once: true });
      this.waiters.push(waiter);
    });
  }

  /** Release a slot owned by the caller. If a live waiter is queued,
   *  transfer the slot straight to it (no decrement → no re-increment);
   *  otherwise free the slot by decrementing `active`. The `settled`
   *  guard skips any waiter already resolved by an abort that hasn't yet
   *  been spliced out, so we never "hand" a slot into the void. */
  private releaseSlot(): void {
    let next = this.waiters.shift();
    while (next && next.settled) next = this.waiters.shift();
    if (next) {
      next.grant(true); // transfer ownership; `active` unchanged
      return;
    }
    this.active = Math.max(0, this.active - 1);
  }

  /** Walk master → video media playlist + every audio rendition → each
   *  one's init + window segments. Returns approx bytes pulled. */
  private async warmCard(target: ZapPrefetchTarget, signal: AbortSignal): Promise<number> {
    const headers: Record<string, string> = {};
    if (target.bearer) headers.Authorization = `Bearer ${target.bearer}`;

    // 1. master.m3u8 — the upstream packaged-ids feed filter + single-
    // rendition passthrough already produced the per-device-correct
    // stream, so we just follow whatever this URL points at; we never
    // re-rank by bandwidth.
    const masterText = await this.fetchText(target.masterUrl, headers, signal);
    if (!masterText) return 0;

    // 2. resolve the VIDEO media playlist. A multi-variant master lists
    // #EXT-X-STREAM-INF entries (pick the first); a single-rendition
    // passthrough serves the media playlist *as* master.m3u8 (EXTINF
    // lines directly), in which case we treat the master URL itself as
    // the media playlist.
    const variantUri = pickVariantUri(masterText);
    const videoUrl = variantUri ? resolveUrl(target.masterUrl, variantUri) : target.masterUrl;
    const videoText = variantUri ? await this.fetchText(videoUrl, headers, signal) : masterText;
    if (!videoText) return 0;
    const video = parseVariant(videoText, videoUrl);

    // 3. collect the init + window segments for the video rendition.
    const toFetch: SegmentRef[] = [];
    if (video.segments.length > 0) {
      if (video.initUrl) toFetch.push({ url: video.initUrl, byteRange: video.initByteRange });
      toFetch.push(...selectWindowSegments(video.segments, target.seekSec, WINDOW_SEC));
    }

    // 4. AUDIO renditions. With a separate audio group (the usual
    // multi-rendition layout), hls.js cold-fetches the audio media
    // playlist + its init + segments unless we warm them too. The
    // #EXT-X-MEDIA:TYPE=AUDIO URIs live in the MASTER and resolve
    // relative to it. (Single-rendition passthrough muxes audio into the
    // video segments, so there are no audio URIs to find here — the loop
    // simply does nothing.)
    const audioUris = parseAudioRenditionUris(masterText);
    for (const uri of audioUris) {
      if (signal.aborted) break;
      const audioUrl = resolveUrl(target.masterUrl, uri);
      const audioText = await this.fetchText(audioUrl, headers, signal);
      if (!audioText) continue;
      const audio = parseVariant(audioText, audioUrl);
      if (audio.segments.length === 0) continue;
      if (audio.initUrl) toFetch.push({ url: audio.initUrl, byteRange: audio.initByteRange });
      toFetch.push(...selectWindowSegments(audio.segments, target.seekSec, WINDOW_SEC));
    }

    if (toFetch.length === 0) return 0;

    // 5. fetch the bytes (low priority, concurrency-capped). Sequential
    // through the shared slot pool so we never exceed MAX_CONCURRENCY
    // across cards.
    let bytes = 0;
    for (const seg of toFetch) {
      if (signal.aborted) break;
      bytes += await this.fetchSegment(seg, headers, signal);
    }
    return bytes;
  }

  /** GET a playlist as text. Not concurrency-gated — playlists are
   *  tiny and on the latency-critical path of resolving the variant. */
  private async fetchText(
    url: string,
    headers: Record<string, string>,
    signal: AbortSignal,
  ): Promise<string | null> {
    try {
      const r = await this.timedFetch(url, { headers, signal });
      if (!r || !r.ok) return null;
      return await r.text();
    } catch {
      return null;
    }
  }

  /** GET a media/init segment so the browser disk-caches it. We read
   *  the body to completion (and to size it for the LRU budget) but
   *  discard it — the value is purely the warmed cache entry. */
  private async fetchSegment(
    seg: SegmentRef,
    headers: Record<string, string>,
    signal: AbortSignal,
  ): Promise<number> {
    const acquired = await this.acquireSlot(signal);
    if (!acquired) return 0; // aborted while waiting — no slot held
    try {
      const reqHeaders: Record<string, string> = { ...headers };
      if (seg.byteRange) reqHeaders.Range = `bytes=${seg.byteRange.start}-${seg.byteRange.end}`;
      const r = await this.timedFetch(seg.url, {
        headers: reqHeaders,
        signal,
        // Low priority so the active card's playback bandwidth wins.
        // `priority` is a standard fetch init field (Chromium); ignored
        // elsewhere.
        priority: 'low',
      } as RequestInit);
      if (!r || !r.ok) return 0;
      const buf = await r.arrayBuffer();
      return buf.byteLength;
    } catch {
      return 0;
    } finally {
      this.releaseSlot();
    }
  }

  /** fetch() with a per-request timeout that respects the outer abort
   *  signal too. */
  private async timedFetch(url: string, init: RequestInit): Promise<Response | null> {
    const outer = init.signal;
    const local = new AbortController();
    const onOuterAbort = () => local.abort();
    if (outer) {
      if (outer.aborted) return null;
      outer.addEventListener('abort', onOuterAbort, { once: true });
    }
    const tid = window.setTimeout(() => local.abort(), FETCH_TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: local.signal });
    } catch {
      return null;
    } finally {
      window.clearTimeout(tid);
      if (outer) outer.removeEventListener('abort', onOuterAbort);
    }
  }
}

interface ByteRange {
  start: number;
  end: number; // inclusive, per HTTP Range semantics
}

interface SegmentRef {
  url: string;
  byteRange?: ByteRange;
}

interface MediaSegment extends SegmentRef {
  /** EXTINF duration in seconds. */
  duration: number;
}

interface ParsedVariant {
  initUrl?: string;
  initByteRange?: ByteRange;
  segments: MediaSegment[];
}

/** Resolve a (possibly relative) playlist/segment URI against the
 *  playlist it came from. Uses the URL API so query strings, absolute
 *  paths, and fully-qualified URLs all resolve correctly. */
function resolveUrl(base: string, ref: string): string {
  try {
    return new URL(ref, base).toString();
  } catch {
    return ref;
  }
}

/**
 * Pick a video variant URI from a master playlist by taking the FIRST
 * `#EXT-X-STREAM-INF` entry.
 *
 * Per-device-correctness does NOT come from this selection. The Zap feed
 * is filtered to packaged items by the upstream packaged-ids feed
 * filter, and chino-stream serves those via single-rendition passthrough
 * — the already-correct format for the device, not a ladder we choose a
 * rung from. So in the common case the "master" is really a single media
 * playlist (EXTINF lines directly) and this returns null, signalling the
 * caller to treat the master URL itself as the media playlist. When a
 * true multi-variant master *is* present we still don't re-rank by
 * bandwidth — taking the first entry just follows whatever ordering the
 * server emitted rather than second-guessing it.
 */
function pickVariantUri(masterText: string): string | null {
  const lines = masterText.split(/\r?\n/);
  let sawStreamInf = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line.startsWith('#EXT-X-STREAM-INF')) {
      sawStreamInf = true;
      continue;
    }
    if (sawStreamInf && line && !line.startsWith('#')) {
      return line;
    }
  }
  return null;
}

/**
 * Extract every audio rendition URI from a master playlist's
 * `#EXT-X-MEDIA:TYPE=AUDIO,...,URI="..."` tags. These live in the MASTER
 * (not the video media playlist) and resolve relative to it. With a
 * separate audio group, hls.js fetches the audio media playlist + its
 * init + segments independently of the video rendition, so without
 * warming them the audio side stays cold even when the video is warm.
 *
 * Tags without a URI (e.g. an audio group whose default rendition is
 * muxed into the video) are skipped — there's nothing separate to warm.
 * Duplicate URIs are de-duplicated so a group with several language
 * renditions pointing at the same playlist isn't fetched twice.
 */
function parseAudioRenditionUris(masterText: string): string[] {
  const lines = masterText.split(/\r?\n/);
  const uris: string[] = [];
  const seen = new Set<string>();
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith('#EXT-X-MEDIA:')) continue;
    const type = matchAttr(line, 'TYPE');
    if (type !== 'AUDIO') continue;
    const uri = matchAttr(line, 'URI');
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    uris.push(uri);
  }
  return uris;
}

function parseByteRange(spec: string, prevEnd: number): ByteRange {
  // EXT-X-BYTERANGE: <n>[@<o>]. Without an offset, it continues from
  // the previous sub-range's end.
  const [lenStr, offStr] = spec.split('@');
  const length = parseInt(lenStr, 10) || 0;
  const start = offStr !== undefined ? parseInt(offStr, 10) || 0 : prevEnd;
  return { start, end: start + length - 1 };
}

/**
 * Parse a media playlist into its init segment + media segments (with
 * EXTINF durations + any byte ranges). Tolerant of the subset of HLS
 * tags chino-stream emits; unknown tags are ignored.
 */
function parseVariant(text: string, variantUrl: string): ParsedVariant {
  const lines = text.split(/\r?\n/);
  const out: ParsedVariant = { segments: [] };
  let pendingDuration = 0;
  let pendingByteRange: ByteRange | undefined;
  let lastByteEnd = 0;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith('#EXT-X-MAP:')) {
      const uri = matchAttr(line, 'URI');
      if (uri) out.initUrl = resolveUrl(variantUrl, uri);
      const br = matchAttr(line, 'BYTERANGE');
      if (br) {
        out.initByteRange = parseByteRange(br, lastByteEnd);
        lastByteEnd = out.initByteRange.end + 1;
      }
      continue;
    }
    if (line.startsWith('#EXTINF:')) {
      // #EXTINF:<duration>,[title]
      const v = line.slice('#EXTINF:'.length).split(',')[0];
      pendingDuration = parseFloat(v) || 0;
      continue;
    }
    if (line.startsWith('#EXT-X-BYTERANGE:')) {
      pendingByteRange = parseByteRange(line.slice('#EXT-X-BYTERANGE:'.length), lastByteEnd);
      lastByteEnd = pendingByteRange.end + 1;
      continue;
    }
    if (line.startsWith('#')) continue; // any other tag

    // A bare line following an EXTINF is a media segment URI.
    out.segments.push({
      url: resolveUrl(variantUrl, line),
      duration: pendingDuration,
      byteRange: pendingByteRange,
    });
    pendingDuration = 0;
    pendingByteRange = undefined;
  }
  return out;
}

function matchAttr(line: string, key: string): string | undefined {
  // Quoted: KEY="value"
  const q = new RegExp(`${key}="([^"]*)"`).exec(line);
  if (q) return q[1];
  // Unquoted: KEY=value (BYTERANGE in EXT-X-MAP is unquoted)
  const u = new RegExp(`${key}=([^,]+)`).exec(line);
  return u ? u[1] : undefined;
}

/**
 * Choose the media segments whose cumulative timeline covers
 * [seekSec, seekSec + windowSec). Walks the playlist accumulating
 * EXTINF durations; includes the segment containing seekSec and every
 * following segment until we've covered the window (capped). This is
 * what lands the seek-window bytes — NOT segment 0.
 */
function selectWindowSegments(
  segments: MediaSegment[],
  seekSec: number,
  windowSec: number,
): SegmentRef[] {
  const start = Math.max(0, seekSec);
  const end = start + windowSec;
  const picked: SegmentRef[] = [];
  let t = 0;
  for (const seg of segments) {
    const segStart = t;
    const segEnd = t + (seg.duration || 0);
    t = segEnd;
    // Include if this segment overlaps [start, end).
    if (segEnd > start && segStart < end) {
      picked.push({ url: seg.url, byteRange: seg.byteRange });
      if (picked.length >= MAX_SEGMENTS_PER_CARD) break;
    }
    if (segStart >= end) break;
  }
  // Degenerate playlist with no EXTINF durations (all zero): fall back
  // to the first couple of segments so we warm *something* rather than
  // nothing.
  if (picked.length === 0 && segments.length > 0) {
    return segments.slice(0, Math.min(2, MAX_SEGMENTS_PER_CARD)).map((s) => ({
      url: s.url,
      byteRange: s.byteRange,
    }));
  }
  return picked;
}

/** Process-wide singleton. */
export const zapPrefetcher = new ZapPrefetcher();

// Exported for unit testing of the playlist parsing without spinning up
// the whole class.
export const __test = {
  pickVariantUri,
  parseAudioRenditionUris,
  parseVariant,
  selectWindowSegments,
  resolveUrl,
};
