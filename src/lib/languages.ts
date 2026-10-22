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

/** The language, script and region of a canonical tag (languageTag) - what a
 *  name says; a variant, an extension or a private use names nothing
 *  ("de-1901" is "de", "en-US-x-custom" "en-US"). */
function namedTag(tag: string): string {
  const [lang, ...rest] = tag.split('-');
  let script = '';
  let region = '';
  for (const sub of rest) {
    if (sub.length === 1) break;
    if (!script && !region && /^[A-Za-z]{4}$/.test(sub)) script = sub;
    else if (!region && /^([A-Za-z]{2}|\d{3})$/.test(sub)) region = sub;
  }
  return [lang, script, region].filter(Boolean).join('-');
}

// One Intl.DisplayNames per locale and form, made once: a menu names many
// tracks.
const DISPLAY_NAMES = new Map<string, Intl.DisplayNames | null>();

function displayNames(locales: readonly string[], form: 'standard' | 'dialect'): Intl.DisplayNames | null {
  const key = `${locales.join(',')}|${form}`;
  if (!DISPLAY_NAMES.has(key)) {
    let names: Intl.DisplayNames | null = null;
    try {
      names = new Intl.DisplayNames([...locales], { type: 'language', languageDisplay: form, fallback: 'none' });
    } catch {
      /* no Intl.DisplayNames, or a locale it refuses */
    }
    DISPLAY_NAMES.set(key, names);
  }
  return DISPLAY_NAMES.get(key) ?? null;
}

/** What Intl calls a tag in the locales, or '' when it has no name for it. */
function intlName(tag: string, locales: readonly string[], form: 'standard' | 'dialect'): string {
  try {
    return displayNames(locales, form)?.of(tag) ?? '';
  } catch {
    return '';
  }
}

// The English names ISO 639 and the phone app's table give where Intl gives
// another: CLDR folds "tl" into "fil" and calls it Filipino.
const ENGLISH_NAMES: Record<string, string> = { tl: 'Tagalog' };

/** The language's name in the given UI locales, with the script and the
 *  region the code names in brackets after it, as the design system's word
 *  list writes them ("ger" → "German", "zh-Hans" → "Chinese (Simplified)",
 *  "pt-BR" → "Portuguese (Brazil)", "zh-Hant-TW" → "Chinese (Traditional,
 *  Taiwan)", "tl" → "Tagalog"); the code itself when Intl does not know it;
 *  "No dialogue" for "zxx", "Multiple languages" for "mul", "Other
 *  language" for "mis", "Unknown" for none. */
export function languageName(code: unknown, locales: readonly string[] = ['en']): string {
  const notOne = NOT_ONE_LANGUAGE.get(primarySubtag(code));
  if (notOne) return notOne;
  const tag = languageTag(code);
  if (!tag) return UNKNOWN_LANGUAGE;
  const name = intlName(namedTag(tag), locales, 'standard');
  const english = ENGLISH_NAMES[normalizeLang(code)];
  if (english && /^en(-|$)/i.test(locales[0] ?? '')) {
    // Its script and region as Intl names them, after the word list's name.
    const intlBase = intlName(normalizeLang(code), locales, 'standard');
    return name && intlBase && name.startsWith(intlBase) ? english + name.slice(intlBase.length) : english;
  }
  if (name) return name;
  return typeof code === 'string' ? code.trim() : tag;
}

/** The script of a canonical tag ("Hans" of "zh-Hans-CN"), or ''. */
export function scriptOf(tag: string): string {
  return tag.split('-').slice(1).find((s) => /^[A-Za-z]{4}$/.test(s)) ?? '';
}

/** The region of a canonical tag ("BR" of "pt-BR", "419"), or ''. */
export function regionOf(tag: string): string {
  return tag.split('-').slice(1).find((s) => /^([A-Za-z]{2}|\d{3})$/.test(s)) ?? '';
}

