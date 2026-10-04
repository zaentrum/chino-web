// Languages as the catalog, the media files and the settings spell them -
// ISO 639-2/B ("ger", "fre", "dut"), 639-2/T ("deu", "fra", "nld"), 639-1
// ("de"), BCP 47 tags ("pt-BR") - and what to call them. Pure:
// languages.test.ts runs it under node --test.

// ISO 639-2/B (bibliographic) codes and the /T (terminology) code each
// stands for; files tagged by older tools carry the /B ones.
const B_TO_T: Record<string, string> = {
  alb: 'sqi', arm: 'hye', baq: 'eus', bur: 'mya', chi: 'zho', cze: 'ces',
  dut: 'nld', fre: 'fra', geo: 'kat', ger: 'deu', gre: 'ell', ice: 'isl',
  mac: 'mkd', mao: 'mri', may: 'msa', per: 'fas', rum: 'ron', slo: 'slk',
  tib: 'bod', wel: 'cym',
};

// ISO 639-2/T → 639-1, for the languages a library is likely to carry.
// Anything else is compared as its three letters.
const T_TO_1: Record<string, string> = {
  ara: 'ar', ben: 'bn', bod: 'bo', bul: 'bg', cat: 'ca', ces: 'cs', cym: 'cy',
  dan: 'da', deu: 'de', ell: 'el', eng: 'en', est: 'et', eus: 'eu', fas: 'fa',
  fin: 'fi', fra: 'fr', gle: 'ga', glg: 'gl', heb: 'he', hin: 'hi', hrv: 'hr',
  hun: 'hu', hye: 'hy', ind: 'id', isl: 'is', ita: 'it', jpn: 'ja', kat: 'ka',
  kor: 'ko', lav: 'lv', lit: 'lt', mkd: 'mk', mri: 'mi', msa: 'ms', mya: 'my',
  nld: 'nl', nob: 'nb', nno: 'nn', nor: 'no', pol: 'pl', por: 'pt', ron: 'ro',
  rus: 'ru', slk: 'sk', slv: 'sl', spa: 'es', sqi: 'sq', srp: 'sr', swe: 'sv',
  tam: 'ta', tel: 'te', tgl: 'tl', tha: 'th', tur: 'tr', ukr: 'uk', urd: 'ur',
  vie: 'vi', zho: 'zh',
};

// Withdrawn 639-1 codes still found in the wild.
const OLD_1: Record<string, string> = { iw: 'he', in: 'id', ji: 'yi' };

// "Undetermined", "no linguistic content", "multiple", "uncoded": no language
// one could read or listen to.
const NO_LANGUAGE = new Set(['und', 'zxx', 'mul', 'mis']);

/**
 * The language a code names, as one comparable key: the 639-1 code where
 * there is one ("ger", "deu", "de", "de-CH" are all "de"), else the 639-2/T
 * code. '' when the code names no language ("und", empty, garbage).
 */
export function normalizeLang(code: unknown): string {
  if (typeof code !== 'string') return '';
  const primary = code.trim().replace(/_/g, '-').split('-')[0].toLowerCase();
  if (!/^[a-z]{2,3}$/.test(primary) || NO_LANGUAGE.has(primary)) return '';
  if (primary.length === 2) return OLD_1[primary] ?? primary;
  const t = B_TO_T[primary] ?? primary;
  return T_TO_1[t] ?? t;
}

/** The code as a BCP 47 tag for <track srclang> and Intl: the normalised
 *  language, with the region or script the code carried ("pt-BR"). */
export function languageTag(code: unknown): string {
  const lang = normalizeLang(code);
  if (!lang || typeof code !== 'string') return lang;
  const rest = code.trim().replace(/_/g, '-').split('-').slice(1).join('-');
  if (!rest) return lang;
  try {
    return Intl.getCanonicalLocales(`${lang}-${rest}`)[0] ?? lang;
  } catch {
    return lang;
  }
}

/** The language's name in the given UI locales ("ger" → "German"); the code
 *  itself when Intl does not know it; "Unknown language" for none. */
export function languageName(code: unknown, locales: readonly string[] = ['en']): string {
  const tag = languageTag(code);
  if (!tag) return 'Unknown language';
  try {
    const name = new Intl.DisplayNames([...locales], { type: 'language', fallback: 'none' }).of(tag);
    if (name) return name;
  } catch {
    /* no Intl.DisplayNames, or a tag it refuses */
  }
  return typeof code === 'string' ? code.trim() : tag;
}

