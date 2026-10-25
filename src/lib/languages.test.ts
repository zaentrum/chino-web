// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  autoSubtitleTrack,
  defaultSubtitleLang,
  defaultSubtitleTrack,
  forcedSubtitleTrack,
  isPictureSubtitle,
  isSdhSubtitle,
  languageName,
  languageTag,
  normalizeLang,
  saysForced,
  subtitleLabel,
  subtitleLabels,
  subtitleLanguage,
  audioChipLabel,
  audioLabels,
  audioRenditionFor,
  audioDetail,
  channelLayout,
  channelWords,
} from './languages.ts';

test('codes in every spelling the library uses are one language', () => {
  for (const [codes, lang] of [
    [['ger', 'deu', 'de', 'DE', 'de-CH', 'de_AT'], 'de'],
    [['fre', 'fra', 'fr'], 'fr'],
    [['dut', 'nld', 'nl'], 'nl'],
    [['eng', 'en', 'en-US'], 'en'],
    [['chi', 'zho', 'zh', 'zh-Hant'], 'zh'],
    [['cze', 'ces', 'cs'], 'cs'],
    [['gre', 'ell', 'el'], 'el'],
    [['rum', 'ron', 'ro'], 'ro'],
    [['spa', 'es'], 'es'],
    [['iw', 'heb', 'he'], 'he'],
  ] as const) {
    for (const code of codes) assert.equal(normalizeLang(code), lang, code);
  }
  // A three-letter code with no two-letter one stays as it is.
  assert.equal(normalizeLang('fil'), 'fil');
  assert.equal(normalizeLang('yue'), 'yue');
});

test('no language: undetermined, none, empty, not a code', () => {
  for (const code of ['und', 'zxx', 'mul', 'mis', '', '  ', 'english', 'e', '12', undefined, null, 7]) {
    assert.equal(normalizeLang(code), '', String(code));
  }
});

test('a tag keeps its region or script, canonically cased', () => {
  assert.equal(languageTag('pt_br'), 'pt-BR');
  assert.equal(languageTag('ger'), 'de');
  assert.equal(languageTag('zh-hant'), 'zh-Hant');
  assert.equal(languageTag('und'), '');
});

test('names by Intl.DisplayNames, in the UI language', () => {
  assert.equal(languageName('ger'), 'German');
  assert.equal(languageName('fre'), 'French');
  assert.equal(languageName('dut'), 'Dutch');
  assert.equal(languageName('vie'), 'Vietnamese');
  assert.equal(languageName('pt-BR'), 'Portuguese (Brazil)');
  assert.equal(languageName('ger', ['de']), 'Deutsch');
  assert.equal(languageName('und'), 'Unknown');
  assert.equal(languageName(undefined), 'Unknown');
  // A code Intl has no name for is shown as it came.
  assert.equal(languageName('qaa'), 'qaa');
  // "tl" is Tagalog, as ISO 639 and the phone app's table call it (Intl
  // says Filipino); "fil" is Filipino.
  assert.equal(languageName('tl'), 'Tagalog');
  assert.equal(languageName('tgl'), 'Tagalog');
  assert.equal(languageName('tl-PH'), 'Tagalog (Philippines)');
  assert.equal(languageName('fil'), 'Filipino');
  assert.equal(subtitleLabel({ lang: 'tgl', title: 'Tagalog' }), 'Tagalog');
});

test('a script or a region stays in the name, in brackets after the language, as the word list writes it', () => {
  assert.equal(languageName('zh-Hans'), 'Chinese (Simplified)');
  assert.equal(languageName('zh-hant'), 'Chinese (Traditional)');
  assert.equal(languageName('zh-Hant-TW'), 'Chinese (Traditional, Taiwan)');
  assert.equal(languageName('pt_br'), 'Portuguese (Brazil)');
  assert.equal(languageName('spa-419'), 'Spanish (Latin America)');
  assert.equal(languageName('en-NZ'), 'English (New Zealand)');
  assert.equal(languageName('sr-Latn-RS'), 'Serbian (Latin, Serbia)');
  // Never the dialect's own name: Intl.DisplayNames in its standard form,
  // not its default.
  assert.notEqual(languageName('pt-BR'), 'Brazilian Portuguese');
  assert.notEqual(languageName('es-419'), 'Latin American Spanish');
  for (const [code, name] of [
    ['en-GU', 'English (Guam)'],
    ['en-GB', 'English (United Kingdom)'],
    ['en-US', 'English (United States)'],
    ['pt-PT', 'Portuguese (Portugal)'],
    ['fr-CA', 'French (Canada)'],
    ['nl-BE', 'Dutch (Belgium)'],
    ['de-CH', 'German (Switzerland)'],
    ['es-ES', 'Spanish (Spain)'],
  ]) {
    assert.equal(languageName(code), name, code);
  }
  assert.deepEqual(audioLabels([{ lang: 'pt-BR' }, { lang: 'en-GB' }, { lang: 'nl-BE' }]), [
    'Portuguese (Brazil)',
    'English (United Kingdom)',
    'Dutch (Belgium)',
  ]);
  // A variant or an extension names nothing.
  assert.equal(languageName('de-1901'), 'German');
  assert.equal(languageName('en-US-x-custom'), 'English (United States)');
});

test('zxx, no linguistic content, is a film without dialogue', () => {
  for (const code of ['zxx', 'ZXX', ' zxx ', 'zxx-Latn']) assert.equal(languageName(code), 'No dialogue', code);
  // Still no language to follow: no subtitles come on for it.
  assert.equal(normalizeLang('zxx'), '');
  assert.equal(defaultSubtitleLang({ audioLang: 'zxx', subtitlePref: 'eng' }), null);
});

test('the menu of the demo\'s Sintel: every track named, none blank', () => {
  const sidecars = ['ger', 'dut', 'eng', 'fre', 'ita', 'spa', 'pol', 'por', 'rus', 'vie'].map((lang) => ({ lang }));
  assert.deepEqual(subtitleLabels(sidecars), [
    'German', 'Dutch', 'English', 'French', 'Italian', 'Spanish', 'Polish', 'Portuguese', 'Russian', 'Vietnamese',
  ]);
});

