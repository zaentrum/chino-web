/**
 * Playback quality: what the player measures of how a title plays and
 * reports to /api/v1/play/events - the first frame, a start given up on, a
 * stall mid-play, the bandwidth it sees, a switch of the rendition on
 * screen. It is the baseline the live rungs of ADR-0013 are judged against;
 * chino-api counts startups, timeouts, rebuffers and bandwidth (its README).
 *
 * Pure: the player page hands in the times (performance.now()) and what
 * hls.js and the media element say, and gets the payloads back. No DOM and
 * no hls.js here, so node --test runs it.
 */

/** How the title plays, as /play/info says (a forced transcode is one). */
export type PlayMode = 'packaged' | 'passthrough' | 'remux' | 'transcode' | 'unknown';

export function playMode(mode: string | null | undefined, forcedTranscode: boolean): PlayMode {
  if (forcedTranscode) return 'transcode';
  return mode === 'packaged' || mode === 'passthrough' || mode === 'remux' || mode === 'transcode' ? mode : 'unknown';
}

/** A rendition: the height of its picture and the bitrate its variant
 *  declares (BANDWIDTH, bit/s); null where it is not known. */
export interface Rendition {
  height: number | null;
  bitrate: number | null;
}

/** What hls.js keeps of a fragment's load (its LoadStats): the bytes so far,
 *  the size once the server said it (0 until then), and when the request
 *  went out, its first byte came and its last (0 until then). */
export interface LoadTimes {
  loaded: number;
  total: number;
  loading: { start: number; first: number; end: number };
  aborted?: boolean;
}

/** A fragment hls.js loads, by what it is: the video's init segment or a
 *  media segment of the video or the audio. Subtitles and anything else
 *  are none. */
export type SegmentKind = 'init' | 'video' | 'audio';

export function segmentKind(type: string, sn: number | string): SegmentKind | null {
  if (type === 'main') return sn === 'initSegment' ? 'init' : 'video';
  if (type === 'audio' && sn !== 'initSegment') return 'audio';
  return null;
}

const ms = (x: number) => Math.max(0, Math.round(x));

/** A segment fetch as a payload: bytes received, its size if known, how long
 *  it has been loading (until its last byte, or until now) and when its
 *  first byte came. All null when there is none. */
export function segmentPayload(stats: LoadTimes | null | undefined, now: number) {
  if (!stats || !(stats.loading.start > 0)) {
    return { seg_loaded: null, seg_total: null, seg_load_ms: null, seg_ttfb_ms: null };
  }
  const end = stats.loading.end > 0 ? stats.loading.end : now;
  return {
    seg_loaded: Math.max(0, Math.round(stats.loaded)),
    seg_total: stats.total > 0 ? Math.round(stats.total) : null,
    seg_load_ms: ms(end - stats.loading.start),
    seg_ttfb_ms: stats.loading.first > 0 ? ms(stats.loading.first - stats.loading.start) : null,
  };
}

// ---- Startup ----

/** One attempt to start: from the player's mount, or from Try again, to the
 *  first frame. Mutated by the functions below as the source loads. */
export interface StartupClock {
  attempt: number;
  /** performance.now() when the attempt began. */
  startedAt: number;
  /** When the source loading now was asked for (its master playlist), and
   *  how many sources the attempt asked for so far: more than one when a
   *  caps or quality change rebuilt it before the first frame. */
  requestedAt: number | null;
  sources: number;
  /** The page was hidden at some time before the first frame. */
  hidden: boolean;
  /** The browser refused to start playback by itself (autoplay), and the
   *  viewer pressed play before the first frame: the wait was partly theirs. */
  refused: boolean;
  clicked: boolean;
  /** When the first frame was shown; null until then. */
  frameAt: number | null;
  /** How far the source loading now got. */
  playlist: boolean;
  videoAsked: boolean;
  videoIn: boolean;
  audioAsked: boolean;
  audioIn: boolean;
}

export function startupClock(attempt: number, now: number, visible: boolean): StartupClock {
  return {
    attempt,
    startedAt: now,
    requestedAt: null,
    sources: 0,
    hidden: !visible,
    refused: false,
    clicked: false,
    frameAt: null,
    playlist: false,
    videoAsked: false,
    videoIn: false,
    audioAsked: false,
    audioIn: false,
  };
}

/** A source was asked for: its loading starts over. */
export function sourceRequested(c: StartupClock, now: number): void {
  c.requestedAt = now;
  c.sources += 1;
  c.playlist = c.videoAsked = c.videoIn = c.audioAsked = c.audioIn = false;
}

/** The phases a start goes through, and what a start given up on still
 *  waited for: the stream not asked for yet (no stream token), its
 *  playlists, the video's init segment, the first media segments (the
 *  video's, and the audio's where it comes apart), or a frame from what
 *  arrived. Where the browser plays HLS itself it says less: everything
 *  before its metadata is the playlist, everything after the first
 *  segment. */
export type StartupPhase = 'request' | 'playlist' | 'init' | 'first_segment' | 'decode';

