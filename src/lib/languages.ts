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

// ISO 639-2/T → 639-1, for the languages a library is likely to carry (the
// mobile app's Languages.kt has the same). Anything else is compared as its
// three letters.
const T_TO_1: Record<string, string> = {
  afr: 'af', amh: 'am', ara: 'ar', aze: 'az', bel: 'be', ben: 'bn', bod: 'bo',
  bos: 'bs', bul: 'bg', cat: 'ca', ces: 'cs', cym: 'cy', dan: 'da', deu: 'de',
  ell: 'el', eng: 'en', est: 'et', eus: 'eu', fas: 'fa', fin: 'fi', fra: 'fr',
  gle: 'ga', glg: 'gl', guj: 'gu', heb: 'he', hin: 'hi', hrv: 'hr', hun: 'hu',
  hye: 'hy', ind: 'id', isl: 'is', ita: 'it', jpn: 'ja', kan: 'kn', kat: 'ka',
  kaz: 'kk', khm: 'km', kor: 'ko', lao: 'lo', lat: 'la', lav: 'lv', lit: 'lt',
  ltz: 'lb', mal: 'ml', mar: 'mr', mkd: 'mk', mlt: 'mt', mon: 'mn', mri: 'mi',
  msa: 'ms', mya: 'my', nep: 'ne', nld: 'nl', nno: 'nn', nob: 'nb', nor: 'no',
  pan: 'pa', pol: 'pl', por: 'pt', pus: 'ps', ron: 'ro', rus: 'ru', sin: 'si',
  slk: 'sk', slv: 'sl', som: 'so', spa: 'es', sqi: 'sq', srp: 'sr', swa: 'sw',
  swe: 'sv', tam: 'ta', tel: 'te', tgl: 'tl', tha: 'th', tur: 'tr', ukr: 'uk',
  urd: 'ur', uzb: 'uz', vie: 'vi', yid: 'yi', zho: 'zh', zul: 'zu',
};

// ISO 639-1 → 639-2/T: the table above the other way round.
const ONE_TO_T: Record<string, string> = Object.fromEntries(Object.entries(T_TO_1).map(([t, one]) => [one, t]));

// Withdrawn 639-1 codes still found in the wild.
const OLD_1: Record<string, string> = { iw: 'he', in: 'id', ji: 'yi' };

// "Undetermined", "no linguistic content", "multiple", "uncoded": no language
// one could read or listen to.
const NO_LANGUAGE = new Set(['und', 'zxx', 'mul', 'mis']);

/** What a track tagged "zxx" (no linguistic content) is called: the audio of
 *  a film without dialogue. */
export const NO_DIALOGUE = 'No dialogue';

/** What a track is called whose language is not known ("und", none). */
export const UNKNOWN_LANGUAGE = 'Unknown';

// The codes for no one language that still say what a track is in, and what
// such a track is called: no dialogue ("zxx"), several languages ("mul"), a
// language ISO 639 has no code for ("mis").
const NOT_ONE_LANGUAGE = new Map([
  ['zxx', NO_DIALOGUE],
  ['mul', 'Multiple languages'],
  ['mis', 'Other language'],
]);

/** The code's language subtag, lower-cased ("pt" of "PT_br"); '' for none. */
function primarySubtag(code: unknown): string {
  return typeof code === 'string' ? code.trim().replace(/_/g, '-').split('-')[0].toLowerCase() : '';
}

/** Whether the code is "zxx": no linguistic content, no dialogue. */
export function isNoDialogue(code: unknown): boolean {
  return primarySubtag(code) === 'zxx';
}

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
 *  itself when Intl does not know it; "No dialogue" for "zxx", "Multiple
 *  languages" for "mul", "Other language" for "mis", "Unknown" for none. */
