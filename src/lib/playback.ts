// How the player recovers a stalled or failing stream without losing the
// viewer's place. Pure: playback.test.ts runs it under node --test.
//
// The player streams HLS (hls.js, or Safari's own), so the media element's
// currentTime IS the position in the title, and the ways to recover are:
// nudge the media element where it stands, restart hls.js's loading where it
// stands, or rebuild the source - a new master.m3u8 URL - and seek the new
// one back to where the old one was. Which of these makes sense depends on
// what the server is doing. A packaged title is pre-segmented files: its
// ladder for the client's caps, which hls.js steps through by itself (Auto),
// or the one rung the viewer picked - never a transcode, and nothing for
// the player to step down to. A title that is not packaged runs on the fly:
// a direct stream (passthrough, remux) or the transcode ladder's rungs.

import { hasCodec } from './caps.ts';

export type PlayMode = 'passthrough' | 'remux' | 'transcode' | 'packaged';

/** A rung of the on-the-fly transcode ladder. */
export type LadderQuality = 'high' | 'medium' | 'low';

/**
 * What the player asks for (?q=). On the fly: a transcode rung - "high"
 * also stream-copies a direct stream. Packaged: "auto", the client's
 * ladder, or the name of one rung from /play/info's qualities ("v2"),
 * served alone; the transcode rungs mean auto there (lib/qualities.ts).
 */
export type Quality = LadderQuality | 'auto' | (string & {});

export const QUALITY_RUNGS: readonly LadderQuality[] = ['high', 'medium', 'low'];

export function isLadderQuality(q: Quality): q is LadderQuality {
  return (QUALITY_RUNGS as readonly string[]).includes(q);
}

/**
 * The q to ask a title for that is served on the fly where a packaged q -
 * a rung's name, or auto - was asked for (its package gone, the caps
 * changed under a pick): high, since any q but high makes the server
 * re-encode a direct stream rather than stream-copy it. null when q is
 * fine as it is: a packaged title, a transcode rung, the mode not known.
 */
export function onTheFlyQuality(mode: PlayMode | null | undefined, q: Quality): Quality | null {
  if (!mode || mode === 'packaged' || isLadderQuality(q)) return null;
  return 'high';
}

/** Tries in place before a stalled stream is rebuilt. */
export const IN_PLACE_TRIES = 3;

/**
 * Where a rebuilt source's playhead goes once its metadata is in: the
 * position saved before the rebuild, kept a second short of the end; null
 * when there is nothing to restore (no position, or the very start).
 */
export function restorePosition(saved: number | null | undefined, durationSec?: number | null): number | null {
  if (saved == null || !Number.isFinite(saved) || saved <= 0) return null;
  if (durationSec != null && Number.isFinite(durationSec) && durationSec > 0) {
    return Math.max(0, Math.min(saved, durationSec - 1));
  }
  return saved;
}

export interface StallState {
  /** What /play/info said the server does; null while it has not said. */
  mode: PlayMode | null;
  quality: Quality;
  /** The player already moved a direct stream onto the transcode ladder. */
  forcedTranscode: boolean;
  positionSec: number;
  /** Media buffered past the playhead, in seconds. */
  bufferedAheadSec: number;
  /** hls.js is loading (it stops after a fatal network error). */
  loading: boolean;
  /** In-place tries since the playhead last moved. */
  tries: number;
}

export type StallAction =
  /** The loader is fetching and nothing is buffered: the network is the
   *  bottleneck, and rebuilding would only throw away what is arriving. */
  | { kind: 'wait' }
  /** hls.js stopped loading: start it again where the playhead is. */
  | { kind: 'resume-loading'; at: number }
  /** Data is buffered past a playhead that does not move: seek to where it
   *  is, which restarts the decoder on what is already there. */
  | { kind: 'nudge'; at: number }
  /** Rebuild the source and seek it back to `at`. */
  | { kind: 'reload'; at: number; quality: Quality; forceTranscode: boolean; notice: string | null; label: string };

/**
 * What the hard-stall watcher does when the playhead has not moved for a
 * while although the player is playing.
 *
 * A packaged title (and a transcode, already on the ladder) is retried in
 * place, keeping its position; only when that has failed IN_PLACE_TRIES
 * times is the source rebuilt - same quality (a packaged title's Auto, or
 * the rung the viewer picked), never a forced transcode, and at the same
 * position. A direct stream (passthrough, remux, or a mode not known yet)
 * moves onto the server's transcode ladder at Medium, which can step the
 * bitrate down - at the same position too.
 */