test('the kind in words after the language, forced first', () => {
  assert.deepEqual(
    subtitleLabels([
      { lang: 'eng', sdh: true },
      { lang: 'eng', forced: true },
      { lang: 'eng', forced: true, sdh: true },
      { lang: 'zh-Hans', forced: true },
    ]),
    [
      'English · for deaf and hard of hearing',
      'English · foreign-language parts only',
      'English · foreign-language parts only · for deaf and hard of hearing',
      'Chinese (Simplified) · foreign-language parts only',
    ],
  );
});

test('both tracks of a language, each with its kind', () => {
  assert.deepEqual(
    subtitleLabels([
      { lang: 'eng', title: 'English' },
      { lang: 'eng', title: 'English SDH' },
      { lang: 'ger' },
      { lang: 'ger', title: 'German (forced)', forced: true },
    ]),
    ['English', 'English · for deaf and hard of hearing', 'German', 'German · foreign-language parts only'],
  );
});

test('a label that says the kind itself says it once, in these words', () => {
  const sdh = 'English · for deaf and hard of hearing';
  const forced = 'English · foreign-language parts only';
  const both = 'English · foreign-language parts only · for deaf and hard of hearing';
  const cases: [string, string][] = [
    ['English SDH', sdh],
    ['SDH', sdh],
    ['English [CC]', sdh],
    ['[CC]', sdh],
    ['English (Closed Captions)', sdh],
    ['English - Hearing Impaired', sdh],
    ['English (for the deaf and hard of hearing)', sdh],
    // A packager's NAME, and this rule's own words again.
    ['English · SDH', sdh],
    [sdh, sdh],
    ['English (Forced)', forced],
    ['Forced', forced],
    ['English Forced Narrative', forced],
    [forced, forced],
    ['English · SDH (forced)', both],
    ['Forced, SDH', both],
    [both, both],
  ];
  for (const [title, label] of cases) assert.equal(subtitleLabel({ lang: 'eng', title }), label, title);
  // A title that says nothing of a kind is no kind.
  assert.equal(subtitleLabel({ lang: 'eng', title: 'English' }), 'English');
  assert.equal(isSdhSubtitle('English [CC]'), true);
  assert.equal(isSdhSubtitle('Commentary'), false);
  assert.equal(saysForced('German (Forced)'), true);
  assert.equal(saysForced('Reinforced'), false);
});

test('words that only name the language again go, in any language; words that add something stay', () => {
  // The word list's name, never "German · Deutsch".
  assert.equal(subtitleLabel({ lang: 'de', title: 'Deutsch' }), 'German');
  assert.equal(subtitleLabel({ lang: 'de', title: 'German · Deutsch' }), 'German');
  assert.equal(subtitleLabel({ lang: 'zh-hans', title: '中文' }), 'Chinese (Simplified)');
  assert.equal(subtitleLabel({ lang: 'zh-Hans', title: 'Chinese (Simplified) · 中文' }), 'Chinese (Simplified)');
  assert.equal(subtitleLabel({ lang: 'zh-Hant', title: '繁體中文' }), 'Chinese (Traditional)');
  assert.equal(subtitleLabel({ lang: 'pt-br', title: 'Português' }), 'Portuguese (Brazil)');
  assert.equal(subtitleLabel({ lang: 'spa', title: 'Español' }), 'Spanish');
  assert.equal(subtitleLabel({ lang: 'ja', title: '日本語' }), 'Japanese');
  // Named in a third language: still only the language.
  assert.equal(subtitleLabel({ lang: 'ger', title: 'Allemand' }), 'German');
  assert.equal(subtitleLabel({ lang: 'de', title: 'Deutsch (Forced)' }), 'German · foreign-language parts only');
  assert.equal(subtitleLabel({ lang: 'de', title: 'Deutsch · Kommentar' }), 'German · Kommentar');
  // Another language's own name is something else.
  assert.equal(subtitleLabel({ lang: 'de', title: 'Español' }), 'German · Español');
  // Inside a part with other words, only the language's name goes - not
  // the label's own name, which says it once - and a word that is a code
  // elsewhere is a word ("und" is German for "and").
  assert.equal(subtitleLabel({ lang: 'de', title: 'Deutsch Kommentar' }), 'German · Kommentar');
  assert.equal(subtitleLabel({ lang: 'de', title: 'Kommentar und Analyse' }), 'German · Kommentar und Analyse');
  assert.equal(subtitleLabel({ lang: 'eng', title: 'English Commentary' }), 'English Commentary');
});

test('a Chinese track\'s title that gives its script names it by its script', () => {
  for (const title of ['简体中文', '簡體中文', '简体', 'CHS', 'Simplified', 'Chinese (Simplified)', 'Simplified Chinese']) {
    assert.equal(subtitleLabel({ lang: 'chi', title }), 'Chinese (Simplified)', title);
    assert.equal(subtitleLanguage({ lang: 'chi', title }), 'zh-Hans', title);
  }
  for (const title of ['繁體中文', '繁体中文', '繁體', 'CHT', 'Traditional']) {
    assert.equal(subtitleLabel({ lang: 'chi', title }), 'Chinese (Traditional)', title);
    assert.equal(subtitleLanguage({ lang: 'zho', title }), 'zh-Hant', title);
  }
  // Its region in brackets, the full-width ones too.
  assert.equal(subtitleLabel({ lang: 'chi', title: '繁體中文（台灣）' }), 'Chinese (Traditional, Taiwan)');
  // A tag that names the other script: the title's word stays, it says something.
  assert.equal(subtitleLabel({ lang: 'zh-Hans', title: '繁體中文' }), 'Chinese (Simplified) · 繁體中文');
  // Mandarin and Cantonese in the word list's words.
  assert.equal(subtitleLabel({ lang: 'chi', title: '國語' }), 'Chinese · Mandarin');
  assert.equal(subtitleLabel({ lang: 'chi', title: '普通话' }), 'Chinese · Mandarin');
  assert.equal(subtitleLabel({ lang: 'chi', title: '粵語' }), 'Chinese · Cantonese');
  assert.equal(subtitleLabel({ lang: 'chi', title: '中文' }), 'Chinese');
  assert.equal(subtitleLanguage({ lang: 'chi', title: '中文' }), 'zh');
});

