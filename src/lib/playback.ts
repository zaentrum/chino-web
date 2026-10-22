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
import { lowerRung, playsOriginal, type LadderEntry } from './qualities.ts';

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
 * Why the player changed the quality by itself, which its notice says
 * (docs/chino, playback: when the quality changes by itself): off the
 * original because the connection can't keep up with it ('original-stall')
 * or because it couldn't be streamed ('original-error'), or one step down
 * between qualities ('step').
 */
export type StepDownWhy = 'original-stall' | 'original-error' | 'step';

/**
 * The notice of a quality change the player made by itself, label the
 * quality it went to as the menu names it - the server's name, "Medium
 * (720p)" (lib/qualities.ts).
 */
export function stepDownNotice(label: string, why: StepDownWhy): string {
  switch (why) {
    case 'original-stall':
      return `Switched to ${label} quality: the connection can't keep up with the original.`;
    case 'original-error':
      return `Switched to ${label} quality: the original couldn't be streamed.`;
    default:
      return `Switched to ${label} quality: the connection can't keep up.`;
  }
}

/**
 * Takes the player off its source for another: the position first, kept by
 * keep, then the teardown - hls.js's detaches the media element, which goes
 * back to 0:00, so a position read after it is lost. Returns the position.
 */
export function leaveSource(media: { currentTime: number } | null | undefined, keep: (at: number) => void, teardown: () => void): number {
  const at = media?.currentTime ?? 0;
  keep(at);
  teardown();
  return at;
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

/**
 * Whether what plays at q is on the transcode ladder: a transcode, or a
 * direct stream the player moved onto it - unless the viewer picked the
 * Original again there (high), which chino-stream stream-copies, so the
 * original plays as it is. What leaves the original steps down as the
 * original does, with its own notice, forced move or not.
 */
export function onTranscodeLadder(mode: PlayMode | null | undefined, quality: Quality, forcedTranscode: boolean): boolean {
  if (mode === 'transcode') return true;
  return forcedTranscode && !playsOriginal(mode, quality);
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
  /** Rebuild the source and seek it back to `at`; notice, what the player
   *  says of it once the quality it goes to is named (stepDownNotice). */
  | { kind: 'reload'; at: number; quality: Quality; forceTranscode: boolean; notice: StepDownWhy | null; label: string };

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
 * bitrate down - at the same position too; so does the Original picked
 * again after such a move (onTranscodeLadder).
 */
export function stallAction(s: StallState): StallAction {
  const at = Math.max(0, s.positionSec || 0);
  const onLadder = onTranscodeLadder(s.mode, s.quality, s.forcedTranscode);
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
    notice: 'original-stall',
    label: `→ Medium (auto, ${s.mode ?? 'unknown'} → transcode)`,
  };
}

export type NetworkFallback =
  /** Onto the transcode ladder at Medium, at the position, the notice saying
   *  the original could not be streamed. */
  | { kind: 'transcode'; quality: LadderQuality; notice: StepDownWhy; label: string }
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
 * have run out - the error turned fatal. The move is the stall watcher's -
 * Medium, transcoding forced, the position kept - its notice its own; so
 * does the Original picked again after such a move (onTranscodeLadder). A
 * packaged title, a transcode (already on the ladder) and a mode not known
 * yet keep the handling they had.
 */
export function networkFallback(s: {
  mode: PlayMode | null;
  /** The q of the source whose fragment failed. */
  quality: Quality;
  forcedTranscode: boolean;
  details: string;
  status: number | null;
  fatal: boolean;
}): NetworkFallback {
  const direct = s.mode === 'remux' || s.mode === 'passthrough';
  if (!direct || onTranscodeLadder(s.mode, s.quality, s.forcedTranscode) || !FRAGMENT_LOAD_ERRORS.includes(s.details)) return { kind: 'keep' };
  if (s.status !== 404 && !s.fatal) return { kind: 'keep' };
  return { kind: 'transcode', quality: 'medium', notice: 'original-error', label: `→ Medium (auto, ${s.mode} → transcode)` };
}

/**
 * The step down after repeated buffer underruns, or null when there is no
 * lower step: a packaged title is not stepped down by the player - on Auto
 * hls.js steps through its ladder itself, and a rung the viewer picked
 * stays picked. On the transcode ladder, the next rung with another name
 * (lib/qualities.ts lowerRung: a 720p original's high goes to low, past
 * medium, which encodes the same frame), the fixed ladder's next where the
 * ladder is not named; none past the last. A direct stream moves onto the
 * ladder at Medium, and so does the Original picked again after such a
 * move: what it leaves is the original, and its notice says so. why is what
 * its notice says.
 */
export function downgradeStep(s: {
  mode: PlayMode | null;
  quality: Quality;
  forcedTranscode: boolean;
  /** The on-the-fly ladder, named (lib/qualities.ts onTheFlyLadder). */
  ladder?: readonly LadderEntry[] | null;
}): { quality: Quality; forceTranscode: boolean; why: StepDownWhy } | null {
  if (s.mode === 'packaged') return null;
  if (onTranscodeLadder(s.mode, s.quality, s.forcedTranscode)) {
    if (!isLadderQuality(s.quality)) return null;
    const next = s.ladder?.length ? lowerRung(s.ladder, s.quality) : QUALITY_RUNGS[QUALITY_RUNGS.indexOf(s.quality) + 1];
    return next ? { quality: next, forceTranscode: s.forcedTranscode, why: 'step' } : null;
  }
  return { quality: 'medium', forceTranscode: true, why: 'original-stall' };
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
 * fails has nowhere further to go; the Original picked again after a move
 * onto the ladder goes back onto it (onTranscodeLadder).
 */
export function mediaFallback(s: {
  mode: PlayMode | null;
  /** The q of the source that failed. */
  quality: Quality;
  forcedTranscode: boolean;
  caps: readonly string[];
}): MediaFallback {
  if (s.mode === 'packaged') return hasCodec(s.caps, 'hvc') ? { kind: 'drop-hevc' } : { kind: 'give-up' };
  if (onTranscodeLadder(s.mode, s.quality, s.forcedTranscode)) return { kind: 'give-up' };
  return { kind: 'transcode' };
}