export function stallAction(s: StallState): StallAction {
  const at = Math.max(0, s.positionSec || 0);
  const onLadder = s.mode === 'transcode' || s.forcedTranscode;
  if (s.mode === 'packaged' || onLadder) {
    const inPlace: StallAction =
      s.bufferedAheadSec >= 0.5
        ? { kind: 'nudge', at }
        : !s.loading
          ? { kind: 'resume-loading', at }
          : { kind: 'wait' };
    if (inPlace.kind === 'wait' || s.tries < IN_PLACE_TRIES) return inPlace;
    return {
      kind: 'reload',
      at,
      quality: s.quality,
      forceTranscode: s.mode === 'packaged' ? false : s.forcedTranscode,
      notice: null,
      label: 'reconnecting',
    };
  }
  return {
    kind: 'reload',
    at,
    quality: 'medium',
    forceTranscode: true,
    notice: ONTO_LADDER_NOTICE,
    label: `→ Medium (auto, ${s.mode ?? 'unknown'} → transcode)`,
  };
}

/** The notice of a direct stream moved onto the transcode ladder. */
export const ONTO_LADDER_NOTICE = 'Unstable connection — switching to adaptive streaming';

export type NetworkFallback =
  /** Onto the transcode ladder at Medium, at the position, with the notice
   *  the stall watcher shows for the same move. */
  | { kind: 'transcode'; quality: LadderQuality; notice: string; label: string }
  /** As before: hls.js retries, then the player asks again or gives up. */
  | { kind: 'keep' };

/** The fragment errors of hls.js (ErrorDetails) that are a load that failed. */
const FRAGMENT_LOAD_ERRORS: readonly string[] = ['fragLoadError', 'fragLoadTimeOut'];

/**
 * What to do when a fragment of the stream cannot be loaded. A direct stream
 * (remux, passthrough: the server's copy of the file) whose fragment is
 * answered 404 is one the server cannot make, which no retry changes: it
 * moves onto the transcode ladder at once. Any other failure to load its
 * fragments (a 5xx, a timeout, no answer) does so once hls.js's own retries
 * have run out - the error turned fatal. The move is the stall watcher's:
 * Medium, transcoding forced, the position kept. A packaged title, a
 * transcode (already on the ladder) and a mode not known yet keep the
 * handling they had.
 */
export function networkFallback(s: {
  mode: PlayMode | null;
  forcedTranscode: boolean;
  details: string;
  status: number | null;
  fatal: boolean;
}): NetworkFallback {
  const direct = s.mode === 'remux' || s.mode === 'passthrough';
  if (!direct || s.forcedTranscode || !FRAGMENT_LOAD_ERRORS.includes(s.details)) return { kind: 'keep' };
  if (s.status !== 404 && !s.fatal) return { kind: 'keep' };
  return { kind: 'transcode', quality: 'medium', notice: ONTO_LADDER_NOTICE, label: `→ Medium (auto, ${s.mode} → transcode)` };
}

/**
 * The step down after repeated buffer underruns, or null when there is no
 * lower step: a packaged title is not stepped down by the player - on Auto
 * hls.js steps through its ladder itself, and a rung the viewer picked
 * stays picked - and Low is the transcode ladder's last rung. A direct
 * stream moves onto the ladder at Medium.
 */
export function downgradeStep(s: {
  mode: PlayMode | null;
  quality: Quality;
  forcedTranscode: boolean;
}): { quality: Quality; forceTranscode: boolean } | null {
  if (s.mode === 'packaged') return null;
  if (s.mode === 'transcode' || s.forcedTranscode) {
    const i = isLadderQuality(s.quality) ? QUALITY_RUNGS.indexOf(s.quality) : -1;
    if (i < 0 || i >= QUALITY_RUNGS.length - 1) return null;
    return { quality: QUALITY_RUNGS[i + 1], forceTranscode: s.forcedTranscode };
  }
  return { quality: 'medium', forceTranscode: true };
}

export type MediaFallback =
  /** The browser said it decodes HEVC and does not: ask again without it. */
  | { kind: 'drop-hevc' }
  /** A direct stream the browser cannot decode: the server re-encodes it. */
  | { kind: 'transcode' }
  | { kind: 'give-up' };

/**
 * What to do when media errors keep coming (the decoder rejects what it is
 * given). A packaged title is never forced onto the transcode ladder - the
 * server would serve the same packaged files - but when the request
 * advertised HEVC it is asked for again without it, which the server
 * answers with a stream the browser does decode. A transcode that still
 * fails has nowhere further to go.
 */
export function mediaFallback(s: { mode: PlayMode | null; forcedTranscode: boolean; caps: readonly string[] }): MediaFallback {
  if (s.mode === 'packaged') return hasCodec(s.caps, 'hvc') ? { kind: 'drop-hevc' } : { kind: 'give-up' };
  if (s.mode === 'transcode' || s.forcedTranscode) return { kind: 'give-up' };
  return { kind: 'transcode' };
}