/** What a subtitle label is told about one track. */
export interface SubtitleLabelInput {
  /** The language code as the track is tagged. */
  lang?: string;
  /** The track's own title, from the file or the catalog, when it has one. */
  title?: string;
  /** Forced: only the lines in another language than the audio's. A title
   *  that says so counts too. */
  forced?: boolean;
  /** For the deaf and hard of hearing, where the player knows it other than
   *  by the title; a title that says so (isSdhSubtitle) counts too. */
  sdh?: boolean;
}

/** What a forced subtitle is, after its language ("English · foreign-language
 *  parts only"): the lines a film shows in another language than its
 *  audio's, not the dialogue. */
export const FORCED_SUBTITLE_KIND = 'foreign-language parts only';

/** What a subtitle for the deaf and hard of hearing is, after its language
 *  ("English · for deaf and hard of hearing"). */
export const SDH_SUBTITLE_KIND = 'for deaf and hard of hearing';

// What a track's own title may say of a forced subtitle. No lookbehind (an
// older Safari cannot parse one): the character before is captured and put
// back.
const FORCED_WORDS =
  /(^|[^A-Za-z])(foreign[ -]language parts( only)?|foreign parts( only)?|forced( narrative| subtitles?| subs)?)(?![A-Za-z])/gi;

// What a track's own title may say of a subtitle for the deaf and hard of
// hearing - the words isSdhSubtitle reads, and the phrases they are part of.
const SDH_PHRASES =
  /(^|[^A-Za-z])((for )?(the )?deaf( and | & | ?\/ ?)hard[ -]of[ -]hearing|(for )?(the )?hard[ -]of[ -]hearing|(for )?(the )?hearing[ -]impaired|closed[ -]captions?|SDH|CC|HoH|deaf)(?![A-Za-z])/gi;

const SDH_WORDS = /(^|[^A-Za-z])(SDH|CC|HoH|closed[ -]captions?|hearing[ -]impaired|hard[ -]of[ -]hearing|deaf)([^A-Za-z]|$)/i;

/** Whether a subtitle's title says it is for the deaf and hard of hearing
 *  ("English SDH", "English (CC)", "for deaf and hard of hearing"). */
export function isSdhSubtitle(title: string | undefined | null): boolean {
  return !!title && SDH_WORDS.test(title);
}

/** Whether a subtitle's title says it is forced ("German (Forced)",
 *  "foreign-language parts only"). */
export function saysForced(title: string | undefined | null): boolean {
  if (!title) return false;
  FORCED_WORDS.lastIndex = 0;
  const found = FORCED_WORDS.test(title);
  FORCED_WORDS.lastIndex = 0;
  return found;
}

// A number a server gave a title to keep it unique in its group ("English
// (2)"); the menu shows what reads the same once.
const TRAILING_NUMBER = /\s*\(\d+\)$/;
const SEPARATOR_RUN = /\s*([·\-–—:,|/])(\s*[·\-–—:,|/])+\s*/g;
const SEPARATOR_AFTER_OPEN = /([(\[])\s*[·\-–—:,|/]+\s*/g;
const SEPARATOR_BEFORE_CLOSE = /\s*[·\-–—:,|/]+\s*([)\]])/g;
const EMPTY_BRACKETS = /\(\s*\)|\[\s*\]/g;
const EDGE_SEPARATORS = /^[\s\-–—:·,|/]+|[\s\-–—:·,|/]+$/g;
// Where a title's parts meet: "Chinese (Simplified) · 中文", "German - Deutsch".
const PART_SEPARATOR = /\s*[·|/–—]\s*|\s+-\s+|\s*:\s+|\s*,\s+/;

/** A track's own title without what it says of the track's kind - forced,
 *  for the deaf and hard of hearing - or a number that only kept it unique:
 *  "English SDH" is "English", "German (Forced)" "German", "SDH" nothing. */
