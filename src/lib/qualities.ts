// The quality menu: what /play/info offers, which entry the player is on,
// what each is called, and where a step down goes. Pure: qualities.test.ts
// runs it.
//
// chino-stream names every quality by one fixed table of heights, so a name
// means the same height on every title and every installation (docs/chino,
// playback: quality names): "Ultra (2160p)", "High (1080p)", "Medium (720p)",
// "Low (480p)", "Lowest (360p)"; a height between two steps the lower step's
// name with its own height ("Medium (900p)"); "Original" for the original
// played as it is. The name is the label of an entry of /play/info's
// qualities and the NAME of a variant in a master (hls.js reads it as a
// level's name). The apps show it as given; an older server's height alone
// ("720p") is named by the same table here, and a frame that comes with no
// name is named as chino-stream names one (frameQualityName).
//
// A packaged title is served as the ladder of rungs this client decodes (its
// caps), or one rung of it: /play/info's qualities are Auto - the ladder,
// which hls.js steps through as the network and the player's size allow -
// then the rungs the client may pick, tallest first, and null when there is
// nothing to choose (a package of one rendition). A pick reloads the master
// with q=<name>, Auto with q=auto.
//
// On the fly, /play/info lists every rung of the transcode ladder - high,
// medium, low - each named by the frame it encodes for this title and this
// client, so two can share a name: a 720p original's high and medium are
// both "Medium (720p)". The menu shows one row per name, the first's (the
// better encode), and a step down goes to the next rung of another name.

export const AUTO = 'auto';

/** The name of the original played as it is: a direct stream, a stream copy. */
export const ORIGINAL = 'Original';

/** The on-the-fly ladder's rungs, the best first: the q a client asks for each with. */
export const ON_THE_FLY_RUNGS: readonly string[] = ['high', 'medium', 'low'];

export interface PlayQuality {
  /** The ?q= value: "auto", a rung's id ("v1"), or a transcode rung ("medium"). */
  name: string;
  /** What the menu says: "Auto", "High (1080p)". */
  label: string;
  id?: string;
  width?: number;
  height?: number;
  codec?: string;
  /** bit/s, the variant's BANDWIDTH. */
  bitrate?: number;
  video_range?: string;
}

// The table's steps, the tallest first: a height takes the name of the
// first step it reaches.
const STEPS: readonly [number, string][] = [
  [2160, 'Ultra'],
  [1080, 'High'],
  [720, 'Medium'],
  [480, 'Low'],
  [0, 'Lowest'],
];

/**
 * A height's name by the table, with the height: "High (1080p)"; a height
 * between two steps the lower step's name ("Medium (900p)"), and so the
 * heights past either end ("Ultra (4320p)", "Lowest (240p)"). null for no
 * height.
 */
export function qualityName(height: number | null | undefined): string | null {
  if (typeof height !== 'number' || !Number.isFinite(height) || height <= 0) return null;
  const p = Math.round(height);
  const step = STEPS.find(([h]) => p >= h) ?? STEPS[STEPS.length - 1];
  return `${step[1]} (${p}p)`;
}

// The standard picture heights: the transcoder's ladder rungs and the boxes
// players and sources come in (chino-stream's sizeClasses).
const SIZE_CLASSES = [240, 360, 480, 540, 576, 720, 1080, 1440, 2160, 4320];

/**
 * The height a w×h frame is named by, as chino-stream's namedHeight has it:
 * that of the 16:9 frame it fills - its own height, unless it is wider than
 * 16:9: then the 16:9 frame as wide's, so a 2.39:1 film's 1920x800 is 1080p
 * and its 3840x1606 2160p. A frame up to 10% wider than that counts as the
 * 16:9 frame of a standard height it is no taller than (DCI 4096x2160 is
 * 2160p), and so does one up to 3% narrower, a standard frame cropped at the
 * sides (1916x800 is 1080p); else the 16:9 frame of its own height (1666x900
 * is 900p). A width not known leaves the height; 0 without a height.
 */
export function namedHeight(width: number | null | undefined, height: number | null | undefined): number {
  const h = typeof height === 'number' && Number.isFinite(height) ? Math.round(height) : 0;
  if (h <= 0) return 0;
  const w = typeof width === 'number' && Number.isFinite(width) && width > 0 ? Math.round(width) : 0;
  const full = w > 0 ? Math.max(h, Math.floor((w * 9 + 8) / 16)) : h;
  if (full === h) return h;
  for (let i = SIZE_CLASSES.length - 1; i >= 0; i--) {
    const c = SIZE_CLASSES[i];
    if (c >= h && c <= full && full * 10 <= c * 11) return c;
  }
  for (const c of SIZE_CLASSES) if (c > full && full * 100 >= c * 97) return c;
  if (full * 10 <= h * 11) return h;
  return full;
}

