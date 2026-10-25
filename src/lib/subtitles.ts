// The subtitles of a playback: which of a title's tracks the menu lists and
// in what order, which one comes on by itself, and what a pick does (the
// design system's subtitles pattern). Pure, but for the server's languages
// (a fetch, given in): subtitles.test.ts runs it under node --test.
//
// A title's subtitles are the streams embedded in its original file
// (/play/info subtitle_tracks; chino-stream extracts a text one as WebVTT on
// demand) and its sidecars (GET /items/{id}/subtitles). A packaged title's
// are its sidecars, those outside the server's subtitle languages included:
// its menu is any title's.

import {
  autoSubtitleTrack,
  isAiSubtitle,
  isPictureSubtitle,
  isSdhSubtitle,
  languageName,
  languageTag,
  normalizeLang,
  regionOf,
  saysForced,
  scriptOf,
  subtitleLabel,
  subtitleLanguage,
  type SubtitleDefaults,
} from './languages.ts';
import { HttpError } from './loadFailure.ts';
import { AUDIO_ORIGINAL, SUBTITLES_OFF } from './settingsLanguages.ts';

/** The text under Settings' subtitle language, the same in every chino app
 *  (docs/chino, subtitles: the setting) - what autoSubtitle does, and how
 *  long a pick in the player holds (playerChooses, viewerPicks). */
export const SUBTITLE_SETTING_TEXT =
  "Subtitles in the language you pick here come on when a title's audio is in another language. " +
  'Otherwise, only the foreign-language parts get subtitles, where a title has them. ' +
  "A choice in the player applies only to what's playing now.";

/** One subtitle a title has. */
export interface SubtitleSource {
  id: string;
  /** The language code as the track is tagged. */
  lang: string;
  /** The track's own title (the file's, or the catalog's label of a
   *  sidecar), when it has one. */
  title?: string;
  forced?: boolean;
  /** The sidecar's format ("pgs", "webvtt"); none for text. */
  format?: string;
  /** One of the file's own streams, not a sidecar attached to it. */
  embedded?: boolean;
}

/** A subtitle as the menu lists it. */
export type SubtitleEntry<T extends SubtitleSource = SubtitleSource> = T & {
  /** Its name (languages.ts subtitleLabel): "Chinese (Simplified) · AI". */
  label: string;
  /** Its language as a BCP 47 tag, with the script or region its title
   *  gives where its code has none (languages.ts subtitleLanguage: "chi"
   *  titled "繁體中文" is "zh-Hant"); '' for none. What the menu lists it
   *  by. */
  tag: string;
  /** Forced, as its flag or its title says. */
  forced: boolean;
  /** For the deaf and hard of hearing, as its title says. */
  sdh: boolean;
  /** Made by the platform, as its title says ("AI"). */
  ai: boolean;
  /** Pictures (PGS), not text. */
  picture: boolean;
};

// Whether a track's own title says the platform made it (languages.ts, where
// a label keeps such a title).
export { isAiSubtitle };

/** The tracks as the menu names them: each with its label and its kind. */
export function subtitleEntries<T extends SubtitleSource>(tracks: readonly T[]): SubtitleEntry<T>[] {
  return tracks.map((t) => {
    const forced = !!t.forced || saysForced(t.title);
    const sdh = isSdhSubtitle(t.title);
    return {
      ...t,
      label: subtitleLabel({ lang: t.lang, title: t.title, forced, sdh }),
      tag: subtitleLanguage(t),
      forced,
      sdh,
      ai: isAiSubtitle(t.title),
      picture: isPictureSubtitle(t.format),
    };
  });
}

/** The subtitles menu under "off": `top`, the languages that matter here,
 *  and `more`, what "more languages" opens - empty where there is nothing
 *  more to open. */
export interface SubtitleMenu<T extends SubtitleSource = SubtitleSource> {
  top: SubtitleEntry<T>[];
  more: SubtitleEntry<T>[];
}