function titleWithoutKind(title: string): string {
  return title
    .replace(TRAILING_NUMBER, '')
    .replace(FORCED_WORDS, '$1 ')
    .replace(SDH_PHRASES, '$1 ')
    .replace(EMPTY_BRACKETS, ' ')
    .replace(SEPARATOR_AFTER_OPEN, '$1')
    .replace(SEPARATOR_BEFORE_CLOSE, '$1')
    .replace(EMPTY_BRACKETS, ' ')
    .replace(SEPARATOR_RUN, ' $1 ')
    .replace(/\s+/g, ' ')
    .replace(EDGE_SEPARATORS, '');
}

// What a language calls itself where Intl does not say it so (the phone
// app's table): a title that is only one of these says nothing the
// language's name does not.
const ENDONYMS: Record<string, readonly string[]> = {
  af: ['afrikaans'], ar: ['العربية', 'عربي'], bg: ['български'], bn: ['বাংলা'], ca: ['català'],
  cs: ['čeština', 'česky'], da: ['dansk'], de: ['deutsch'], el: ['ελληνικά'], en: ['english'],
  es: ['español', 'castellano'], et: ['eesti'], eu: ['euskara'], fa: ['فارسی'], fi: ['suomi'],
  fr: ['français'], ga: ['gaeilge'], gl: ['galego'], he: ['עברית'], hi: ['हिन्दी'], hr: ['hrvatski'],
  hu: ['magyar'], id: ['bahasa indonesia'], is: ['íslenska'], it: ['italiano'], ja: ['日本語'],
  ko: ['한국어'], lt: ['lietuvių'], lv: ['latviešu'], mk: ['македонски'], ms: ['bahasa melayu'],
  nb: ['norsk bokmål', 'norsk'], nl: ['nederlands'], nn: ['norsk nynorsk', 'nynorsk'], no: ['norsk'],
  pl: ['polski'], pt: ['português'], ro: ['română'], ru: ['русский'], sk: ['slovenčina'],
  sl: ['slovenščina'], sq: ['shqip'], sr: ['српски', 'srpski'], sv: ['svenska'], th: ['ไทย'],
  tr: ['türkçe'], uk: ['українська'], vi: ['tiếng việt'],
  zh: ['中文', '汉语', '漢語'],
};

// The words a Chinese track's title gives its script in. They say more than
// "Chinese": the track is named and listed by its script ("Chinese
// (Simplified)"), as a track tagged with it is.
const CHINESE_SCRIPTS: Record<string, string> = {
  简体中文: 'Hans', 簡體中文: 'Hans', 简体: 'Hans', 簡體: 'Hans', 简中: 'Hans', 簡中: 'Hans', chs: 'Hans', simplified: 'Hans',
  繁體中文: 'Hant', 繁体中文: 'Hant', 繁體: 'Hant', 繁体: 'Hant', 繁中: 'Hant', cht: 'Hant', traditional: 'Hant',
};

// The spoken Chinese a title may name: it says something "Chinese" does
// not, in the word list's words ("Chinese · Cantonese").
const CHINESE_VARIETIES: Record<string, string> = {
  粵語: 'Cantonese', 粤语: 'Cantonese', 廣東話: 'Cantonese', 广东话: 'Cantonese',
  國語: 'Mandarin', 国语: 'Mandarin', 普通話: 'Mandarin', 普通话: 'Mandarin',
};

// What a title may call a language's region other than by the region's
// name: "Español Latino" is Spanish (Latin America).
const REGION_WORDS: Record<string, Record<string, string>> = {
  es: { latino: '419', latinoamericano: '419', latam: '419' },
  fr: { canadien: 'CA', québécois: 'CA', québec: 'CA' },
  pt: { brasileiro: 'BR', europeu: 'PT' },
};