export interface SubtitleTrackInfo {
  /** The language code as the track is tagged. */
  lang?: string;
  /** The track's own title, from the file or the catalog, when it has one. */
  title?: string;
  forced?: boolean;
}

/**
 * The subtitle menu's labels, one per track, in order: the language's name
 * ("German"), the track's title when it says more than that ("English ·
 * SDH"), "(forced)" for a forced track; and where two tracks would still
 * read the same, a number for the second and later ones ("German (2)").
 */
export function subtitleLabels(tracks: readonly SubtitleTrackInfo[], locales: readonly string[] = ['en']): string[] {
  const labels = tracks.map((t) => {
    const name = languageName(t.lang, locales);
    const title = (t.title ?? '').trim();
    let label = name;
    if (title && title.toLowerCase() !== name.toLowerCase() && !sameLanguageCode(title, t.lang)) {
      label = title.toLowerCase().includes(name.toLowerCase()) ? title : `${name} · ${title}`;
    }
    if (t.forced && !/forced/i.test(label)) label += ' (forced)';
    return label;
  });
  const seen = new Map<string, number>();
  return labels.map((label) => {
    const n = (seen.get(label) ?? 0) + 1;
    seen.set(label, n);
    return n === 1 ? label : `${label} (${n})`;
  });
}

/** A title that is only the track's language code again ("eng" on English). */
function sameLanguageCode(title: string, lang: string | undefined): boolean {
  return /^[a-z]{2,3}([-_][a-z0-9]+)*$/i.test(title) && normalizeLang(title) !== '' && normalizeLang(title) === normalizeLang(lang);
}

export interface SubtitleDefaults {
  /** The language of the audio being played. */
  audioLang?: string | null;
  /** Settings → Subtitles: a language, or 'off'. */
  subtitlePref?: string | null;
  /** Settings → Audio: a language, or 'orig' (the title's own). */
  audioPref?: string | null;
}

/**
 * The language subtitles come on in by themselves, or null for off - the
 * default. They come on only when the audio is in a language the viewer has
 * not said they follow: not the subtitle language they chose, not the audio
 * language they prefer. Never with subtitles set Off, and never when the
 * audio's language is not known.
 */
export function defaultSubtitleLang({ audioLang, subtitlePref, audioPref }: SubtitleDefaults): string | null {
  if (!subtitlePref || subtitlePref.trim().toLowerCase() === 'off') return null;
  const want = normalizeLang(subtitlePref);
  const audio = normalizeLang(audioLang);
  if (!want || !audio || audio === want) return null;
  if (audioPref && audioPref !== 'orig' && normalizeLang(audioPref) === audio) return null;
  return want;
}

/** The track to switch on by default, or null: one in the language
 *  defaultSubtitleLang names, a full one rather than a forced one. */
export function defaultSubtitleTrack<T extends { id: string; lang?: string; forced?: boolean }>(
  tracks: readonly T[],
  defaults: SubtitleDefaults,
): string | null {
  const want = defaultSubtitleLang(defaults);
  if (!want) return null;
  const inLang = tracks.filter((t) => normalizeLang(t.lang) === want);
  return (inLang.find((t) => !t.forced) ?? inLang[0])?.id ?? null;
}

/**
 * The rendition of a stream's audio that is the track /play/info lists:
 * hls.js's audioTracks (the master's NAME and LANGUAGE, "German" / "de")
 * or a <video>'s audioTracks (label, language), for a track as the file
 * tags it ("ger", its title). The one in its language - by name among
 * several, else the one at its place among them - else the one at its
 * place in the list. -1 for none.
 */
export function audioRenditionFor(
  track: { language?: string; title?: string } | undefined,
  place: number,
  renditions: readonly { name?: string; lang?: string }[],
): number {
  if (!track || renditions.length === 0) return -1;
  const title = track.title?.trim().toLowerCase() || '';
  const named = (i: number) => !!title && renditions[i].name?.trim().toLowerCase() === title;
  const lang = normalizeLang(track.language);
  const inLang = lang ? renditions.flatMap((r, i) => (normalizeLang(r.lang) === lang ? [i] : [])) : [];
  if (inLang.length === 1) return inLang[0];
  if (inLang.length > 1) return inLang.find(named) ?? (inLang.includes(place) ? place : inLang[0]);
  const byName = renditions.findIndex((_, i) => named(i));
  if (byName >= 0) return byName;
  return place >= 0 && place < renditions.length ? place : -1;
}