test('a language\'s own name before a region: the region in brackets after the language', () => {
  const cases: [string, string, string, string][] = [
    ['spa', 'Español (Latinoamérica)', 'Spanish (Latin America)', 'es-419'],
    ['spa', 'Español (España)', 'Spanish (Spain)', 'es-ES'],
    ['spa', 'Español Latino', 'Spanish (Latin America)', 'es-419'],
    ['spa', 'Latinoamerica', 'Spanish (Latin America)', 'es-419'],
    ['fre', 'Français (Canada)', 'French (Canada)', 'fr-CA'],
    ['fre', 'Français canadien', 'French (Canada)', 'fr-CA'],
    ['pt', 'Português (Brasil)', 'Portuguese (Brazil)', 'pt-BR'],
    ['por', 'Português - Brasil', 'Portuguese (Brazil)', 'pt-BR'],
    ['spa', 'Spanish (Latin America)', 'Spanish (Latin America)', 'es-419'],
    // The tag's region again says nothing more.
    ['es-419', 'Español (Latinoamérica)', 'Spanish (Latin America)', 'es-419'],
    // A title in the dialect form names the region: said in the standard
    // form, the language and its region in brackets.
    ['por', 'Brazilian Portuguese', 'Portuguese (Brazil)', 'pt-BR'],
    ['por', 'European Portuguese', 'Portuguese (Portugal)', 'pt-PT'],
    ['spa', 'Latin American Spanish', 'Spanish (Latin America)', 'es-419'],
    ['fre', 'Canadian French', 'French (Canada)', 'fr-CA'],
    ['eng', 'British English', 'English (United Kingdom)', 'en-GB'],
    ['dut', 'Flemish', 'Dutch (Belgium)', 'nl-BE'],
    ['pt-BR', 'Brazilian Portuguese', 'Portuguese (Brazil)', 'pt-BR'],
    // The dialect's adjective in brackets after the language, or alone.
    ['por', 'Portuguese (Brazilian)', 'Portuguese (Brazil)', 'pt-BR'],
    ['por', 'Portuguese (European)', 'Portuguese (Portugal)', 'pt-PT'],
    ['spa', 'Spanish (Latin American)', 'Spanish (Latin America)', 'es-419'],
    ['spa', 'Spanish (Mexican)', 'Spanish (Mexico)', 'es-MX'],
    ['fre', 'French (Canadian)', 'French (Canada)', 'fr-CA'],
    ['eng', 'English (British)', 'English (United Kingdom)', 'en-GB'],
    ['eng', 'English [American]', 'English (United States)', 'en-US'],
    ['ger', 'German (Austrian)', 'German (Austria)', 'de-AT'],
    ['por', 'Brazilian', 'Portuguese (Brazil)', 'pt-BR'],
    ['por', 'Portuguese - Brazilian', 'Portuguese (Brazil)', 'pt-BR'],
    ['spa', 'Spanish (Latin American) (Forced)', 'Spanish (Latin America) · foreign-language parts only', 'es-419'],
  ];
  for (const [lang, title, label, tag] of cases) {
    assert.equal(subtitleLabel({ lang, title }), label, title);
    assert.equal(subtitleLanguage({ lang, title }), tag, title);
  }
  // Another region than the tag's stays a word.
  assert.equal(subtitleLabel({ lang: 'es-ES', title: 'Latinoamérica' }), 'Spanish (Spain) · Latinoamérica');
  assert.equal(subtitleLabel({ lang: 'es-ES', title: 'Latin American Spanish' }), 'Spanish (Spain) · Latin American Spanish');
  assert.equal(subtitleLabel({ lang: 'pt-PT', title: 'Portuguese (Brazilian)' }), 'Portuguese (Portugal) · Brazilian');
  // A region among other words is a word, its adjective too.
  assert.equal(subtitleLabel({ lang: 'fre', title: 'Canada Commentaire' }), 'French · Canada Commentaire');
  assert.equal(subtitleLabel({ lang: 'por', title: 'Brazilian Commentary' }), 'Portuguese · Brazilian Commentary');
  // With the kind: once, after.
  assert.equal(subtitleLabel({ lang: 'spa', title: 'Español (Latinoamérica) (Forced)' }), 'Spanish (Latin America) · foreign-language parts only');
});