export interface SubtitleMenuOptions {
  /** Settings' subtitle language, or "off" (none). */
  preferred?: string | null;
  /** Settings' audio language, or "orig" (Original, none): one of the
   *  person's own languages where the server names none. */
  audio?: string | null;
  /** The device's or the browser's language (navigator.languages[0]): one of
   *  the person's own languages where the server names none. */
  device?: string | null;
  /** The subtitle languages the server is set up for, its order; none from
   *  an older server. */
  serverLanguages: readonly string[];
  /** The id of the subtitle on, if any. */
  on?: string | null;
}

/** A language setting's value as a language: '' for none ("off", "orig",
 *  empty, a code that names no language). */
function settingLanguage(value: string | null | undefined, none: string): string {
  const v = value?.trim() ?? '';
  return v && v.toLowerCase() !== none ? v : '';
}

/** The languages that matter to the person where the server names none, in
 *  this order: the subtitle setting's, the audio setting's unless it is
 *  Original, and the device's or the browser's - each once. */
export function ownLanguages({ preferred, audio, device }: Pick<SubtitleMenuOptions, 'preferred' | 'audio' | 'device'>): string[] {
  const own: string[] = [];
  for (const w of [settingLanguage(preferred, SUBTITLES_OFF), settingLanguage(audio, AUDIO_ORIGINAL), device?.trim() ?? '']) {
    if (languageTag(w) && !own.some((x) => normalizeLang(x) === normalizeLang(w))) own.push(w);
  }
  return own;
}

/** Whether a track tagged `code` is in the language `want` names: the same
 *  language, and the same script and region where both name one ("en" takes
 *  "en-GB", "zh-Hans" an unmarked "chi", but "zh-Hans" is not "zh-Hant"). */
export function sameLanguage(want: string | null | undefined, code: string | null | undefined): boolean {
  const w = languageTag(want);
  const t = languageTag(code);
  if (!w || !t || normalizeLang(w) !== normalizeLang(t)) return false;
  const [ws, ts] = [scriptOf(w), scriptOf(t)];
  if (ws && ts && ws !== ts) return false;
  const [wr, tr] = [regionOf(w), regionOf(t)];
  return !wr || !tr || wr === tr;
}

// Within a language: plain, for deaf and hard of hearing, foreign-language
// parts only, then the ones the platform made.
function kindRank(e: SubtitleEntry): number {
  return e.ai ? 3 : e.forced ? 2 : e.sdh ? 1 : 0;
}

/** The tracks of one run by their kinds (kindRank), each kind in the order
 *  they come. */
function byKind<E extends SubtitleEntry>(group: readonly E[]): E[] {
  return [...group].sort((a, b) => kindRank(a) - kindRank(b));
}

// Names in alphabetical order, as a reader of English sorts them.
const COLLATOR = new Intl.Collator('en');

/** A run's name as it sorts: its words, without the brackets and commas
 *  between them, so a name comes before the longer ones it begins -
 *  "Chinese (Traditional)" before "Chinese (Traditional, Taiwan)", where
 *  the collator alone puts the comma before the bracket. */