/** A frame's name, as chino-stream names a frame: the table's name of its
 *  namedHeight ("High (1080p)" for 1920x800); null without a height. */
export function frameQualityName(width: number | null | undefined, height: number | null | undefined): string | null {
  return qualityName(namedHeight(width, height));
}

/** Whether a stream of the mode at q plays the original as it is: a direct
 *  stream (passthrough, remux) at high, which chino-stream stream-copies -
 *  any other q re-encodes it. */
export function playsOriginal(mode: string | null | undefined, q: string): boolean {
  return (mode === 'passthrough' || mode === 'remux') && q === 'high';
}

/** What the player knows of a title around a label: the q it is for, the
 *  mode /play/info said, and the original's frame. */
export interface LabelContext {
  q?: string;
  mode?: string | null;
  width?: number;
  height?: number;
}

const HEIGHT_ONLY = /^(\d{3,4})p$/i;
const SOURCE_WORD = /(^|[^a-z])source([^a-z]|$)/i;

/**
 * A quality's name where the server's label for it is shown: the label as
 * it is ("Medium (720p)", "Original", "Auto"), but an older server's - a
 * height alone ("720p") is named by the table, never with its height twice
 * ("Medium (720p)"), and its "High (source resolution)" is "Original" where
 * that q plays the original as it is, else the name of the original's frame,
 * as a re-encode at the original's size is named, else the word alone
 * ("High") - no height rather than a wrong one. '' for no label.
 */
