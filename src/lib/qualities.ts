// The quality menu: what /play/info offers, which entry the player is on,
// what each is called, and where a step down goes. Pure: qualities.test.ts
// runs it.
//
// chino-stream names every quality by one fixed table of heights, so a name
// means the same height on every title and every installation (docs/chino,
// playback: quality names): "Ultra (2160p)", "High (1080p)", "Medium (720p)",
// "Low (480p)", "Lowest (360p)"; a height between two steps the lower step's
// name with its own height ("Medium (900p)"); "Original" for the original
// played as it is. A frame is named by its step (namedHeight): its height,
// or the height its width stands for at 16:9, whichever is larger. The name is the label of an entry of /play/info's
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
 * The height a w×h frame is named by, its step (docs/chino, playback:
 * quality names), as chino-stream's namedHeight has it: its own height, or
 * the height its width stands for at 16:9, whichever is larger - so a 2.39:1
 * film's 1920x800 is 1080p and its 3840x1606 2160p. A step up to 10% above a
 * standard height (SIZE_CLASSES), in a frame no taller than it, counts as
 * that height (DCI 4096x2160 is 2160p, 2048x858 1080p), and so does one up to
 * 3% below it, a standard frame cropped at the sides (1916x800 is 1080p) or
 * a few lines short (1904x1072 is 1080p, 1272x716 720p) - the rule holds for
 * every frame, as the spec and the TV have it, not only for one wider than
 * 16:9, where chino-stream's namedHeight still returns the height. Any other
 * step is its own: 1666x900 is 937p, 1728x720 972p, 1024x768 768p. A width
 * not known leaves the height; 0 without a height.
 */
export function namedHeight(width: number | null | undefined, height: number | null | undefined): number {
  const h = typeof height === 'number' && Number.isFinite(height) ? Math.round(height) : 0;
  if (h <= 0) return 0;
  const w = typeof width === 'number' && Number.isFinite(width) && width > 0 ? Math.round(width) : 0;
  const step = w > 0 ? Math.max(h, Math.floor((w * 9 + 8) / 16)) : h;
  for (let i = SIZE_CLASSES.length - 1; i >= 0; i--) {
    const c = SIZE_CLASSES[i];
    if (c >= h && c <= step && step * 10 <= c * 11) return c;
  }
  for (const c of SIZE_CLASSES) if (c > step && step * 100 >= c * 97) return c;
  return step;
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
 *  mode /play/info said, the original's frame, and the tallest frame the
 *  device's caps say it decodes (lib/caps.ts maxVideoHeight; 0: no cap). */
export interface LabelContext {
  q?: string;
  mode?: string | null;
  width?: number;
  height?: number;
  maxHeight?: number;
}

/**
 * The frame chino-stream encodes the on-the-fly ladder's high at, as its
 * transcodeGeometry does for that rung of no scale - an older server, which
 * labels it "High (source resolution)", as a newer one: the original's own
 * where it fits a 16:9 box 1080 lines tall, or as tall as the device's cap
 * where that is lower; else the original fitted into that box, its shape
 * kept, each side made even (3840x2160 is 1920x1080, 3840x1606 1920x804).
 * An original of a size not known, as it comes.
 */
export function highRungFrame(
  width: number | null | undefined,
  height: number | null | undefined,
  maxHeight = 0,
): { width: number; height: number } {
  const w = typeof width === 'number' && Number.isFinite(width) ? Math.trunc(width) : 0;
  const h = typeof height === 'number' && Number.isFinite(height) ? Math.trunc(height) : 0;
  const capH = maxHeight > 0 && maxHeight < 1080 ? Math.trunc(maxHeight) : 1080;
  const capW = Math.trunc((capH * 16) / 9);
  if (w <= 0 || h <= 0 || (w <= capW && h <= capH)) return { width: w, height: h };
  const even = (n: number) => (n + 1) & ~1;
  if (w * capH > h * capW) return { width: capW, height: even(Math.trunc((h * capW) / w)) };
  return { width: even(Math.trunc((w * capH) / h)), height: capH };
}

const HEIGHT_ONLY = /^(\d{3,4})p$/i;
const SOURCE_WORD = /(^|[^a-z])source([^a-z]|$)/i;

/**
 * A quality's name where the server's label for it is shown: the label as
 * it is ("Medium (720p)", "Original", "Auto"), but an older server's - a
 * height alone ("720p") is named by the table, never with its height twice
 * ("Medium (720p)"), and its "High (source resolution)" is "Original" where
 * that q plays the original as it is, else the name of the frame that
 * server encodes it at (highRungFrame: the original's, fitted into 1080
 * lines or the device's cap), as a re-encode is named by its frame - a 4K
 * original's is "High (1080p)" - else the word alone ("High"): no height
 * rather than a wrong one. '' for no label.
 */
export function shownQualityName(label: string | null | undefined, ctx: LabelContext = {}): string {
  const t = (label ?? '').trim();
  const height = HEIGHT_ONLY.exec(t);
  if (height) return qualityName(Number(height[1])) ?? t;
  if (SOURCE_WORD.test(t)) {
    if (ctx.q && playsOriginal(ctx.mode, ctx.q)) return ORIGINAL;
    const frame = highRungFrame(ctx.width, ctx.height, ctx.maxHeight);
    return frameQualityName(frame.width, frame.height) ?? t.split(/[\s(]/)[0];
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
 * variant or its frame's name; else high by the frame it encodes from the
 * original (highRungFrame); else the rung's word alone. maxHeight, the
 * tallest frame the device's caps say it decodes (0: no cap).
 */
export function onTheFlyLadder(o: {
  mode?: string | null;
  listed?: readonly PlayQuality[] | null;
  width?: number;
  height?: number;
  maxHeight?: number;
  playing?: PlayingLevel | null;
}): LadderEntry[] {
  return ON_THE_FLY_RUNGS.map((q) => {
    if (playsOriginal(o.mode, q)) return { name: q, label: ORIGINAL, known: true };
    const listed = (o.listed ?? []).find((e) => e?.name === q && typeof e.label === 'string' && e.label.trim() !== '');
    if (listed) {
      return { name: q, label: shownQualityName(listed.label, { q, mode: o.mode, width: o.width, height: o.height, maxHeight: o.maxHeight }), known: true };
    }
    const playing = o.playing && o.playing.q === q ? shownQualityName(o.playing.name) || frameQualityName(o.playing.width, o.playing.height) : null;
    if (playing) return { name: q, label: playing, known: true };
    const high = q === 'high' ? highRungFrame(o.width, o.height, o.maxHeight) : null;
    const guessed = high ? frameQualityName(high.width, high.height) : null;
    return { name: q, label: guessed ?? RUNG_WORDS[q], known: false };
  });
}

/**
 * A rung's name where the player says it (a notice): the ladder's, where
 * it is the server's; else what the rung's source calls what it plays
 * (level: its variant's NAME, else its frame) when it is that rung's; else
 * the ladder's word. null for a q the ladder lacks.
 */
export function rungName(ladder: readonly LadderEntry[], q: string, level?: PlayingLevel | null): string | null {
  const entry = ladder.find((e) => e.name === q);
  if (!entry) return null;
  if (entry.known) return entry.label;
  const named = level && level.q === q ? shownQualityName(level.name) || frameQualityName(level.width, level.height) : null;
  return named || entry.label;
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