test('a title that is a code of the track\'s language: its region or script stays, in the word list\'s form', () => {
  const cases: [string, string, string, string][] = [
    ['por', 'PT-BR', 'Portuguese (Brazil)', 'pt-BR'],
    ['por', 'PT-PT', 'Portuguese (Portugal)', 'pt-PT'],
    ['por', 'pt_BR', 'Portuguese (Brazil)', 'pt-BR'],
    ['chi', 'zh-Hant', 'Chinese (Traditional)', 'zh-Hant'],
    ['chi', 'zh-Hans', 'Chinese (Simplified)', 'zh-Hans'],
    ['chi', 'zh-Hant-TW', 'Chinese (Traditional, Taiwan)', 'zh-Hant-TW'],
    ['spa', 'es-419', 'Spanish (Latin America)', 'es-419'],
    ['spa', 'es-ES', 'Spanish (Spain)', 'es-ES'],
    ['eng', 'en-US', 'English (United States)', 'en-US'],
    ['eng', 'en-GB', 'English (United Kingdom)', 'en-GB'],
    // In brackets after the language's name, and with the kind.
    ['por', 'Português (PT-BR)', 'Portuguese (Brazil)', 'pt-BR'],
    ['por', 'PT-BR (Forced)', 'Portuguese (Brazil) · foreign-language parts only', 'pt-BR'],
    // The tag's own again says nothing more; a code alone is the language.
    ['pt-BR', 'PT-BR', 'Portuguese (Brazil)', 'pt-BR'],
    ['por', 'pt', 'Portuguese', 'pt'],
    ['eng', 'eng', 'English', 'en'],
    ['eng', 'en-US-x-custom', 'English (United States)', 'en-US'],
  ];
  for (const [lang, title, label, tag] of cases) {
    assert.equal(subtitleLabel({ lang, title }), label, title);
    assert.equal(subtitleLanguage({ lang, title }), tag, title);
  }
  // Another region or script than the tag's stays, as the title says it.
  assert.equal(subtitleLabel({ lang: 'pt-PT', title: 'PT-BR' }), 'Portuguese (Portugal) · PT-BR');
  assert.equal(subtitleLabel({ lang: 'zh-Hant', title: 'zh-Hans' }), 'Chinese (Traditional) · zh-Hans');
  // Another language's code is something else.
  assert.equal(subtitleLabel({ lang: 'eng', title: 'de' }), 'English · de');
});

test('a region\'s code in brackets after the language: the region, where it is one of the language\'s', () => {
  const cases: [string, string, string, string][] = [
    ['por', 'Português (BR)', 'Portuguese (Brazil)', 'pt-BR'],
    // The language's own code, and a region of it: the region.
    ['por', 'Português (PT)', 'Portuguese (Portugal)', 'pt-PT'],
    ['spa', 'Español (419)', 'Spanish (Latin America)', 'es-419'],
    ['spa', 'Español [MX]', 'Spanish (Mexico)', 'es-MX'],
    ['fre', 'Français (CA)', 'French (Canada)', 'fr-CA'],
    ['ger', 'Deutsch (CH)', 'German (Switzerland)', 'de-CH'],
    ['chi', '中文（TW）', 'Chinese (Taiwan)', 'zh-TW'],
    ['spa', 'Español (419) (Forced)', 'Spanish (Latin America) · foreign-language parts only', 'es-419'],
  ];
  for (const [lang, title, label, tag] of cases) {
    assert.equal(subtitleLabel({ lang, title }), label, title);
    assert.equal(subtitleLanguage({ lang, title }), tag, title);
  }
  // The language's own code where it is none of its regions: the language
  // (El Salvador, Argentina and Canada speak other languages most).
  assert.equal(subtitleLabel({ lang: 'swe', title: 'Svenska (SV)' }), 'Swedish');
  assert.equal(subtitleLabel({ lang: 'ara', title: 'Arabic (AR)' }), 'Arabic');
  assert.equal(subtitleLabel({ lang: 'cat', title: 'Català (CA)' }), 'Catalan');
  // A code in lower case is a language's; other capitals are a word.
  assert.equal(subtitleLabel({ lang: 'por', title: 'Português (pt)' }), 'Portuguese');
  assert.equal(subtitleLabel({ lang: 'eng', title: 'English (BD)' }), 'English · BD');
});

test('what else a title says stays before the kind', () => {
  assert.deepEqual(
    subtitleLabels([
      { lang: 'eng', title: 'Commentary' },
      { lang: 'eng', title: 'English Commentary' },
      { lang: 'eng', title: 'Commentary (SDH)' },
      { lang: 'ger', title: 'Signs & Songs', forced: true },
      // "English" on a British English track: the name says it.
      { lang: 'en-GB', title: 'English' },
      // A made track's label, its script in the name already.
      { lang: 'zh-Hans', title: 'Chinese (Simplified) · Converted' },
    ]),
    [
      'English · Commentary',
      'English Commentary',
      'English · Commentary · for deaf and hard of hearing',
      'German · Signs & Songs · foreign-language parts only',
      'English (United Kingdom)',
      'Chinese (Simplified) · Converted',
    ],
  );
  // The language again before what the title adds: said once.
  assert.equal(subtitleLabel({ lang: 'eng', title: 'English · Commentary' }), 'English · Commentary');
});

test('a sidecar the server made says " · AI" after the language', () => {
  assert.deepEqual(subtitleLabels([{ lang: 'de', title: 'AI' }, { lang: 'en', title: 'AI' }, { lang: 'zh-Hans', title: 'AI' }]), [
    'German · AI',
    'English · AI',
    'Chinese (Simplified) · AI',
  ]);
  // In a language whose name has the letters inside it, too: "AI" is no
  // word of "Thai" or "Ukrainian".
  assert.deepEqual(subtitleLabels([{ lang: 'tha', title: 'AI' }, { lang: 'ukr', title: 'AI' }, { lang: 'hat', title: 'AI' }]), [
    'Thai · AI',
    'Ukrainian · AI',
    'Haitian Creole · AI',
  ]);
  // Nor the start of a word: "AI" begins "Ainu", but a made track says so.
  assert.equal(subtitleLabel({ lang: 'ain', title: 'AI' }), 'Ainu · AI');
  // A word of the name still says it: "English" on a British track.
  assert.equal(subtitleLabel({ lang: 'en-GB', title: 'English' }), 'English (United Kingdom)');
  // And so does the start of one, the region or the script cut short: the
  // track reads as its untitled twin with the same tag, and shows once.
  assert.deepEqual(
    subtitleLabels([
      { lang: 'es-419', title: 'LAT' },
      { lang: 'pt-BR', title: 'BR' },
      { lang: 'zh-Hant', title: 'Trad' },
      { lang: 'es-419', title: 'Español LAT' },
      { lang: 'por', title: 'Port' },
    ]),
    ['Spanish (Latin America)', 'Portuguese (Brazil)', 'Chinese (Traditional)', 'Spanish (Latin America)', 'Portuguese'],
  );
});