export function startupPhase(c: StartupClock): StartupPhase {
  if (c.requestedAt === null) return 'request';
  if (!c.playlist) return 'playlist';
  if (!c.videoAsked) return 'init';
  if (!c.videoIn || (c.audioAsked && !c.audioIn)) return 'first_segment';
  return 'decode';
}

/** A start from the first second on is a resume. */
export const RESUME_FROM_SEC = 1;

/** Where in the title a start was, coarsely. */
export function startBucket(positionSec: number): string {
  if (!(positionSec >= RESUME_FROM_SEC)) return '0';
  if (positionSec < 300) return '<5m';
  if (positionSec < 1800) return '5-30m';
  if (positionSec < 3600) return '30-60m';
  return '60m+';
}

/** The first frame, as the page saw it. */
export interface FirstFrame {
  /** When it was shown. */
  at: number;
  /** Its position in the title, in seconds. */
  position: number;
  rendition: Rendition | null;
  /** How it was seen: the video's frame callback, or (without one) the
   *  playhead moving. */
  via: 'frame_callback' | 'timeupdate';
}

export function firstFramePayload(c: StartupClock, f: FirstFrame, mode: PlayMode) {
  return {
    attempt: c.attempt,
    startup_ms: ms(f.at - c.startedAt),
    request_ms: c.requestedAt === null ? null : ms(f.at - c.requestedAt),
    sources: c.sources,
    mode,
    height: f.rendition?.height ?? null,
    bitrate: f.rendition?.bitrate ?? null,
    resume: f.position >= RESUME_FROM_SEC,
    start_bucket: startBucket(f.position),
    hidden: c.hidden,
    click_to_play: c.clicked,
    via: f.via,
  };
}

/** A start given up on: the phase it was in, and the segment fetch in flight
 *  then - the video's (its init segment or a media segment), else the
 *  audio's - with the rendition it is of. */
export function startupTimeoutPayload(
  c: StartupClock,
  now: number,
  mode: PlayMode,
  inflight: { kind: SegmentKind; stats: LoadTimes; rendition: Rendition | null } | null,
) {
  return {
    phase: startupPhase(c),
    mode,
    sources: c.sources,
    seg_kind: inflight?.kind ?? null,
    ...segmentPayload(inflight?.stats, now),
    height: inflight?.rendition?.height ?? null,
    bitrate: inflight?.rendition?.bitrate ?? null,
  };
}

// ---- Bandwidth ----

/** At most one bandwidth report this often while playing; one more at the
 *  first frame. */
export const BANDWIDTH_EVERY_MS = 30_000;

/** hls.js's estimate and the last video segment it loaded: its size, the
 *  media it holds, how long it took and when its first byte came. None
 *  without an estimate. */
export function bandwidthPayload(
  bps: number,
  last: { stats: LoadTimes; durationSec: number; rendition: Rendition | null } | null,
  trigger: 'first_frame' | 'interval',
) {
  if (!Number.isFinite(bps) || bps <= 0) return null;
  // Only a fetch that is done has a size and a time.
  const done = last && last.stats.loading.start > 0 && last.stats.loading.end > 0 ? last : null;
  return {
    bps: Math.round(bps),
    frag_bytes: done ? Math.round(done.stats.loaded) : null,
    frag_duration_ms: done && done.durationSec > 0 ? ms(done.durationSec * 1000) : null,
    frag_load_ms: done ? ms(done.stats.loading.end - done.stats.loading.start) : null,
    frag_ttfb_ms: done && done.stats.loading.first > 0 ? ms(done.stats.loading.first - done.stats.loading.start) : null,
    height: last?.rendition?.height ?? null,
    trigger,
  };
}

// ---- Level switch ----

/** The rendition on screen is another one: by its height, or its bitrate. */
export function renditionChanged(from: Rendition | null, to: Rendition): boolean {
  if (!from) return false;
  return from.height !== to.height || from.bitrate !== to.bitrate;
}

export function levelSwitchPayload(from: Rendition, to: Rendition, manual: boolean, mode: PlayMode) {
  return {
    from_height: from.height,
    from_bitrate: from.bitrate,
    to_height: to.height,
    to_bitrate: to.bitrate,
    manual,
    mode,
  };
}

// ---- Rebuffer ----

/** How a stall that began mid-play showed: the media element waiting for
 *  data, the playhead standing still with no word of it (the page's stall
 *  watcher), or the browser pausing with the viewer still watching. */
export type StallCause = 'waiting' | 'stuck' | 'pause';
/** How it ended: the playhead moved again, the viewer paused, the page was
 *  hidden or left, or the player gave up. */
export type StallEnd = 'playing' | 'pause' | 'hidden' | 'exit' | 'error';

interface Stall {
  at: number;
  position: number;
  cause: StallCause;
  segment: { kind: SegmentKind; stats: LoadTimes } | null;
  resumedAt: number | null;
  seeked: boolean;
}

/** The playhead has to move more than this from where it was last seen
 *  moving (or stopping) to be moving: timeupdate comes every 15 to 250 ms,
 *  so it is summed over as many as it takes. */
const MOVED_SEC = 0.05;

