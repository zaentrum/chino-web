// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultSubtitleLang,
  defaultSubtitleTrack,
  languageName,
  languageTag,
  normalizeLang,
  subtitleLabels,
  audioRenditionFor,
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
  assert.equal(languageName('pt-BR'), 'Brazilian Portuguese');
  assert.equal(languageName('ger', ['de']), 'Deutsch');
  assert.equal(languageName('und'), 'Unknown language');
  assert.equal(languageName(undefined), 'Unknown language');
  // A code Intl has no name for is shown as it came.
  assert.equal(languageName('qaa'), 'qaa');
});

test('the menu of the demo\'s Sintel: every track named, none blank', () => {
  const sidecars = ['ger', 'dut', 'eng', 'fre', 'ita', 'spa', 'pol', 'por', 'rus', 'vie'].map((lang) => ({ lang }));
  assert.deepEqual(subtitleLabels(sidecars), [
    'German', 'Dutch', 'English', 'French', 'Italian', 'Spanish', 'Polish', 'Portuguese', 'Russian', 'Vietnamese',
  ]);
});

test('a track\'s title when it says more than its language; forced tracks; the same language twice', () => {
  assert.deepEqual(
    subtitleLabels([
      { lang: 'eng', title: 'SDH' },
      { lang: 'eng', title: 'English [CC]' },
      { lang: 'eng', title: 'eng' },
      { lang: 'eng', title: 'English' },
      { lang: 'ger', forced: true },
      { lang: 'ger', title: 'Forced', forced: true },
      { lang: 'ger' },
      { lang: 'ger' },
      { lang: 'und' },
    ]),
    [
      'English · SDH',
      'English [CC]',
      'English',
      'English (2)',
      'German (forced)',
      'German · Forced',
      'German',
      'German (2)',
      'Unknown language',
    ],
  );
});

test('subtitles default off when the audio is in the viewer\'s language', () => {
  assert.equal(defaultSubtitleLang({ audioLang: 'eng', subtitlePref: 'eng', audioPref: 'eng' }), null);
  assert.equal(defaultSubtitleLang({ audioLang: 'en', subtitlePref: 'eng' }), null);
  // Tagged the other way round: still the same language.
  assert.equal(defaultSubtitleLang({ audioLang: 'ger', subtitlePref: 'deu' }), null);
});

test('subtitles come on, in the chosen language, when the audio is in another', () => {
  assert.equal(defaultSubtitleLang({ audioLang: 'fre', subtitlePref: 'eng', audioPref: 'eng' }), 'en');
  assert.equal(defaultSubtitleLang({ audioLang: 'jpn', subtitlePref: 'deu', audioPref: 'orig' }), 'de');
});

test('the audio in the language the viewer prefers to listen to needs no subtitles either', () => {
  // German dubs preferred, English subtitles: a German track is followed.
  assert.equal(defaultSubtitleLang({ audioLang: 'ger', subtitlePref: 'eng', audioPref: 'deu' }), null);
  assert.equal(defaultSubtitleLang({ audioLang: 'jpn', subtitlePref: 'eng', audioPref: 'deu' }), 'en');
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