// The regions a title may name, for Intl to name: the phone app's table's,
// and the rest of Latin America.
const REGION_CODES = [
  'US', 'GB', 'AU', 'CA', 'NZ', 'IE', 'IN', 'ZA', 'SG', 'PH', 'MY', 'NG', 'KE', 'BR', 'PT', 'AO', 'MZ',
  'ES', 'MX', 'AR', 'CO', 'CL', 'PE', 'VE', 'UY', 'CU', 'BO', 'EC', 'PY', 'DO', 'GT', 'HN', 'NI', 'PA',
  'SV', 'CR', 'PR', '419', 'FR', 'BE', 'CH', 'LU', 'MC', 'DE', 'AT', 'LI', 'NL', 'SR', 'IT', 'SM',
  'CN', 'TW', 'HK', 'MO', 'JP', 'KR', 'KP', 'MN', 'RU', 'UA', 'BY', 'KZ', 'UZ', 'SE', 'FI', 'NO', 'DK',
  'IS', 'EE', 'LV', 'LT', 'PL', 'CZ', 'SK', 'HU', 'RO', 'MD', 'BG', 'RS', 'ME', 'BA', 'HR', 'SI', 'MK',
  'AL', 'XK', 'GR', 'CY', 'TR', 'GE', 'AM', 'AZ', 'IL', 'SA', 'EG', 'AE', 'MA', 'DZ', 'TN', 'LB', 'JO',
  'IQ', 'SY', 'KW', 'QA', 'BH', 'OM', 'YE', 'LY', 'SD', 'IR', 'AF', 'PK', 'BD', 'LK', 'NP', 'TH', 'VN',
  'ID', 'KH', 'LA', 'MM', '150',
];

/** Lower-cased, without its accents: "Latinoamérica" is "latinoamerica". */
function folded(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase().trim();
}

const REGION_NAMES_IN = new Map<string, Map<string, string>>();

/** The regions by their names in one locale, long and short, folded. */
function regionNamesIn(locale: string): Map<string, string> {
  const cached = REGION_NAMES_IN.get(locale);
  if (cached) return cached;
  const regions = new Map<string, string>();
  for (const style of ['long', 'short'] as const) {
    let names: Intl.DisplayNames | null = null;
    try {
      names = new Intl.DisplayNames([locale], { type: 'region', style, fallback: 'none' });
    } catch {
      /* no Intl.DisplayNames, or a locale it refuses */
    }
    for (const code of names ? REGION_CODES : []) {
      let name: string | undefined;
      try {
        name = names?.of(code);
      } catch {
        /* a code it refuses */
      }
      if (name && !regions.has(folded(name))) regions.set(folded(name), code);
    }
  }
  REGION_NAMES_IN.set(locale, regions);
  return regions;
}

const REGIONS = new Map<string, Map<string, string>>();

/** The regions a title may name for the language `base` (normalizeLang), by
 *  their names in the language itself and in English, folded: "españa" →
 *  "ES", "latinoamerica" → "419", "brasil" → "BR". Made once per language,
 *  when a title asks. */
function regionsOf(base: string): Map<string, string> {
  const cached = REGIONS.get(base);
  if (cached) return cached;
  const regions = new Map<string, string>();
  for (const locale of base === 'zh' ? ['zh-Hans', 'zh-Hant', 'en'] : [base, 'en']) {
    for (const [name, code] of regionNamesIn(locale)) if (!regions.has(name)) regions.set(name, code);
  }
  for (const [word, code] of Object.entries(REGION_WORDS[base] ?? {})) regions.set(folded(word), code);
  REGIONS.set(base, regions);
  return regions;
}

// The locales a language's name is looked up in: the languages a library
// is likely to carry, each naming every other.
const NAME_LOCALES = [...new Set([...Object.values(T_TO_1), 'fil', 'zh-Hans', 'zh-Hant'])];

const LANGUAGE_NAMES = new Map<string, Set<string>>();

/** Every name of the code's language - in English, in itself, in the other
 *  languages a library carries, with and without its script and region -
 *  lower-cased: "Deutsch", "Allemand" and "German" for "ger"; "中文" and
 *  "简体中文" for "zh-Hans". */
