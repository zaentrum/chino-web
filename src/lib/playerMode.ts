// What the player plays, and what it asks the server for around it: a
// title (a film, an episode), or one of a title's extras - its trailer, a
// teaser, a featurette - at /trailer/<itemId>/<extraId>. An extra plays in
// the same player as a title, its master asked for as a title's is, with
// the same controls and menus. But it is not the title: chino-api has no
// /play/info, progress, watched, segments, trickplay or prewarm for it
// (hooks/useItem.ts ExtraRef), and a trailer never shows up in Continue
// watching. Pure: playerMode.test.ts runs it under node --test.

import { normalizeLang } from './languages.ts';
import { AUTO, rungOfUri, sizeLabel, type PlayQuality } from './qualities.ts';

/** What the player plays: a title, or one of a title's extras. */
export type PlayerMode = 'title' | 'extra';

/** The calls the player makes around what it plays. */
export interface PlayerCalls {
  /**
   * The title's own reads: the item (its name; an episode's series, its
   * episodes and the next one, and the warm of the next one's master), its
   * segments (Skip Intro, the credits, Up next), /play/info and its
   * subtitles. An extra's page reads the title before the player starts.
   */
  title: boolean;
  /** The scrub-bar previews: /play/trickplay. */
  trickplay: boolean;
  /** GET /progress to resume, POST /progress while it plays: what Continue watching lists. */
  progress: boolean;
  /** POST /me/items/{id}/watched, in the credits or past 95 %. */
  watched: boolean;
  /** What goes to /play/events: the session's events, or one trailer_play
   *  when the extra starts (lib/trailers.ts trailerPlayBatch). */
  events: 'session' | 'trailer_play';
}

/** The calls of a mode: a title makes them all; an extra none of the
 *  title's, and reports only that it played. */
export function playerCalls(mode: PlayerMode): PlayerCalls {
  const title = mode === 'title';
  return { title, trickplay: title, progress: title, watched: title, events: title ? 'session' : 'trailer_play' };
}

/** The heading of an extra in the player: the title's name and the
 *  extra's, "Sintel · Trailer". */
export function extraHeading(titleName: string | null | undefined, extraTitle: string | null | undefined): string {
  return [titleName, extraTitle].map((s) => s?.trim() ?? '').filter(Boolean).join(' · ');
}

/** A variant of an extra's master, as hls.js lists it (a level). */
export interface MasterVariant {
  uri?: string;
  width?: number;
  height?: number;
  bitrate?: number;
  videoCodec?: string;
  audioCodec?: string;
}

/** An audio rendition of an extra's master, as hls.js lists it. */
export interface MasterAudio {
  name?: string;
  lang?: string;
  default?: boolean;
  channels?: string;
  audioCodec?: string;
}

/** An audio track of an extra, as /play/info lists a title's. */
export interface ExtraAudioTrack {
  index: number;
  codec: string;
  language: string;
  title?: string;
  default?: boolean;
  channels?: number;
}

/**
 * What the player knows of an extra's stream, in the terms of the
 * /play/info it has for a title (components/PlayerPage.tsx PlayInfo), which
 * the quality and audio menus, the Playback info and the recovery from a
 * stall or a media error go by. An extra is packaged; its quality menu and
 * its audio tracks are what its master lists. No subtitles: an extra's
 * would be its master's SUBTITLES renditions, which the player does not
 * draw (lib/hlsConfig.ts).
 */
export interface ExtraInfo {
  filename: string;
  container: string;
  video_codec: string;
  audio_codec: string;
  width: number;
  height: number;
  duration_ms: number;
  mode: 'packaged';
  reason: string;
  qualities: PlayQuality[] | null;
  audio_tracks: ExtraAudioTrack[];
}

/** A codec of a master's CODECS as /play/info names one (ffprobe's names):
 *  avc1.4d401f is h264, mp4a.40.2 aac; "" for none. */