test('the same label twice reads the same, never numbered; the server\'s number goes', () => {
  const labels = subtitleLabels([
    { lang: 'eng', title: 'eng' },
    { lang: 'eng', title: 'English' },
    // chino-stream's unique NAME: its number says nothing of the track.
    { lang: 'eng', title: 'English (2)' },
    { lang: 'eng', title: 'SDH' },
    { lang: 'eng', title: 'English · SDH (2)' },
    { lang: 'ger', forced: true },
    { lang: 'ger', title: 'Forced', forced: true },
    { lang: 'und' },
  ]);
  assert.deepEqual(labels, [
    'English',
    'English',
    'English',
    'English · for deaf and hard of hearing',
    'English · for deaf and hard of hearing',
    'German · foreign-language parts only',
    'German · foreign-language parts only',
    'Unknown',
  ]);
  for (const label of labels) assert.doesNotMatch(label, /\(\d+\)/);
});

test('subtitles without dialogue, or in no known language: "No dialogue", else the title, else "Unknown"', () => {
  assert.deepEqual(
    subtitleLabels([
      { lang: 'zxx' },
      { lang: 'zxx', title: 'zxx' },
      { lang: 'zxx', title: 'Signs' },
      { lang: 'und', title: 'Signs & Songs' },
      { lang: 'und', title: 'und' },
      { lang: '', title: 'Forced', forced: true },
      { lang: 'und' },
    ]),
    ['No dialogue', 'No dialogue', 'No dialogue · Signs', 'Signs & Songs', 'Unknown', 'Unknown · foreign-language parts only', 'Unknown'],
  );
});

test('a picture subtitle by its format or codec; none given is text', () => {
  for (const f of ['pgs', 'PGS', 'hdmv_pgs_subtitle', 'vobsub', 'dvb_subtitle']) assert.equal(isPictureSubtitle(f), true, f);
  for (const f of ['webvtt', 'srt', 'subrip', 'ass', '', undefined]) assert.equal(isPictureSubtitle(f), false, String(f));
});

test('audio by its language first: "No dialogue" for zxx, "Unknown" for none', () => {
  assert.deepEqual(
    audioLabels([{ lang: 'eng' }, { lang: 'zxx' }, { lang: 'und' }, { lang: 'ger', name: 'Deutsch' }, { lang: 'pt-BR' }]),
    ['English', 'No dialogue', 'Unknown', 'German', 'Portuguese (Brazil)'],
  );
  // A packager's NAMEs: the language wins, and says the same.
  assert.deepEqual(
    audioLabels([{ lang: 'en', name: 'English' }, { lang: 'zxx', name: 'No dialogue' }, { lang: 'und', name: 'Unknown' }]),
    ['English', 'No dialogue', 'Unknown'],
  );
});

test('an old playlist\'s free-text names: a format, a number or a code is no label', () => {
  assert.deepEqual(
    audioLabels([
      { lang: 'eng', name: 'AC3 5.1 @ 640 Kbps' },
      { lang: 'fre', name: 'DTS-HD Master Audio / 5.1 / 48 kHz / 2618 kbps / 24-bit' },
      { lang: 'zxx', name: 'zxx' },
      { lang: 'und', name: 'Track 0' },
      { lang: 'und', name: 'Dolby Digital 5.1' },
      { lang: 'und', name: 'und' },
    ]),
    ['English', 'French', 'No dialogue', 'Unknown', 'Unknown (2)', 'Unknown (3)'],
  );
});

test('a track in no language is called what its name says; a code Intl cannot name, too', () => {
  assert.deepEqual(
    audioLabels([
      { lang: 'und', name: 'Director\'s Commentary' },
      { lang: '', name: 'Commentary 5.1' },
      { name: 'Stereo' },
      { lang: 'qaa', name: 'Klingon' },
      { lang: 'qaa' },
    ]),
    ['Director\'s Commentary', 'Commentary', 'Unknown', 'Klingon', 'qaa'],
  );
});

test('two of one language: told apart by their names, else numbered; another detail tells them apart', () => {
  assert.deepEqual(
    audioLabels([
      { lang: 'eng', name: 'English', detail: 'AAC · Stereo' },
      { lang: 'eng', name: 'Commentary', detail: 'AAC · Stereo' },
      { lang: 'eng', name: 'English Commentary (SDH)', detail: 'AAC · Stereo' },
      { lang: 'eng', name: 'AC3 5.1', detail: 'AAC · Stereo' },
      { lang: 'eng', name: 'English 5.1', detail: 'AC3 · 5.1' },
    ]),
    ['English', 'English · Commentary', 'English · Commentary (SDH)', 'English (2)', 'English'],
  );
  // chino-stream's unique NAMEs: "English (2)" is numbered, not "English · 2".
  assert.deepEqual(audioLabels([{ lang: 'eng', name: 'English' }, { lang: 'eng', name: 'English (2)' }]), ['English', 'English (2)']);
  assert.deepEqual(audioLabels([{ lang: 'zxx' }, { lang: 'zxx', name: 'Music & Effects' }]), ['No dialogue', 'No dialogue · Music & Effects']);
});

test('a 5.1 rendition says its layout, beside its stereo twin: the demo\'s Sintel and Big Buck Bunny for an E-AC-3 client', () => {
  // /play/info for caps with eac3: the one group, each companion just before
  // the stereo rendition of its source track (codec, channels, group, rendition).
  assert.deepEqual(
    audioLabels([
      { lang: 'eng', name: 'English 5.1', detail: 'EC-3 · 5.1', channels: 6 },
      { lang: 'eng', name: 'English', detail: 'MP4A.40.2 · Stereo', channels: 2 },
    ]),
    ['English 5.1', 'English'],
  );
  assert.deepEqual(
    audioLabels([
      { lang: 'zxx', name: 'No dialogue 5.1', detail: 'EC-3 · 5.1', channels: 6 },
      { lang: 'zxx', name: 'No dialogue', detail: 'MP4A.40.2 · Stereo', channels: 2 },
    ]),
    ['No dialogue 5.1', 'No dialogue'],
  );
  // On the fly from a package: the companions beside the stereo transcodes.
  assert.deepEqual(
    audioLabels([
      { lang: 'eng', name: 'English 5.1', detail: 'EAC3 · 5.1', channels: 6 },
      { lang: 'eng', name: 'English', detail: 'AAC · Stereo', channels: 2 },
      { lang: 'ger', name: 'German', detail: 'AAC · Stereo', channels: 2 },
    ]),
    ['English 5.1', 'English', 'German'],
  );
  // In the viewer's language, as every label is.
  assert.deepEqual(audioLabels([{ lang: 'eng', name: 'English 5.1', channels: 6 }], ['de']), ['Englisch 5.1']);
});