function languageNames(code: unknown): Set<string> {
  const tag = namedTag(languageTag(code));
  const cached = LANGUAGE_NAMES.get(tag);
  if (cached) return cached;
  const names = new Set<string>();
  const base = normalizeLang(code);
  if (base) {
    const tags = [...new Set([tag, base])];
    for (const locale of [...new Set([...tags, ...NAME_LOCALES])]) {
      for (const t of tags) {
        for (const form of ['standard', 'dialect'] as const) {
          const name = intlName(t, [locale], form);
          if (name) names.add(name.toLocaleLowerCase());
        }
      }
    }
    for (const t of tags) names.add(languageName(t).toLowerCase());
    for (const own of ENDONYMS[base] ?? []) names.add(own);
  }
  LANGUAGE_NAMES.set(tag, names);
  return names;
}

/** Whether a title only names the track's language again, in any language
 *  ("Deutsch", "中文", "English", "eng" on a German, Chinese, English
 *  track), or names no language as a code ("und"). */
function namesLanguage(title: string, lang: string | undefined): boolean {
  const t = title.trim();
  if (!t) return false;
  return sameLanguageCode(t, lang) || languageNames(lang).has(t.toLocaleLowerCase());
}

// A bracket in a title: round, square, or the full-width round ones of a
// Chinese or Japanese title.
const BRACKETED = /\(([^()]*)\)|\[([^\[\]]*)\]|（([^（）]*)）/g;
const MASKED_BRACKET = /\u0001(\d+)\u0002/g;

/** What a piece of a title says of the track's language. */
type Says = { language: true } | { script: string } | { region: string } | { words: string };

/** What a piece of a title - a part, a bracket, words of one - says of the
 *  track's language: that it is the language ("Deutsch", "中文"), its script
 *  ("简体"), its region ("Latinoamérica"), a Chinese variety in the word
 *  list's words ("粵語": "Cantonese"); null for none of these. Words inside a
 *  longer piece name the language by a name, never by a code: "und" is a
 *  German word. */
function pieceSays(text: string, code: string | undefined, whole: boolean): Says | null {
  const t = text.trim();
  if (!t) return null;
  const lower = t.toLocaleLowerCase();
  if (whole ? namesLanguage(t, code) : languageNames(code).has(lower)) return { language: true };
  const base = normalizeLang(code);
  if (base === 'zh') {
    const script = CHINESE_SCRIPTS[lower];
    if (script) return { script };
    const words = CHINESE_VARIETIES[t];
    if (words) return { words };
  }
  const region = base ? regionsOf(base).get(folded(t)) : undefined;
  return region ? { region } : null;
}

/**
 * A title read for the track tagged `code`: the title without what only
 * names the language again, and the script and the region it names that
 * the tag agrees with. A part, or a bracket, that is the language's name,
 * script or region goes whole ("Chinese (Simplified) · 中文", "Español
 * (Latinoamérica)"); inside one with other words only the language's names
 * go ("Deutsch Kommentar" is "Kommentar") - not the label's own name, which
 * says it once ("English Commentary") - and a region stays a word. Nothing
 * read, the title as it was.
 */