export function shownQualityName(label: string | null | undefined, ctx: LabelContext = {}): string {
  const t = (label ?? '').trim();
  const height = HEIGHT_ONLY.exec(t);
  if (height) return qualityName(Number(height[1])) ?? t;
  if (SOURCE_WORD.test(t)) {
    if (ctx.q && playsOriginal(ctx.mode, ctx.q)) return ORIGINAL;
    return frameQualityName(ctx.width, ctx.height) ?? t.split(/[\s(]/)[0];
  }
  return t;
}

/** Entries of one name are one row: the first of them (the better encode). */
function oneRowPerName<T extends { label: string }>(entries: readonly T[]): T[] {
  const seen = new Set<string>();
  return entries.filter((e) => {
    const key = e.label.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The quality menu of a packaged title: /play/info's qualities when they
 * name two or more rungs, each named as the server gives it
 * (shownQualityName: an older server's "720p" is "Medium (720p)"), one row
 * per name, Auto first (put there should the server leave it out); null for
 * anything else - a title that is not packaged, a package of one rendition.
 */
export function packagedQualityMenu(
  info: { mode?: string; qualities?: readonly PlayQuality[] | null } | null | undefined,
): PlayQuality[] | null {
  if (!info || info.mode !== 'packaged' || !Array.isArray(info.qualities)) return null;
  const entries = oneRowPerName(
    info.qualities
      .filter(
        (e): e is PlayQuality => !!e && typeof e.name === 'string' && e.name !== '' && typeof e.label === 'string' && e.label.trim() !== '',
      )
      .map((e) => (e.name === AUTO ? e : { ...e, label: shownQualityName(e.label) })),
  );
  const rungs = entries.filter((e) => e.name !== AUTO);
  if (rungs.length < 2) return null;
  const auto = entries.find((e) => e.name === AUTO) ?? { name: AUTO, label: 'Auto' };
  return [auto, ...rungs];
}

/**
 * The entry the player is on, for the q it asked with: the rung of that
 * name when the menu has it, else Auto - which is what chino-stream serves
 * a packaged title for any other q (auto, the high the player starts with,
 * a rung this client can no longer pick).
 */
export function chosenQuality(menu: readonly PlayQuality[], q: string): PlayQuality {
  return menu.find((e) => e.name !== AUTO && e.name === q) ?? menu.find((e) => e.name === AUTO) ?? menu[0];
}

/** What is playing: a level of hls.js (its variant's URI, size and NAME),
 *  or the picture's size where the browser plays HLS itself; q, the q of
 *  the source it belongs to. */
export interface PlayingLevel {
  uri?: string;
  width?: number;
  height?: number;
  /** The variant's NAME: the server's name for it. */
  name?: string;
  q?: string;
}

/** The rung a variant playlist belongs to: its directory (".../play/v1/playlist.m3u8?…" → "v1"). */
export function rungOfUri(uri: string | undefined): string {
  const parts = (uri ?? '').split(/[?#]/)[0].split('/').filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2] : '';
}

/**
 * The name of what is playing: the menu's label of its rung - found by the
 * rung's id in the variant URI, else by its picture size - else the name
 * the master gives the variant, else its frame's name by the table. null
 * when nothing is known yet.
 */
export function playingLabel(level: PlayingLevel | null | undefined, menu: readonly PlayQuality[] | null | undefined): string | null {
  if (!level) return null;
  const rungs = (menu ?? []).filter((e) => e.name !== AUTO);
  const rung = rungOfUri(level.uri);
  const byId = rung ? rungs.find((e) => (e.id ?? e.name) === rung) : undefined;
  if (byId) return byId.label;
  const bySize = level.width && level.height ? rungs.find((e) => e.width === level.width && e.height === level.height) : undefined;
  if (bySize) return bySize.label;
  return shownQualityName(level.name) || frameQualityName(level.width, level.height);
}

/** Auto with the rung it plays: "Auto · Medium (720p)"; plain "Auto" until that is known. */
export function autoLabel(auto: string, playing: string | null): string {
  return playing ? `${auto} · ${playing}` : auto;
}

/** A rung of the on-the-fly ladder as the menu names it; known, when the
 *  name is the server's (its label, or what plays) rather than the rung's
 *  word alone. */
export interface LadderEntry {
  name: string;
  label: string;
  known: boolean;
}

const RUNG_WORDS: Readonly<Record<string, string>> = { high: 'High', medium: 'Medium', low: 'Low' };

/**
 * The on-the-fly ladder, the best first, each rung named: "Original" for the
 * one that plays the original as it is (a direct stream's high); else
 * /play/info's label for it (listed: its qualities, or those it gives for a
 * q of the ladder, for a direct stream moved onto it), shown as
 * shownQualityName shows it; else, for the rung playing, the NAME of its
 * variant or its frame's name; else high by the original's frame; else the
 * rung's word alone.
 */
export function onTheFlyLadder(o: {
  mode?: string | null;
  listed?: readonly PlayQuality[] | null;
  width?: number;
  height?: number;
  playing?: PlayingLevel | null;
}): LadderEntry[] {
  return ON_THE_FLY_RUNGS.map((q) => {
    if (playsOriginal(o.mode, q)) return { name: q, label: ORIGINAL, known: true };
    const listed = (o.listed ?? []).find((e) => e?.name === q && typeof e.label === 'string' && e.label.trim() !== '');
    if (listed) return { name: q, label: shownQualityName(listed.label, { q, mode: o.mode, width: o.width, height: o.height }), known: true };
    const playing = o.playing && o.playing.q === q ? shownQualityName(o.playing.name) || frameQualityName(o.playing.width, o.playing.height) : null;
    if (playing) return { name: q, label: playing, known: true };
    const original = q === 'high' ? frameQualityName(o.width, o.height) : null;
    return { name: q, label: original ?? RUNG_WORDS[q], known: false };
  });
}

/** The on-the-fly menu's rows: one per name, the first rung of each. */
export function ladderRows(ladder: readonly LadderEntry[]): LadderEntry[] {
  return oneRowPerName(ladder);
}

/** The row of the ladder's menu the player is on for q: q's own, or the row
 *  of q's name where another rung of that name has it (a 720p original's
 *  medium is its high's "Medium (720p)"). null for a q the ladder lacks. */
export function ladderRow(ladder: readonly LadderEntry[], q: string): LadderEntry | null {
  const rows = ladderRows(ladder);
  const own = ladder.find((e) => e.name === q);
  if (!own) return null;
  return rows.find((e) => e.name === q) ?? rows.find((e) => e.label.toLowerCase() === own.label.toLowerCase()) ?? null;
}

/** Where a step down goes from q on the ladder: the next rung with another
 *  name - a 720p original's high to low, past medium, which encodes the
 *  same frame - or null where none is lower (a 360p original's rungs all
 *  read "Lowest (360p)"), or q is not on it. */
export function lowerRung(ladder: readonly LadderEntry[], q: string): string | null {
  const i = ladder.findIndex((e) => e.name === q);
  if (i < 0) return null;
  const name = ladder[i].label.toLowerCase();
  return ladder.slice(i + 1).find((e) => e.label.toLowerCase() !== name)?.name ?? null;
}