test('the layout only for what plays in it: a source\'s 5.1 track, which plays as stereo, says none', () => {
  // A source's tracks as /play/info lists them on the fly (no channels given
  // for the label): the file's AC-3 5.1 is transcoded to stereo AAC.
  assert.deepEqual(audioLabels([{ lang: 'eng', name: 'English', detail: 'AC3 · 5.1' }, { lang: 'ger', detail: 'AAC · Stereo' }]), ['English', 'German']);
  assert.deepEqual(audioLabels([{ lang: 'eng', channels: 2 }, { lang: 'eng', channels: 1, detail: 'Mono' }]), ['English', 'English']);
});

test('5.1 renditions among others of one language: told apart as before, the layout last', () => {
  assert.deepEqual(
    audioLabels([
      { lang: 'eng', name: 'English 5.1', detail: 'EC-3 · 5.1', channels: 6 },
      { lang: 'eng', name: 'English', detail: 'MP4A.40.2 · Stereo', channels: 2 },
      { lang: 'eng', name: 'English · Commentary', detail: 'MP4A.40.2 · Stereo', channels: 2 },
    ]),
    ['English 5.1', 'English', 'English · Commentary'],
  );
  // Two 5.1 sources of one language, as chino-stream names them apart.
  assert.deepEqual(
    audioLabels([
      { lang: 'eng', name: 'English 5.1', detail: 'EC-3 · 5.1', channels: 6 },
      { lang: 'eng', name: 'English', detail: 'MP4A.40.2 · Stereo', channels: 2 },
      { lang: 'eng', name: 'English 5.1 (2)', detail: 'EC-3 · 5.1', channels: 6 },
      { lang: 'eng', name: 'English (2)', detail: 'MP4A.40.2 · Stereo', channels: 2 },
      { lang: 'eng', name: 'English · Director 5.1', detail: 'EC-3 · 5.1', channels: 6 },
    ]),
    ['English 5.1', 'English', 'English 5.1 (2)', 'English (2)', 'English · Director 5.1'],
  );
  // A companion of a track in no language: its name, then its layout.
  assert.deepEqual(audioLabels([{ lang: 'und', name: 'Commentary 5.1', channels: 6 }, { lang: 'und', name: 'Commentary', channels: 2 }]), [
    'Commentary 5.1',
    'Commentary',
  ]);
});

test('a layout by its channels: 5.1 for six, 7.1 for eight, none for stereo or less', () => {
  assert.deepEqual([6, 8, 7, 3, 2, 1, 0, -6, 5.5, Number.NaN, undefined, null].map(channelLayout), [
    '5.1', '7.1', '6.1', '2.1', '', '', '', '', '', '', '', '',
  ]);
  assert.equal(channelLayout(12), '12 channels');
});

test('channels in words: Mono, Stereo, 5.1, 7.1 - never a count like "2ch"', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8].map(channelWords), ['Mono', 'Stereo', '2.1', '4.0', '5.0', '5.1', '6.1', '7.1']);
  // Past the table: the number in words, still no "ch".
  assert.equal(channelWords(12), '12 channels');
  for (const n of [0, -2, 2.5, Number.NaN, undefined, null]) assert.equal(channelWords(n), '', String(n));
  for (let n = 1; n <= 16; n++) assert.doesNotMatch(channelWords(n), /\dch\b/, String(n));
});

test('the audio menu\'s detail: the codec and the channels in words', () => {
  assert.equal(audioDetail('aac', 2), 'AAC · Stereo');
  assert.equal(audioDetail('eac3', 6), 'EAC3 · 5.1');
  assert.equal(audioDetail('truehd', 8), 'TRUEHD · 7.1');
  assert.equal(audioDetail('mp3', 1), 'MP3 · Mono');
  // Either alone where the other is not known, with no separator left over.
  assert.equal(audioDetail('aac', undefined), 'AAC');
  assert.equal(audioDetail('', 2), 'Stereo');
  assert.equal(audioDetail(undefined, 0), '');
  for (const n of [1, 2, 6, 8, 12]) assert.doesNotMatch(audioDetail('aac', n), /\dch\b/, String(n));
});

test('a pick in the 5.1 group: its rendition by name, the stereo twin by its own', () => {
  // hls.js's renditions of the master an E-AC-3 client is served (NAME,
  // 639-1 LANGUAGE), and /play/info's tracks of it, in the same order.
  const group = [{ name: 'English 5.1', lang: 'en' }, { name: 'English', lang: 'en' }];
  assert.equal(audioRenditionFor({ language: 'eng', title: 'English 5.1' }, 0, group), 0);
  assert.equal(audioRenditionFor({ language: 'eng', title: 'English' }, 1, group), 1);
  // On the fly the master's LANGUAGE is the file's tag.
  const fly = [{ name: 'English 5.1', lang: 'eng' }, { name: 'English', lang: 'eng' }, { name: 'German', lang: 'ger' }];
  assert.equal(audioRenditionFor({ language: 'eng', title: 'English' }, 1, fly), 1);
  assert.equal(audioRenditionFor({ language: 'ger', title: 'German' }, 2, fly), 2);
});