function readParts(title: string, code: string | undefined): { title: string; script: string; region: string } {
  const tag = namedTag(languageTag(code));
  const own = { script: scriptOf(tag), region: regionOf(tag) };
  const found = { script: '', region: '' };
  const display = languageName(code).toLocaleLowerCase();
  let changed = false;
  const agrees = (kind: 'script' | 'region', value: string) =>
    (!own[kind] || own[kind] === value) && (!found[kind] || found[kind] === value);
  // What is left of a piece; null for nothing.
  const readPiece = (text: string): string | null => {
    const t = text.trim();
    if (!t) return null;
    const whole = pieceSays(t, code, true);
    if (whole) {
      if ('language' in whole) {
        changed = true;
        return null;
      }
      if ('script' in whole && agrees('script', whole.script)) {
        found.script = whole.script;
        changed = true;
        return null;
      }
      if ('region' in whole && agrees('region', whole.region)) {
        found.region = whole.region;
        changed = true;
        return null;
      }
      if ('words' in whole) {
        changed = true;
        return whole.words;
      }
    }
    const words = t.split(/\s+/);
    if (words.length < 2) return t;
    // The longest run of words from each place on that says something.
    const runs: { text: string; says: Says | null }[] = [];
    for (let i = 0; i < words.length; ) {
      let says: Says | null = null;
      let j = words.length;
      for (; j > i; j--) {
        says = pieceSays(words.slice(i, j).join(' '), code, false);
        if (says) break;
      }
      if (says) {
        runs.push({ text: words.slice(i, j).join(' '), says });
        i = j;
      } else {
        runs.push({ text: words[i], says: null });
        i++;
      }
    }
    const plain = runs.some((r) => r.says === null);
    const kept: string[] = [];
    for (const { text: run, says } of runs) {
      if (!says) kept.push(run);
      else if ('language' in says) {
        if (plain && run.toLocaleLowerCase() === display) kept.push(run);
        else changed = true;
      } else if ('script' in says && agrees('script', says.script)) {
        found.script = says.script;
        changed = true;
      } else if ('region' in says && !plain && agrees('region', says.region)) {
        found.region = says.region;
        changed = true;
      } else if ('words' in says) {
        kept.push(says.words);
        changed = true;
      } else kept.push(run);
    }
    return kept.length ? kept.join(' ') : null;
  };
  // The title's parts, split where they meet outside a bracket.
  const brackets: string[] = [];
  const masked = title.replace(BRACKETED, (_, a?: string, b?: string, c?: string) => {
    brackets.push(a ?? b ?? c ?? '');
    return `\u0001${brackets.length - 1}\u0002`;
  });
  const kept: string[] = [];
  for (const part of masked.split(PART_SEPARATOR)) {
    const inner: string[] = [];
    const main = part.replace(MASKED_BRACKET, (_, i: string) => {
      inner.push(brackets[Number(i)]);
      return ' ';
    });
    const pieces = [readPiece(main.replace(/\s+/g, ' ')), ...inner.map(readPiece)].filter((p): p is string => p !== null);
    if (pieces.length) kept.push([pieces[0], ...pieces.slice(1).map((p) => `(${p})`)].join(' '));
  }
  return { title: changed ? kept.join(' · ') : title, ...found };
}

/** A track's language as its tag and its own title say it - the tag, with
 *  the script and the region the title names where the tag names none
 *  ("chi" titled "繁體中文" is "zh-Hant", "spa" titled "Español
 *  (Latinoamérica)" "es-419") - and the title without what only names that
 *  language again. A track in no language is read as it is. */
function readTitle(title: string, code: string | undefined): { code: string | undefined; title: string } {
  const base = normalizeLang(code);
  if (!base || !title) return { code, title };
  const first = readParts(title, code);
  const tag = namedTag(languageTag(code));
  const script = scriptOf(tag) || first.script;
  const region = regionOf(tag) || first.region;
  if (script === scriptOf(tag) && region === regionOf(tag)) return { code, title: first.title };
  const refined = [base, script, region].filter(Boolean).join('-');
  return { code: refined, title: readParts(title, refined).title };
}

/** The language a subtitle is in, as a BCP 47 tag: its code's, with the
 *  script and the region its own title names where the code names none
 *  ("chi" titled "繁體中文" is "zh-Hant"), as subtitleLabel names it; ''
 *  for none. What the menu lists the track by. */
export function subtitleLanguage(track: { lang?: string; title?: string }): string {
  return languageTag(readTitle(titleWithoutKind((track.title ?? '').trim()), track.lang).code);
}

/**
 * One subtitle's label: the language's name, its script or region in it
 * ("German", "Chinese (Simplified)", "No dialogue" for zxx) - a script or a
 * region the track's own title gives, where its tag names none, too
 * ("Chinese (Traditional)" for "繁體中文", "Spanish (Latin America)" for
 * "Español (Latinoamérica)"); the track's own title where it says more than
 * that ("English · Commentary", "German · AI", "Chinese · Cantonese") - not
 * the words of it that only name the language again, in any language
 * ("Deutsch", "中文") - or alone for a track tagged with no language, else
 * "Unknown"; then its kind in words - "foreign-language parts only" for a
 * forced one, "for deaf and hard of hearing" for one with sound described,
 * both in that order. A title that says the kind itself ("English SDH",
 * "[CC]", "German (forced)") says it once, in these words. The phone app's
 * subtitleLabel: the same track has the same name there.
 */