export function languageName(code: unknown, locales: readonly string[] = ['en']): string {
  const notOne = NOT_ONE_LANGUAGE.get(primarySubtag(code));
  if (notOne) return notOne;
  const tag = languageTag(code);
  if (!tag) return UNKNOWN_LANGUAGE;
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
 * ("German", "No dialogue" for zxx), the track's title when it says more
 * than that ("English · SDH"), "(forced)" for a forced track; a track tagged
 * with no language by its title, else "Unknown"; and where two tracks would
 * still read the same, a number for the second and later ones ("German (2)").
 */
export function subtitleLabels(tracks: readonly SubtitleTrackInfo[], locales: readonly string[] = ['en']): string[] {
  const labels = tracks.map((t) => {
    const name = languageName(t.lang, locales);
    const title = (t.title ?? '').trim();
    let label = name;
    if (title && title.toLowerCase() !== name.toLowerCase() && !sameLanguageCode(title, t.lang)) {
      if (!hasLanguage(t.lang)) label = title;
      else label = title.toLowerCase().includes(name.toLowerCase()) ? title : `${name} · ${title}`;
    }
    if (t.forced && !/forced/i.test(label)) label += ' (forced)';
    return label;
  });
  return numbered(labels);
}

/** The labels, the second and later of the ones that read the same
 *  numbered ("German (2)"). `key` says which read the same: by default the
 *  label. */
function numbered(labels: readonly string[], key: (label: string, i: number) => string = (l) => l): string[] {
  const seen = new Map<string, number>();
  return labels.map((label, i) => {
    const k = key(label, i);
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    return n === 1 ? label : `${label} (${n})`;
  });
}

/** Whether the code says what the track is in: a language, no dialogue,
 *  several languages or one with no code. */
function hasLanguage(code: unknown): boolean {
  return normalizeLang(code) !== '' || NOT_ONE_LANGUAGE.has(primarySubtag(code));
}

const CODE_LIKE = /^[a-z]{2,3}([-_][a-z0-9]+)*$/i;

/** A title that is only a language code: the track's own again ("eng" on
 *  English), or one that names no language ("und"). */
function sameLanguageCode(title: string, lang: string | undefined): boolean {
  if (!CODE_LIKE.test(title)) return false;
  const named = normalizeLang(title);
  return named === '' || named === normalizeLang(lang);
}

export interface AudioTrackLabelInput {
  /** The language code as the track is tagged. */
  lang?: string;
  /** What the track is called: the file's title, or the master's NAME. */
  name?: string;
  /** What the menu shows beside the label ("AAC · 2ch"). Two tracks that
   *  differ there are told apart there. */
  detail?: string;
}

// A name that describes the source's audio format - a codec, a bitrate, a
// sample rate or depth ("AC3 5.1 @ 640 Kbps", "DTS-HD MA 5.1") - and so
// nothing of the track: the stream is AAC whatever the file had.
const FORMAT_WORDS =
  /(^|[^a-z0-9])(dts(-hd)?|truehd|atmos|dolby|e?-?ac-?3|ddp?\+?|aac|flac|l?pcm|opus|mp3|vorbis|lossless|master audio|\d+ ?k?hz|\d* ?[km]bps|kb\/s|\d+[- ]?bit)(?![a-z0-9])/i;
// A channel layout, which goes from a name that names the track
// ("Commentary 5.1" is "Commentary"): the menu shows the channels beside it.
const LAYOUT_WORDS = /(^|[^a-z0-9.])(mono|stereo|surround|[1-9]\.[0-2]|\d{1,2} ?ch(annels?)?)(?![a-z0-9.])/gi;
// A name that only numbers the track ("Track 2", "Audio Track 1", "2").
const NUMBERED = /^(audio|sound|track|stream|[\s#])*\d*$/i;

/** What a track's name says about it, or '' when it says nothing: none, a
 *  format, a number, a language code. */
function trackName(name: string | undefined, lang: string | undefined): string {
  const raw = (name ?? '').trim();
  if (!raw || FORMAT_WORDS.test(raw)) return '';
  const t = raw
    .replace(LAYOUT_WORDS, '$1')
    .replace(/\(\s*\)|\[\s*\]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—:·,|/]+|[\s\-–—:·,|/]+$/g, '');
  if (!t || NUMBERED.test(t) || sameLanguageCode(t, lang)) return '';
  return t;
}

/** What a track's name adds to its label ("English Commentary" on an
 *  English track: "Commentary"); '' when nothing. */
function nameQualifier(name: string | undefined, label: string, lang: string | undefined): string {
  let t = trackName(name, lang);
  if (t.toLowerCase().startsWith(label.toLowerCase()) && /^([\s\-–—:·,|(\[]|$)/.test(t.slice(label.length))) {
    t = t.slice(label.length).replace(/^[\s\-–—:·,|]+/, '').trim();
    if (/^\(.*\)$/.test(t) || /^\[.*\]$/.test(t)) t = t.slice(1, -1).trim();
  }
  return t && !NUMBERED.test(t) ? t : '';
}

/**
 * The audio menu's labels, one per track, in order: the language the track
 * is tagged with, by name ("German"; "No dialogue" for zxx). A track tagged
 * with none is called what its name says ("Commentary") - not a format ("AC3
 * 5.1 @ 640 Kbps"), a number ("Track 1") or a code - else "Unknown". Two
 * that would read the same, with the same detail, are told apart by their
 * names ("English · Commentary"), else numbered ("English (2)").
 */
export function audioLabels(tracks: readonly AudioTrackLabelInput[], locales: readonly string[] = ['en']): string[] {
  const bases = tracks.map((t) => {
    if (hasLanguage(t.lang)) {
      const name = languageName(t.lang, locales);
      // Intl has no name for the code: the track's own name before the code.
      if (name !== String(t.lang).trim()) return name;
    }
    return trackName(t.name, t.lang) || (hasLanguage(t.lang) ? String(t.lang).trim() : UNKNOWN_LANGUAGE);
  });
  const key = (label: string, i: number) => `${label}\u0000${tracks[i].detail ?? ''}`;
  const count = new Map<string, number>();
  bases.forEach((b, i) => count.set(key(b, i), (count.get(key(b, i)) ?? 0) + 1));
  const labels = bases.map((b, i) => {
    if ((count.get(key(b, i)) ?? 0) < 2) return b;
    const q = nameQualifier(tracks[i].name, b, tracks[i].lang);
    return q && q.toLowerCase() !== b.toLowerCase() ? `${b} · ${q}` : b;
  });
  return numbered(labels, key);
}

/** The audio chip for the track playing: its language's ISO 639-2/T code
 *  ("ENG", "DEU", "JPN"; the code as tagged where the table has none), "MUL"
 *  for several languages and "MIS" for one with no code, "—" for no
 *  dialogue (zxx), "Audio" for a track tagged with no language. Never a name
 *  cut short: Japanese is not "JAP", and Malay, Malayalam and Maltese are
 *  three. */
export function audioChipLabel(code: unknown): string {
  const primary = primarySubtag(code);
  if (primary === 'zxx') return '—';
  if (NOT_ONE_LANGUAGE.has(primary)) return primary.toUpperCase();
  const lang = normalizeLang(code);
  if (!lang) return 'Audio';
  return (lang.length === 2 ? ONE_TO_T[lang] ?? lang : lang).toUpperCase();
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