export function codecName(codec: string | null | undefined): string {
  const c = (codec ?? '').trim().toLowerCase();
  if (/^(avc1|avc3)\b/.test(c)) return 'h264';
  if (/^(hvc1|hev1)\b/.test(c)) return 'hevc';
  if (/^av01\b/.test(c)) return 'av1';
  if (/^(vp09|vp9)\b/.test(c)) return 'vp9';
  if (/^mp4a\.40\b/.test(c)) return 'aac';
  if (/^mp4a\.(69|6b)$/.test(c)) return 'mp3';
  if (c === 'ac-3') return 'ac3';
  if (c === 'ec-3') return 'eac3';
  return c;
}

/**
 * An extra's quality menu, from its master's ladder: Auto, then a rung per
 * variant, tallest first, named by its picture size as chino-stream names
 * a title's rungs ("720p"). A rung's name is its directory ("v1"), the ?q=
 * that serves it alone, as for a packaged title. Null for fewer than two
 * rungs: nothing to choose.
 */
export function extraQualities(variants: readonly MasterVariant[]): PlayQuality[] | null {
  const rungs: PlayQuality[] = [];
  for (const v of variants) {
    const name = rungOfUri(v.uri);
    if (!name || rungs.some((r) => r.name === name)) continue;
    rungs.push({
      name,
      id: name,
      label: sizeLabel(v.width, v.height) ?? name,
      width: v.width,
      height: v.height,
      codec: v.videoCodec,
      bitrate: v.bitrate,
    });
  }
  if (rungs.length < 2) return null;
  rungs.sort((a, b) => (b.height ?? 0) - (a.height ?? 0) || (b.bitrate ?? 0) - (a.bitrate ?? 0));
  return [{ name: AUTO, label: 'Auto' }, ...rungs];
}

/**
 * An extra's audio tracks, from its master's audio renditions: one per
 * language and name - the same sound in a stereo group and a surround group
 * is one track to pick, as /play/info lists a title's source tracks - each
 * at its place in the list (its index).
 */
export function extraAudioTracks(renditions: readonly MasterAudio[]): ExtraAudioTrack[] {
  const out: ExtraAudioTrack[] = [];
  const key = (lang: string | undefined, name: string | undefined) =>
    `${normalizeLang(lang) || (lang ?? '').trim().toLowerCase()}\u0000${(name ?? '').trim().toLowerCase()}`;
  const seen = new Set<string>();
  for (const r of renditions) {
    const k = key(r.lang, r.name);
    if (seen.has(k)) continue;
    seen.add(k);
    const channels = Number.parseInt(r.channels ?? '', 10);
    out.push({
      index: out.length,
      codec: codecName(r.audioCodec),
      language: r.lang ?? '',
      title: r.name?.trim() || undefined,
      default: r.default || undefined,
      channels: channels > 0 ? channels : undefined,
    });
  }
  return out;
}

/**
 * An extra described from its master (an empty one before the master is
 * in, or where the browser plays HLS itself and lists no variants): the
 * size and codecs of its top rung, its duration as the title's detail gives
 * it, its quality menu and its audio tracks.
 */
export function extraInfo(o: {
  variants?: readonly MasterVariant[];
  audio?: readonly MasterAudio[];
  durationMs?: number | null;
}): ExtraInfo {
  const variants = o.variants ?? [];
  const audio = o.audio ?? [];
  const top = [...variants].sort((a, b) => (b.height ?? 0) - (a.height ?? 0) || (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];
  return {
    filename: '',
    container: '',
    video_codec: codecName(top?.videoCodec),
    audio_codec: codecName(top?.audioCodec ?? audio[0]?.audioCodec),
    width: top?.width ?? 0,
    height: top?.height ?? 0,
    duration_ms: o.durationMs != null && o.durationMs > 0 ? o.durationMs : 0,
    mode: 'packaged',
    reason: "One of the title's extras, packaged apart from it: the share of its ladder this browser decodes.",
    qualities: extraQualities(variants),
    audio_tracks: extraAudioTracks(audio),
  };
}