export function subtitleLabel(track: SubtitleLabelInput): string {
  const raw = (track.title ?? '').trim();
  const forced = !!track.forced || saysForced(raw);
  const sdh = !!track.sdh || isSdhSubtitle(raw);
  const { code: lang, title } = readTitle(titleWithoutKind(raw), track.lang);
  const name = languageName(lang);
  const lower = title.toLowerCase();
  let label: string;
  if (!title || lower === name.toLowerCase() || namesLanguage(title, lang)) label = name;
  else if (!hasLanguage(lang)) label = title;
  else if (lower.includes(name.toLowerCase())) label = title;
  // "English" on a British English track: the name says it already.
  else if (name.toLowerCase().includes(lower)) label = name;
  else label = `${name} · ${title}`;
  const kinds = [forced ? FORCED_SUBTITLE_KIND : '', sdh ? SDH_SUBTITLE_KIND : ''].filter(Boolean);
  return [label, ...kinds].join(' · ');
}

/** The subtitle labels, one per track, in order (subtitleLabel). Two that
 *  read the same are never numbered ("German (2)"): the menu shows them once
 *  (subtitles.ts subtitleMenu). */
export function subtitleLabels(tracks: readonly SubtitleLabelInput[]): string[] {
  return tracks.map(subtitleLabel);
}

/** The labels, the second and later of the ones that read the same
 *  numbered ("English (2)"): the audio menu's, where nothing else tells two
 *  tracks apart (subtitles that read the same show once instead). `key`
 *  says which read the same: by default the label. */
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
  /**
   * The channels the track plays in, for a rendition of the master the
   * player is served: the 5.1 companion /play/info lists beside its stereo
   * twin for a client that decodes E-AC-3 has 6. More than two say their
   * layout after the language ("English 5.1"). Not for a source's track:
   * on the fly a 5.1 source plays as stereo AAC, whatever the file has.
   */
  channels?: number;
}

// The layout ffmpeg gives a number of channels by default, as a menu names it.
const LAYOUTS: Record<number, string> = { 3: '2.1', 4: '4.0', 5: '5.0', 6: '5.1', 7: '6.1', 8: '7.1' };

/** The layout of a rendition in that many channels: "5.1" for six, "7.1"
 *  for eight; '' for stereo, mono or none. */