test('the audio chip: the ISO 639-2/T code, "—" for no dialogue, "Audio" for no language', () => {
  assert.deepEqual(
    ['eng', 'ger', 'deu', 'de', 'fre', 'dut', 'chi', 'zh-Hant', 'en-US', 'pt-BR', 'iw', 'fil'].map(audioChipLabel),
    ['ENG', 'DEU', 'DEU', 'DEU', 'FRA', 'NLD', 'ZHO', 'ZHO', 'ENG', 'POR', 'HEB', 'FIL'],
  );
  assert.deepEqual(['zxx', 'ZXX', 'mul', 'mis', 'und', '', undefined].map(audioChipLabel), ['—', '—', 'MUL', 'MIS', 'Audio', 'Audio', 'Audio']);
});

test('the audio chip never cuts a name short: Japanese is not "JAP", Malay, Malayalam and Maltese are three', () => {
  for (const code of ['jpn', 'JPN', 'ja', 'ja-JP']) {
    assert.equal(audioChipLabel(code), 'JPN', code);
    assert.notEqual(audioChipLabel(code), 'JAP', code);
  }
  const malay = ['msa', 'may', 'ms'].map(audioChipLabel);
  const malayalam = ['mal', 'ml'].map(audioChipLabel);
  const maltese = ['mlt', 'mt'].map(audioChipLabel);
  assert.deepEqual([...malay, ...malayalam, ...maltese], ['MSA', 'MSA', 'MSA', 'MAL', 'MAL', 'MLT', 'MLT']);
  assert.equal(new Set([...malay, ...malayalam, ...maltese]).size, 3);
});

test('mul is "Multiple languages", mis "Other language" - and neither a language to follow', () => {
  assert.equal(languageName('mul'), 'Multiple languages');
  assert.equal(languageName('MUL'), 'Multiple languages');
  assert.equal(languageName('mis'), 'Other language');
  assert.equal(normalizeLang('mul'), '');
  assert.equal(normalizeLang('mis'), '');
  assert.equal(defaultSubtitleLang({ audioLang: 'mul', subtitlePref: 'eng' }), null);
  assert.deepEqual(
    audioLabels([{ lang: 'mul', name: 'mul' }, { lang: 'mis' }, { lang: 'mul', name: 'Original' }]),
    ['Multiple languages', 'Other language', 'Multiple languages · Original'],
  );
  assert.deepEqual(subtitleLabels([{ lang: 'mul' }, { lang: 'mis', title: 'Signs' }]), ['Multiple languages', 'Other language · Signs']);
});

test('subtitles default off when the audio is in the chosen subtitle language', () => {
  assert.equal(defaultSubtitleLang({ audioLang: 'eng', subtitlePref: 'eng' }), null);
  assert.equal(defaultSubtitleLang({ audioLang: 'en', subtitlePref: 'eng' }), null);
  // Tagged the other way round: still the same language.
  assert.equal(defaultSubtitleLang({ audioLang: 'ger', subtitlePref: 'deu' }), null);
});

test('subtitles come on, in the chosen language, when the audio is in another', () => {
  assert.equal(defaultSubtitleLang({ audioLang: 'fre', subtitlePref: 'eng' }), 'en');
  assert.equal(defaultSubtitleLang({ audioLang: 'jpn', subtitlePref: 'deu' }), 'de');
});

test('the rule compares with the audio that plays, never with the preferred audio language', () => {
  // German dubs preferred, English subtitles, the German audio playing: it
  // is another language than English, so English comes on.
  assert.equal(defaultSubtitleLang({ audioLang: 'ger', subtitlePref: 'eng' }), 'en');
  // What Settings say of the audio is no input: the same answer with it.
  const withAudioSetting = { audioLang: 'ger', subtitlePref: 'eng', audioPref: 'deu' } as Parameters<typeof defaultSubtitleLang>[0];
  assert.equal(defaultSubtitleLang(withAudioSetting), 'en');
  assert.equal(defaultSubtitleTrack([{ id: 'en', lang: 'eng' }], withAudioSetting), 'en');
});

test('never with subtitles set Off, nor when the audio\'s language is unknown', () => {
  assert.equal(defaultSubtitleLang({ audioLang: 'fre', subtitlePref: 'off' }), null);
  assert.equal(defaultSubtitleLang({ audioLang: 'fre', subtitlePref: 'OFF' }), null);
  assert.equal(defaultSubtitleLang({ audioLang: 'fre', subtitlePref: '' }), null);
  for (const audioLang of ['und', '', undefined, null]) {
    assert.equal(defaultSubtitleLang({ audioLang, subtitlePref: 'eng' }), null, String(audioLang));
  }
});

test('the track: one in that language, a full one before a forced one; the file\'s default flag counts for nothing', () => {
  const tracks = [
    { id: 'de', lang: 'ger', default: true },
    { id: 'en-forced', lang: 'eng', forced: true },
    { id: 'en', lang: 'en' },
  ];
  assert.equal(defaultSubtitleTrack(tracks, { audioLang: 'fre', subtitlePref: 'eng' }), 'en');
  assert.equal(defaultSubtitleTrack(tracks.slice(0, 2), { audioLang: 'fre', subtitlePref: 'eng' }), 'en-forced');
  // English audio: off, although German is flagged default in the file.
  assert.equal(defaultSubtitleTrack(tracks, { audioLang: 'eng', subtitlePref: 'eng' }), null);
  // No track in the chosen language: off, not some other language.
  assert.equal(defaultSubtitleTrack(tracks, { audioLang: 'fre', subtitlePref: 'ita' }), null);
});

