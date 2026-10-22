// The subtitles of a playback: which of a title's tracks the menu lists and
// in what order, which one comes on by itself, and what a pick does (the
// design system's subtitles pattern). Pure, but for the server's languages
// (a fetch, given in): subtitles.test.ts runs it under node --test.
//
// A title's subtitles are the streams embedded in its original file
// (/play/info subtitle_tracks; chino-stream extracts a text one as WebVTT on
// demand) and its sidecars (GET /items/{id}/subtitles). A packaged title's
// are its sidecars only, in the server's subtitle languages.

import {
  autoSubtitleTrack,
  isPictureSubtitle,
  isSdhSubtitle,
  languageTag,
  normalizeLang,
  saysForced,
  subtitleLabel,
  type SubtitleDefaults,
} from './languages.ts';

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
  /** Forced, as its flag or its title says. */
  forced: boolean;
  /** For the deaf and hard of hearing, as its title says. */
  sdh: boolean;
  /** Made by the platform, as its title says ("AI"). */
  ai: boolean;
  /** Pictures (PGS), not text. */
  picture: boolean;
};

/** Whether a track's own title says the platform made it ("AI"): the kind
 *  a language lists last ("Chinese (Simplified) · AI"). */
export function isAiSubtitle(title: string | undefined | null): boolean {
  return !!title && /(^|[^A-Za-z])AI([^A-Za-z]|$)/.test(title);
}

/** The tracks as the menu names them: each with its label and its kind. */
export function subtitleEntries<T extends SubtitleSource>(tracks: readonly T[]): SubtitleEntry<T>[] {
  return tracks.map((t) => {
    const forced = !!t.forced || saysForced(t.title);
    const sdh = isSdhSubtitle(t.title);
    return {
      ...t,
      label: subtitleLabel({ lang: t.lang, title: t.title, forced, sdh }),
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
  /** The subtitle languages the server is set up for, its order; none from
   *  an older server. */
  serverLanguages: readonly string[];
  /** The title plays from its package, not its original file. */
  packaged: boolean;
  /** The id of the subtitle on, if any. */
  on?: string | null;
}

/** The script of a canonical tag ("Hans" of "zh-Hans-CN"), or ''. */
function scriptOf(tag: string): string {
  return tag.split('-').slice(1).find((s) => /^[A-Za-z]{4}$/.test(s)) ?? '';
}

/** The region of a canonical tag ("BR" of "pt-BR", "419"), or ''. */
function regionOf(tag: string): string {
  return tag.split('-').slice(1).find((s) => /^([A-Za-z]{2}|\d{3})$/.test(s)) ?? '';
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

/**
 * Which of two tracks that read the same the menu shows: the one on, else a
 * text one before a picture one, else the file's own before a sidecar, else
 * the first.
 */
function better(a: SubtitleEntry, b: SubtitleEntry, on: string | null | undefined): SubtitleEntry {
  if (on) {
    if (b.id === on) return b;
    if (a.id === on) return a;
  }
  if (a.picture !== b.picture) return a.picture ? b : a;
  if (!!a.embedded !== !!b.embedded) return a.embedded ? a : b;
  return a;
}

/**
 * The subtitles menu of a title's tracks, given in the order they come (the
 * file's own streams first, then its sidecars). On top: the viewer's subtitle
 * language (Settings; "off" names none), then each other subtitle language
 * the server is set up for; each language's tracks plain first, then for
 * deaf and hard of hearing, then foreign-language parts only, then the ones
 * the platform made ("· AI"), as the phone app lists them. Then "more
 * languages" with the rest, by language in the order they come, each
 * language's kinds the same way, tracks in no language last.
 *
 * Without "more languages": a packaged title, which carries the server's
 * languages only, and a title on a server set up for no subtitle languages
 * (an empty list, or an older server without the route), where "off" and
 * "more languages" alone would hide every track behind a click - their
 * tracks are all listed on top, the viewer's language first.
 *
 * Two tracks that read the same (one language, one kind, nothing in their
 * titles to tell them apart) show once, where the first of them was: the one
 * on if either is, else a text one, else the file's own.
 */
export function subtitleMenu<T extends SubtitleSource>(
  entries: readonly SubtitleEntry<T>[],
  { preferred, serverLanguages, packaged, on }: SubtitleMenuOptions,
): SubtitleMenu<T> {
  const firstOf = new Map<string, SubtitleEntry<T>>();
  for (const e of entries) {
    const seen = firstOf.get(e.label);
    firstOf.set(e.label, seen ? (better(seen, e, on) as SubtitleEntry<T>) : e);
  }
  const unique = [...firstOf.values()];
  const ordered = (list: readonly SubtitleEntry<T>[]) => {
    const groups = new Map<string, SubtitleEntry<T>[]>();
    for (const e of list) {
      const key = languageTag(e.lang);
      groups.set(key, [...(groups.get(key) ?? []), e]);
    }
    return [...groups.values()].flatMap((g) => [...g].sort((a, b) => kindRank(a) - kindRank(b)));
  };
  const pref = preferred?.trim() ?? '';
  const wanted: string[] = [];
  for (const w of [...(pref && pref.toLowerCase() !== 'off' ? [pref] : []), ...serverLanguages]) {
    const tag = languageTag(w);
    if (tag && !wanted.some((x) => languageTag(x) === tag)) wanted.push(w);
  }
  const placed = new Set<SubtitleEntry<T>>();
  const top: SubtitleEntry<T>[] = [];
  for (const w of wanted) {
    const group = unique.filter((e) => !placed.has(e) && sameLanguage(w, e.lang));
    group.forEach((e) => placed.add(e));
    top.push(...ordered(group));
  }
  const rest = unique.filter((e) => !placed.has(e));
  const others = [...ordered(rest.filter((e) => languageTag(e.lang))), ...rest.filter((e) => !languageTag(e.lang))];
  const noMore = packaged || !serverLanguages.some((l) => languageTag(l));
  return noMore ? { top: [...top, ...others], more: [] } : { top, more: others };
}

/** Every entry of the menu, in its order. */
export function menuEntries<T extends SubtitleSource>(menu: SubtitleMenu<T>): SubtitleEntry<T>[] {
  return [...menu.top, ...menu.more];
}

/**
 * The subtitle that comes on by itself, or null for off: the viewer's
 * preferred subtitle language (Settings) where the title has it and the
 * audio is in another language - not the language they chose, nor the audio
 * language they prefer - its first track in the menu that is not the
 * foreign-language parts only; else the foreign-language parts only in the
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
  if (!asking) {
    asking = ask()
      .then(({ status, body }) => languagesFromResponse(status, body))
      .catch(() => null)
      .then((list) => {
        asking = null;
        if (!list) return [];
        known = list;
        try {
          storage?.setItem(LANGUAGES_KEY, JSON.stringify(list));
        } catch {
          /* storage off: this page keeps them */
        }
        return list;
      });
  }
  return asking;
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