function sortName(name: string): string {
  return name.replace(/[(),]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** The script and region a track's tag names beside its language ("Hans" of
 *  "zh-Hans", "BR" of "pt-BR"): its run within the language; '' for the
 *  bare language. */
function runOf(e: SubtitleEntry): string {
  return [scriptOf(e.tag), regionOf(e.tag)].filter(Boolean).join('-');
}

/**
 * The tracks of one language, a run for each of its regions and scripts:
 * the bare language first, then the others in alphabetical order of their
 * names ("Chinese", "Chinese (Simplified)", "Chinese (Simplified) · AI",
 * "Chinese (Traditional)"), each run by its kinds (byKind).
 */
function byRun<E extends SubtitleEntry>(group: readonly E[]): E[] {
  const runs = new Map<string, E[]>();
  for (const e of group) {
    const run = runOf(e);
    const list = runs.get(run);
    if (list) list.push(e);
    else runs.set(run, [e]);
  }
  return [...runs.entries()]
    .sort(([a, ea], [b, eb]) =>
      a === b ? 0 : a === '' ? -1 : b === '' ? 1 : COLLATOR.compare(sortName(languageName(ea[0].tag)), sortName(languageName(eb[0].tag))),
    )
    .flatMap(([, entries]) => byKind(entries));
}

/** The tracks by language, in the order each language first comes: a
 *  language's tracks together, its regions and scripts with it ("zh-Hant"
 *  and "zh-Hans" with "zh"), a run each (byRun). A track in no language is
 *  on its own, in its place. */
function byLanguage<E extends SubtitleEntry>(list: readonly E[]): { base: string; entries: E[] }[] {
  const groups = new Map<string, { base: string; entries: E[] }>();
  list.forEach((e, i) => {
    const base = normalizeLang(e.tag);
    const key = base || `\u0000${i}`;
    const group = groups.get(key);
    if (group) group.entries.push(e);
    else groups.set(key, { base, entries: [e] });
  });
  return [...groups.values()].map((g) => ({ base: g.base, entries: byRun(g.entries) }));
}

/** Languages in alphabetical order of their names - a track in no language
 *  by its own - as "more languages" lists them. */
function alphabetical<E extends SubtitleEntry>(groups: readonly { base: string; entries: E[] }[]): { base: string; entries: E[] }[] {
  const name = (g: { base: string; entries: E[] }) => (g.base ? languageName(g.base) : g.entries[0]?.label ?? '');
  return [...groups].sort((a, b) => COLLATOR.compare(name(a), name(b)));
}

/**
 * Which of two tracks that read the same the menu shows, `a` the one that
 * comes first: the one on; else the file's own, timed to this file, before
 * a sidecar; else a text one before a picture one; else the first - tagged
 * with a language or not (standsForBoth gives it its twin's).
 */
function better(a: SubtitleEntry, b: SubtitleEntry, on: string | null | undefined): SubtitleEntry {
  if (on) {
    if (b.id === on) return b;
    if (a.id === on) return a;
  }
  if (!!a.embedded !== !!b.embedded) return a.embedded ? a : b;
  if (a.picture !== b.picture) return a.picture ? b : a;
  return a;
}

/** The one the menu shows of two that read the same (better), in the
 *  language of both: where it is tagged with none and reads as one only by
 *  its title ("English" on an "und" track), it takes the other's tag, so it
 *  is listed with that language and comes on by it. */
function standsForBoth<T extends SubtitleSource>(
  a: SubtitleEntry<T>,
  b: SubtitleEntry<T>,
  on: string | null | undefined,
): SubtitleEntry<T> {
  const kept = better(a, b, on) as SubtitleEntry<T>;
  const other = kept === a ? b : a;
  return !kept.tag && other.tag ? { ...kept, tag: other.tag, lang: other.lang } : kept;
}

/**
 * The subtitles menu of a title's tracks, given in the order they come (the
 * file's own streams first, in the file's order, then its sidecars). On
 * top: the viewer's subtitle language (Settings; "off" names none), then
 * each other subtitle language the server is set up for. A language on top
 * brings all of its tracks there, the AI ones included, whatever region or
 * script names it: a server that names "zh-Hans" shows "Chinese
 * (Traditional)" in the Chinese block too, never under "more languages".
 * Where two of these name one language with another script or region (the
 * setting's "zh-Hant", the server's "zh-Hans"), its tracks are one block,
 * where the language first comes - never split by the languages between.
 * Within a language, each region or
 * script keeps a run of its own, the bare language first and the others in
 * alphabetical order of their names
 * ("Chinese", "Chinese (Simplified)", "Chinese (Simplified) · AI",
 * "Chinese (Traditional)"), and within a run the plain track first, then
 * for deaf and hard of hearing, then foreign-language parts only, then the
 * ones the platform made ("· AI"). Then "more languages" with the rest, the
 * languages in alphabetical order of their names (a track in no language
 * by its own name), a language's regions and scripts with it, in runs the
 * same way. A packaged title is no different: a package keeps the tracks
 * outside the server's languages, and they are under "more languages" as
 * an original's are.
 *
 * The menu never lists every track a file brings: a title can carry a
 * hundred. On a server set up for no subtitle languages (an empty list, or
 * an older server without the route) the languages on top are the person's
 * own (ownLanguages): the subtitle setting's, the audio setting's unless it
 * is Original, then the device's or the browser's - and the rest is under
 * "more languages", as with the server's. Each of them the whole language
 * as well: the viewer's "zh-Hant" puts Chinese on top, the whole of
 * it, its runs in the order above - "Chinese", "Chinese (China)", "Chinese
 * (Simplified)", "Chinese (Traditional)" - never their own run first and
 * the rest of the language after it.
 *
 * Tracks that would read the same show once, where the first of them was,
 * and are never numbered ("English (2)"): the file's own before one the
 * server adds, otherwise the first in the file (better). The one shown
 * stands for the others: a track tagged with no language that reads as
 * one by its title ("English" on an "und" track) takes the language of a
 * twin tagged with it, is listed with that language and comes on by it.
 */
export function subtitleMenu<T extends SubtitleSource>(
  entries: readonly SubtitleEntry<T>[],
  { preferred, audio, device, serverLanguages, on }: SubtitleMenuOptions,
): SubtitleMenu<T> {
  const firstOf = new Map<string, SubtitleEntry<T>>();
  for (const e of entries) {
    const seen = firstOf.get(e.label);
    firstOf.set(e.label, seen ? standsForBoth(seen, e, on) : e);
  }
  const unique = [...firstOf.values()];
  const named = serverLanguages.some((l) => languageTag(l));
  // The server's languages after the subtitle setting's; where it names
  // none, the person's own, each the whole language.
  const wanted: string[] = [];
  const pref = settingLanguage(preferred, SUBTITLES_OFF);
  for (const w of named ? [...(pref ? [pref] : []), ...serverLanguages] : ownLanguages({ preferred, audio, device })) {
    const tag = languageTag(w);
    if (tag && !wanted.some((x) => languageTag(x) === tag)) wanted.push(w);
  }
  // On top, one block per language asked for, the whole language whatever
  // region or script names it: the server's "zh-Hans" brings "Chinese
  // (Traditional)" too. A later one in a language already on top - the
  // server's "zh-Hans" after the setting's "zh-Hant" - has nothing left to
  // bring, so the language's tracks stay together, in their runs.
  const placed = new Set<SubtitleEntry<T>>();
  const blocks: SubtitleEntry<T>[][] = [];
  for (const w of wanted) {
    const base = normalizeLang(w);
    const block = unique.filter((e) => !placed.has(e) && normalizeLang(e.tag) === base);
    if (!block.length) continue;
    block.forEach((e) => placed.add(e));
    blocks.push(block);
  }
  const top = blocks.flatMap((b) => byRun(b));
  const rest = byLanguage(unique.filter((e) => !placed.has(e)));
  return { top, more: alphabetical(rest).flatMap((g) => g.entries) };
}

/** Every entry of the menu, in its order. */
export function menuEntries<T extends SubtitleSource>(menu: SubtitleMenu<T>): SubtitleEntry<T>[] {
  return [...menu.top, ...menu.more];
}

/**
 * The subtitle that comes on by itself, or null for off: the viewer's
 * preferred subtitle language (Settings) where the title has it and the
 * audio playing is in another language - compared with the audio that
 * plays, never the audio language they prefer - its first track in the menu
 * that is not the foreign-language parts only, or its foreign-language
 * parts only where the title has no other track in it (the phone app's
 * defaultSubtitleTrack too); else the foreign-language parts only in the
 * language of the audio playing, a text one before a picture one. Never
 * another language, and never a track because it comes first or a file
 * flags it default.
 */
export function autoSubtitle(menu: SubtitleMenu, defaults: SubtitleDefaults): string | null {
  return autoSubtitleTrack(menuEntries(menu), defaults);
}

/** Who decides the subtitle on, and which one it is: `on` is its id, null
 *  for off; `picked` once the viewer has chosen in the menu. */
export interface SubtitleChoice {
  on: string | null;
  picked: boolean;
}

export const NO_SUBTITLE: SubtitleChoice = { on: null, picked: false };

/** The player's choice (autoSubtitle), as the playback starts and whenever
 *  the tracks or the audio's language change - none once the viewer has
 *  picked: their pick holds for the rest of the playback, an Off too. The
 *  same choice again is the same state. */
export function playerChooses(choice: SubtitleChoice, id: string | null): SubtitleChoice {
  if (choice.picked || choice.on === id) return choice;
  return { on: id, picked: false };
}

/** The viewer's pick in the menu: that subtitle on instead of the one that
 *  was - one at a time - or none for "off". */
export function viewerPicks(choice: SubtitleChoice, id: string | null): SubtitleChoice {
  if (choice.picked && choice.on === id) return choice;
  return { on: id, picked: true };
}

// The server's subtitle languages, asked once a session: kept in memory for
// this page and in sessionStorage for the tab's later pages (the player
// opens as a page of its own).
const LANGUAGES_KEY = 'chino:subtitleLanguages';
let known: readonly string[] | null = null;
let asking: Promise<readonly string[]> | null = null;

/** What the server answered to GET /api/v1/subtitles/languages: its list,
 *  [] for a server without the route (404); null for no answer. */
export function languagesFromResponse(status: number, body: unknown): readonly string[] | null {
  if (status === 404) return [];
  if (status < 200 || status >= 300) return null;
  const list = (body as { languages?: unknown } | null)?.languages;
  if (!Array.isArray(list)) return null;
  return list.filter((l): l is string => typeof l === 'string' && languageTag(l) !== '');
}

/**
 * The subtitle languages the server is set up for, in its order ("en",
 * "de", "zh-Hans"): asked once a session through `ask` (status and body of
 * GET /api/v1/subtitles/languages), and kept. An older server, without the
 * route, has none. No answer - the network, an error - counts as none for
 * now, and the next playback asks again.
 */
export async function serverSubtitleLanguages(
  ask: () => Promise<{ status: number; body: unknown }>,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = sessionStore(),
): Promise<readonly string[]> {
  const kept = keptLanguages(storage);
  if (kept) return kept;
  if (!asking) {
    asking = ask()
      .then(({ status, body }) => languagesFromResponse(status, body))
      .catch(() => null)
      .then((list) => {
        asking = null;
        if (!list) return [];
        return remember(list, storage);
      });
  }
  return asking;
}

/** The kept languages, from this page or the tab's storage; null when
 *  there are none yet. */
function keptLanguages(storage: Pick<Storage, 'getItem'> | null): readonly string[] | null {
  if (known) return known;
  try {
    const raw = storage?.getItem(LANGUAGES_KEY);
    const stored = raw ? (JSON.parse(raw) as unknown) : null;
    if (Array.isArray(stored) && stored.every((l) => typeof l === 'string')) {
      known = stored as string[];
      return known;
    }
  } catch {
    /* storage off, or not ours */
  }
  return null;
}

/** Keeps the server's answer for the session. */
function remember(list: readonly string[], storage: Pick<Storage, 'setItem'> | null): readonly string[] {
  known = list;
  try {
    storage?.setItem(LANGUAGES_KEY, JSON.stringify(list));
  } catch {
    /* storage off: this page keeps them */
  }
  return list;
}

/**
 * The server's subtitle languages for Settings, kept as the player keeps
 * them (serverSubtitleLanguages) - but a failure is said, not taken for
 * none: the answer's status as an HttpError (0 for a body that couldn't be
 * read), or the network's error, for the screen to say why
 * (lib/loadFailure.ts). A server without the route (404) has none.
 */
export async function settingsSubtitleLanguages(
  ask: () => Promise<{ status: number; body: unknown }>,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = sessionStore(),
): Promise<readonly string[]> {
  const kept = keptLanguages(storage);
  if (kept) return kept;
  const { status, body } = await ask();
  const list = languagesFromResponse(status, body);
  if (!list) throw new HttpError(status >= 200 && status < 300 ? 0 : status);
  return remember(list, storage);
}

/** Forgets the server's subtitle languages (tests; a server change). */
export function forgetServerSubtitleLanguages(storage: Pick<Storage, 'removeItem'> | null = sessionStore()): void {
  known = null;
  asking = null;
  try {
    storage?.removeItem(LANGUAGES_KEY);
  } catch {
    /* storage off */
  }
}

function sessionStore(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}