/**
 * Stalls that begin mid-play - once the first frame was shown and the
 * playhead has been moving since the last seek, pause or new source - and
 * how long they stand still. Not a start (that is first_frame), not the wait
 * after a seek or a quality switch. A stall ends when the playhead moves
 * again, timed from the media element's playing when it came just before; a
 * seek in it does not end it (the viewer still waits), a pause the viewer
 * makes does, as the page being hidden or left, or the player giving up.
 * Each method returns the rebuffer payload of the stall it ends, if any.
 */
export class RebufferWatch {
  private moving = false;
  /** Where the playhead was last seen moving from; -1 for not yet. */
  private anchor = -1;
  private stall: Stall | null = null;

  /** A timeupdate. `started`: the first frame of the attempt was shown. */
  time(now: number, position: number, o: { paused: boolean; seeking: boolean; started: boolean }) {
    if (o.seeking) {
      this.anchor = -1;
      return null;
    }
    if (o.paused || !o.started || this.anchor < 0 || position < this.anchor) {
      this.anchor = position;
      return null;
    }
    if (position <= this.anchor + MOVED_SEC) return null;
    this.anchor = position;
    if (this.stall) return this.end(this.stall, this.stall.resumedAt ?? now, 'playing');
    this.moving = true;
    return null;
  }

  /** The media element waits for data. `segment`: the fetch in flight. */
  waiting(now: number, position: number, seeking: boolean, segment: Stall['segment']): void {
    if (this.stall) {
      this.stall.resumedAt = null;
      return;
    }
    if (seeking || !this.moving) return;
    this.begin(now, position, 'waiting', segment);
  }

  /** The stall watcher: the playhead has not moved since `since`. */
  stuck(since: number, position: number, segment: Stall['segment']): void {
    if (this.stall || !this.moving) return;
    this.begin(since, position, 'stuck', segment);
  }

  /** The media element plays again; the stall ends once the playhead moves. */
  playing(now: number): void {
    if (this.stall) this.stall.resumedAt = now;
  }

  /** A pause: the viewer's ends a stall; the browser's, with the viewer still
   *  watching (visible), is one. */
  paused(now: number, byViewer: boolean, position: number, segment: Stall['segment']) {
    if (byViewer) {
      this.moving = false;
      return this.stall ? this.end(this.stall, now, 'pause') : null;
    }
    if (this.stall) {
      this.stall.resumedAt = null;
      return null;
    }
    if (this.moving) this.begin(now, position, 'pause', segment);
    return null;
  }

  /** A seek: playback is under way again only once the playhead moves. */
  seeking(): void {
    this.moving = false;
    this.anchor = -1;
    if (this.stall) {
      this.stall.seeked = true;
      this.stall.resumedAt = null;
    }
  }

  /** A new source: the same. A stall goes on through it. */
  source(): void {
    this.moving = false;
    this.anchor = -1;
  }

  /** The page was hidden or left, or the player gave up. */
  stop(now: number, how: 'hidden' | 'exit' | 'error') {
    this.moving = false;
    this.anchor = -1;
    return this.stall ? this.end(this.stall, now, how) : null;
  }

  // The stall is measured from where the playhead stopped: frames played out
  // of what was left do not end it.
  private begin(at: number, position: number, cause: StallCause, segment: Stall['segment']): void {
    this.moving = false;
    this.anchor = position;
    this.stall = { at, position, cause, segment, resumedAt: null, seeked: false };
  }

  private end(s: Stall, at: number, how: StallEnd) {
    this.stall = null;
    return {
      duration_ms: ms(at - s.at),
      position: Math.round(s.position * 10) / 10,
      cause: s.cause,
      end: how,
      seeked: s.seeked,
      seg_kind: s.segment?.kind ?? null,
      ...segmentPayload(s.segment?.stats, at),
    };
  }
}

// ---- How often ----

export type QoeKind = 'first_frame' | 'startup_timeout' | 'rebuffer' | 'bandwidth' | 'level_switch';

/** How many of each kind a session reports at most, and how far apart. A
 *  session is one player mount: a title, or an episode of a binge. */
export const BUDGETS: Record<QoeKind, { max: number; gapMs: number }> = {
  first_frame: { max: 10, gapMs: 0 },
  startup_timeout: { max: 10, gapMs: 0 },
  rebuffer: { max: 100, gapMs: 0 },
  // Two a minute: 240 over a film of two hours, and room for a long session.
  bandwidth: { max: 1000, gapMs: BANDWIDTH_EVERY_MS },
  level_switch: { max: 100, gapMs: 0 },
};

/** Keeps a session within BUDGETS. `allow` says whether a report of `kind`
 *  may go now, and counts it if so; `ignoreGap` lets one through sooner (the
 *  bandwidth report at the first frame), still counted. */
export class EventBudget {
  private sent = new Map<QoeKind, { n: number; at: number }>();

  allow(kind: QoeKind, now: number, ignoreGap = false): boolean {
    const { max, gapMs } = BUDGETS[kind];
    const s = this.sent.get(kind);
    if (s && s.n >= max) return false;
    if (s && !ignoreGap && now - s.at < gapMs) return false;
    this.sent.set(kind, { n: (s?.n ?? 0) + 1, at: now });
    return true;
  }
}