export function channelLayout(channels: number | null | undefined): string {
  if (typeof channels !== 'number' || !Number.isInteger(channels) || channels <= 2) return '';
  return LAYOUTS[channels] ?? `${channels}ch`;
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
 * 5.1 @ 640 Kbps"), a number ("Track 1") or a code - else "Unknown". A
 * rendition served in more than two channels says its layout after that:
 * "English 5.1", beside its stereo twin "English". Two that would read the
 * same, with the same detail, are told apart by their names ("English ·
 * Commentary"), else numbered ("English (2)").
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
  const withLayout = (label: string, i: number) => {
    const layout = channelLayout(tracks[i].channels);
    return layout ? `${label} ${layout}` : label;
  };
  const key = (label: string, i: number) => `${label}\u0000${tracks[i].detail ?? ''}`;
  const plain = bases.map(withLayout);
  const count = new Map<string, number>();
  plain.forEach((l, i) => count.set(key(l, i), (count.get(key(l, i)) ?? 0) + 1));
  const labels = plain.map((l, i) => {
    if ((count.get(key(l, i)) ?? 0) < 2) return l;
    // Told apart by what the name says besides the language - and besides
    // the layout, which a name like "English 5.1 (2)" carries too.
    const b = bases[i];
    const q = nameQualifier(tracks[i].name, b, tracks[i].lang);
    return q && q.toLowerCase() !== b.toLowerCase() ? withLayout(`${b} · ${q}`, i) : l;
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
}

/**
 * The language subtitles come on in by themselves, or null for off - the
 * default. They come on, in the subtitle language chosen in Settings, when
 * the audio playing is in another language (docs/chino, subtitles: what
 * switches on by itself). The rule compares with the audio that plays,
 * never with the audio language the viewer prefers. Never with subtitles
 * set Off, and never when the audio's language is not known.
 */
export function defaultSubtitleLang({ audioLang, subtitlePref }: SubtitleDefaults): string | null {
  if (!subtitlePref || subtitlePref.trim().toLowerCase() === 'off') return null;
  const want = normalizeLang(subtitlePref);
  const audio = normalizeLang(audioLang);
  if (!want || !audio || audio === want) return null;
  return want;
}

/** The track to switch on by default, or null: one in the language
 *  defaultSubtitleLang names, a full one rather than a forced one - the
 *  forced one where it is the only one in that language. */
export function defaultSubtitleTrack<T extends { id: string; lang?: string; forced?: boolean }>(
  tracks: readonly T[],
  defaults: SubtitleDefaults,
): string | null {
  const want = defaultSubtitleLang(defaults);
  if (!want) return null;
  const inLang = tracks.filter((t) => normalizeLang(t.lang) === want);
  return (inLang.find((t) => !t.forced) ?? inLang[0])?.id ?? null;
}

// Subtitle formats drawn as pictures: PGS, and the bitmap kinds the player
// lists none of. A track that gives no format is text.
const IMAGE_SUBTITLE_FORMATS = new Set([
  'pgs', 'hdmv_pgs_subtitle', 'pgssub', 'vobsub', 'dvdsub', 'dvd_subtitle', 'dvb', 'dvbsub', 'dvb_subtitle', 'xsub',
]);

/** Whether a subtitle format (a sidecar's format, an embedded stream's
 *  codec) is pictures, not text: PGS and the other bitmap formats. None
 *  given is text. */
export function isPictureSubtitle(format: string | undefined | null): boolean {
  return IMAGE_SUBTITLE_FORMATS.has((format ?? '').trim().toLowerCase());
}

function isTextSubtitle(t: { format?: string }): boolean {
  return !isPictureSubtitle(t.format);
}

/** The forced track in the language of the audio playing, or null - the
 *  one a film carries for what is said or written in another language
 *  than its audio (a sign, a letter, a call abroad) - a text one before a
 *  picture one (PGS). None when the audio's language is not known. */
export function forcedSubtitleTrack<T extends { id: string; lang?: string; forced?: boolean; format?: string }>(
  tracks: readonly T[],
  audioLang: string | null | undefined,
): string | null {
  const audio = normalizeLang(audioLang);
  if (!audio) return null;
  const forced = tracks.filter((t) => t.forced && normalizeLang(t.lang) === audio);
  return (forced.find(isTextSubtitle) ?? forced[0])?.id ?? null;
}

export interface AutoSubtitles extends SubtitleDefaults {
  /** The viewer chose Off in the player: nothing comes on by itself for the
   *  rest of the session. */
  off?: boolean;
}

/**
 * The subtitle that comes on by itself, or null: the one defaultSubtitleTrack
 * picks - a full track in the Settings language, for audio playing in
 * another language - else, where none would come on (the audio is in that
 * language, or subtitles are off in Settings), the forced track in the
 * audio's language, which is part of the film rather than subtitles to read
 * along. Asked again whenever the audio's language changes. Nothing after
 * the viewer's Off in the player.
 */
export function autoSubtitleTrack<T extends { id: string; lang?: string; forced?: boolean; format?: string }>(
  tracks: readonly T[],
  state: AutoSubtitles,
): string | null {
  if (state.off) return null;
  return defaultSubtitleTrack(tracks, state) ?? forcedSubtitleTrack(tracks, state.audioLang);
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