test('forced subtitles in the audio\'s language come on where no subtitles would: the audio is the viewer\'s own', () => {
  const tracks = [
    { id: 'en', lang: 'eng' },
    { id: 'en-forced', lang: 'eng', forced: true },
    { id: 'de', lang: 'ger' },
    { id: 'de-forced', lang: 'deu', forced: true },
  ];
  const viewer = { subtitlePref: 'eng' };
  // English audio, English subtitles in Settings: no subtitles by the rule - its forced ones.
  assert.equal(defaultSubtitleTrack(tracks, { ...viewer, audioLang: 'eng' }), null);
  assert.equal(autoSubtitleTrack(tracks, { ...viewer, audioLang: 'eng' }), 'en-forced');
  // The German audio playing: another language, so the full English ones -
  // asked again when the viewer switches the audio.
  assert.equal(autoSubtitleTrack(tracks, { ...viewer, audioLang: 'ger' }), 'en');
  assert.equal(autoSubtitleTrack(tracks, { ...viewer, audioLang: 'en' }), 'en-forced');
  // Subtitles off in Settings: the forced track in the audio's language still, part of the film.
  assert.equal(autoSubtitleTrack(tracks, { subtitlePref: 'off', audioLang: 'eng' }), 'en-forced');
  assert.equal(autoSubtitleTrack(tracks, { subtitlePref: 'off', audioLang: 'ger' }), 'de-forced');
});

test('full subtitles where the rule picks them, before any forced track', () => {
  const tracks = [
    { id: 'fr-forced', lang: 'fre', forced: true },
    { id: 'en', lang: 'eng' },
    { id: 'en-forced', lang: 'eng', forced: true },
  ];
  // French audio, an English viewer: the full English subtitles, not the French forced ones.
  assert.equal(autoSubtitleTrack(tracks, { audioLang: 'fre', subtitlePref: 'eng' }), 'en');
  // The viewer switches to the English audio: the forced English ones instead.
  assert.equal(autoSubtitleTrack(tracks, { audioLang: 'eng', subtitlePref: 'eng' }), 'en-forced');
  // As before, a forced track in the Settings language where it is the only one in it.
  assert.equal(autoSubtitleTrack([tracks[0], tracks[2]], { audioLang: 'fre', subtitlePref: 'eng' }), 'en-forced');
});

test('no forced track in the audio\'s language: none', () => {
  const tracks = [{ id: 'en', lang: 'eng' }, { id: 'de-forced', lang: 'ger', forced: true }];
  assert.equal(autoSubtitleTrack(tracks, { audioLang: 'eng', subtitlePref: 'eng' }), null);
  assert.equal(autoSubtitleTrack([], { audioLang: 'eng', subtitlePref: 'eng' }), null);
  // The audio's language not known: no forced track is in it.
  for (const audioLang of ['und', 'zxx', '', undefined, null]) {
    assert.equal(autoSubtitleTrack([{ id: 'und', lang: 'und', forced: true }, ...tracks], { audioLang, subtitlePref: 'eng' }), null, String(audioLang));
  }
});

test('the viewer\'s Off in the player: none, forced or full, whatever the audio', () => {
  const tracks = [{ id: 'en', lang: 'eng' }, { id: 'en-forced', lang: 'eng', forced: true }];
  assert.equal(autoSubtitleTrack(tracks, { audioLang: 'eng', subtitlePref: 'eng', off: true }), null);
  assert.equal(autoSubtitleTrack(tracks, { audioLang: 'fre', subtitlePref: 'eng', off: true }), null);
});

test('a text forced track before a PGS one; a PGS one where there is no other', () => {
  const tracks = [
    { id: 'pgs', lang: 'eng', forced: true, format: 'pgs' },
    { id: 'vtt', lang: 'en', forced: true, format: 'webvtt' },
    { id: 'emb', lang: 'eng', forced: true },
  ];
  assert.equal(forcedSubtitleTrack(tracks, 'eng'), 'vtt');
  assert.equal(forcedSubtitleTrack([tracks[0], tracks[2]], 'eng'), 'emb', 'no format given: text');
  assert.equal(forcedSubtitleTrack([tracks[0]], 'en-US'), 'pgs');
  assert.equal(forcedSubtitleTrack([{ id: 'full', lang: 'eng' }], 'eng'), null, 'a full track is no forced one');
});

test('the audio rendition of a track /play/info lists: by language across code spellings, by title among several', () => {
  // A packaged ladder's master: NAME and 639-1 LANGUAGE; /play/info: the file's 639-2 tags, no title.
  const master = [{ name: 'English', lang: 'en' }, { name: 'German', lang: 'de' }];
  assert.equal(audioRenditionFor({ language: 'ger', title: '' }, 1, master), 1);
  assert.equal(audioRenditionFor({ language: 'eng', title: '' }, 0, master), 0);
  assert.equal(audioRenditionFor({ language: 'deu' }, 0, master), 1, 'the language wins over the place');
  // The 5.1 group has its own renditions: the language finds the one there is.
  assert.equal(audioRenditionFor({ language: 'eng' }, 0, [{ name: 'English 5.1', lang: 'en' }]), 0);
  // On the fly: NAME the title or the language's name, LANGUAGE the file's tag.
  const fly = [{ name: 'English', lang: 'eng' }, { name: 'Commentary', lang: 'eng' }, { name: 'French', lang: 'fre' }];
  assert.equal(audioRenditionFor({ language: 'eng', title: 'Commentary' }, 1, fly), 1);
  assert.equal(audioRenditionFor({ language: 'eng', title: '' }, 1, fly), 1, 'two of one language, no title: its place');
  assert.equal(audioRenditionFor({ language: 'eng', title: '' }, 2, fly), 0, 'its place is another language: the first');
  assert.equal(audioRenditionFor({ language: 'fra' }, 2, fly), 2);
});

test('the audio rendition of a track without a language: by title, else by place; none for nothing', () => {
  const renditions = [{ name: 'Track 0', lang: 'und' }, { name: 'Director', lang: 'und' }];
  assert.equal(audioRenditionFor({ language: 'und', title: 'Director' }, 0, renditions), 1);
  assert.equal(audioRenditionFor({ language: '' }, 1, renditions), 1);
  assert.equal(audioRenditionFor({ language: 'eng' }, 5, renditions), -1);
  assert.equal(audioRenditionFor(undefined, 0, renditions), -1);
  assert.equal(audioRenditionFor({ language: 'eng' }, 0, []), -1);
});
