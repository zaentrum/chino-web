// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NO_SUBTITLE,
  SUBTITLE_SETTING_TEXT,
  autoSubtitle,
  forgetServerSubtitleLanguages,
  languagesFromResponse,
  menuEntries,
  playerChooses,
  sameLanguage,
  serverSubtitleLanguages,
  settingsSubtitleLanguages,
  subtitleEntries,
  subtitleMenu,
  viewerPicks,
  type SubtitleSource,
} from './subtitles.ts';
import { caseOf } from './loadFailure.ts';

const SERVER = ['en', 'de', 'zh-Hans'];

// An original's tracks as a file and its sidecars bring them: the file's own
// streams first, in no order, some twice; then the sidecars.
const ORIGINAL: SubtitleSource[] = [
  { id: 'emb-3', lang: 'ger', forced: true, embedded: true },
  { id: 'emb-4', lang: 'eng', title: 'English SDH', embedded: true },
  { id: 'emb-5', lang: 'jpn', embedded: true },
  { id: 'emb-6', lang: 'eng', embedded: true },
  { id: 'emb-7', lang: 'zh-Hant', embedded: true },
  { id: 'emb-8', lang: 'ger', title: 'Deutsch', embedded: true },
  { id: 'emb-9', lang: 'fre', embedded: true },
  { id: 'emb-10', lang: 'und', title: 'Signs', embedded: true },
  { id: 'side-en', lang: 'en' },
  { id: 'side-zh', lang: 'zh-Hans', title: 'AI' },
  { id: 'side-de-ai', lang: 'de', title: 'AI' },
];

const labels = (list: readonly { label: string }[]) => list.map((e) => e.label);

function menu(tracks: readonly SubtitleSource[], opts: Partial<Parameters<typeof subtitleMenu>[1]> = {}) {
  return subtitleMenu(subtitleEntries(tracks), { preferred: 'eng', serverLanguages: SERVER, ...opts });
}

test('the menu: the viewer\'s language, then the server\'s, then "more languages" with the rest', () => {
  const m = menu(ORIGINAL);
  assert.deepEqual(labels(m.top), [
    'English',
    'English · for deaf and hard of hearing',
    'German',
    'German · foreign-language parts only',
    'German · AI',
    // The server's Simplified Chinese brings the whole language: the
    // file's Traditional with it, not under "more languages".
    'Chinese (Simplified) · AI',
    'Chinese (Traditional)',
  ]);
  // The rest in alphabetical order of their names, a track in no language
  // by its own.
  assert.deepEqual(labels(m.more), ['French', 'Japanese', 'Signs']);
});

test('within a language: plain, for deaf and hard of hearing, foreign-language parts only, then what the platform made', () => {
  const m = menu([
    { id: 'ai', lang: 'en', title: 'AI' },
    { id: 'f', lang: 'eng', title: 'Forced' },
    { id: 'sdh', lang: 'eng', title: '[CC]' },
    { id: 'plain', lang: 'eng' },
  ]);
  assert.deepEqual(labels(m.top), [
    'English',
    'English · for deaf and hard of hearing',
    'English · foreign-language parts only',
    'English · AI',
  ]);
  // "AI" as a word of its own, in capitals: not inside "MAIN", not "Plain".
  assert.deepEqual(
    subtitleEntries([{ id: 'a', lang: 'en', title: 'MAIN' }, { id: 'b', lang: 'en', title: 'Plain' }, { id: 'c', lang: 'en', title: 'AI (beta)' }]).map((e) => e.ai),
    [false, false, true],
  );
});

test('a viewer with subtitles off in Settings has the server\'s languages on top; their own first where it is not one of them', () => {
  assert.deepEqual(labels(menu(ORIGINAL, { preferred: 'off', serverLanguages: ['de'] }).top), [
    'German',
    'German · foreign-language parts only',
    'German · AI',
  ]);
  assert.deepEqual(labels(menu(ORIGINAL, { preferred: 'fre', serverLanguages: ['de'] }).top), [
    'French',
    'German',
    'German · foreign-language parts only',
    'German · AI',
  ]);
});

test('a language named twice on top, by two scripts, is one block where it first comes: never split by the languages between', () => {
  const tracks: SubtitleSource[] = [
    { id: 'emb-2', lang: 'chi', embedded: true },
    { id: 'emb-3', lang: 'chi', title: '繁體中文', embedded: true },
    { id: 'emb-4', lang: 'eng', embedded: true },
    { id: 'emb-5', lang: 'ger', embedded: true },
    { id: 'side-zh', lang: 'zh-Hans', title: 'AI' },
    { id: 'side-en', lang: 'en', title: 'AI' },
  ];
  const chineseFirst = ['Chinese', 'Chinese (Simplified) · AI', 'Chinese (Traditional)', 'English', 'English · AI', 'German'];
  // The setting's Traditional Chinese, the server's Simplified after English
  // and German: Chinese together, first, its runs in their order.
  const m = menu(tracks, { preferred: 'zh-Hant' });
  assert.deepEqual(labels(m.top), chineseFirst);
  assert.deepEqual(m.more, []);
  // The same where the setting is one of the server's languages.
  assert.deepEqual(labels(menu(tracks, { preferred: 'zh-Hant', serverLanguages: ['en', 'de', 'zh-Hans', 'zh-Hant'] }).top), chineseFirst);
  // The server's list naming Chinese twice, German between: Chinese where it
  // first comes.
  assert.deepEqual(labels(menu(tracks, { preferred: 'en', serverLanguages: ['en', 'zh-Hans', 'de', 'zh-Hant'] }).top), [
    'English',
    'English · AI',
    'Chinese',
    'Chinese (Simplified) · AI',
    'Chinese (Traditional)',
    'German',
  ]);
});

test('a language on top brings all of its tracks, whatever region or script names it: never one of them under "more languages"', () => {
  const tracks: SubtitleSource[] = [
    { id: 'emb-2', lang: 'zh-Hant', embedded: true },
    { id: 'emb-3', lang: 'fre', embedded: true },
    { id: 'emb-4', lang: 'chi', embedded: true },
    { id: 'emb-5', lang: 'pt-PT', embedded: true },
    { id: 'emb-6', lang: 'zh-Hant-TW', embedded: true },
    { id: 'side-zh', lang: 'zh-Hans', title: 'AI' },
    { id: 'side-pt', lang: 'pt-BR', title: 'AI' },
  ];
  const chinese = ['Chinese', 'Chinese (Simplified) · AI', 'Chinese (Traditional)', 'Chinese (Traditional, Taiwan)'];
  // Named by the server with a script: the whole language, the bare name
  // first, then the runs alphabetically.
  const hans = menu(tracks, { preferred: 'off', serverLanguages: ['zh-Hans'] });
  assert.deepEqual(labels(hans.top), chinese);
  assert.deepEqual(labels(hans.more), ['French', 'Portuguese (Brazil) · AI', 'Portuguese (Portugal)']);
  // With a region, the same: Brazil's Portuguese brings Portugal's.
  const brazil = menu(tracks, { preferred: 'off', serverLanguages: ['pt-BR'] });
  assert.deepEqual(labels(brazil.top), ['Portuguese (Brazil) · AI', 'Portuguese (Portugal)']);
  // Named by the person: the subtitle setting's Traditional Chinese brings
  // the server's Simplified and the file's bare one, on a server that names
  // other languages too.
  assert.deepEqual(labels(menu(tracks, { preferred: 'zh-Hant', serverLanguages: ['fr'] }).top), [...chinese, 'French']);
  // And without the server's languages, as before.
  assert.deepEqual(labels(menu(tracks, { preferred: 'zh-Hans', serverLanguages: [] }).top), chinese);
  // Every track is still listed once.
  for (const serverLanguages of [['zh-Hans'], ['pt-BR'], []]) {
    assert.equal(menuEntries(menu(tracks, { serverLanguages })).length, tracks.length);
  }
});

test('a server with no subtitle languages (404, or none set): the person\'s own languages on top, the rest under "more languages"', () => {
  // The subtitle setting's language, the audio setting's, the browser's -
  // in that order, each the whole language.
  const m = menu(ORIGINAL, { preferred: 'eng', audio: 'jpn', device: 'de-CH', serverLanguages: [] });
  assert.deepEqual(labels(m.top), [
    'English',
    'English · for deaf and hard of hearing',
    'Japanese',
    'German',
    'German · foreign-language parts only',
    'German · AI',
  ]);
  // The rest in alphabetical order of their names, a language's scripts
  // together: Chinese (Simplified) · AI with the file's Chinese.
  assert.deepEqual(labels(m.more), ['Chinese (Simplified) · AI', 'Chinese (Traditional)', 'French', 'Signs']);
  // Never every track on top: with the subtitle setting's language alone,
  // the other languages wait under "more languages".
  const alone = menu(ORIGINAL, { serverLanguages: [] });
  assert.deepEqual(labels(alone.top), ['English', 'English · for deaf and hard of hearing']);
  assert.deepEqual(labels(alone.more), [
    'Chinese (Simplified) · AI',
    'Chinese (Traditional)',
    'French',
    'German',
    'German · foreign-language parts only',
    'German · AI',
    'Japanese',
    'Signs',
  ]);
  // Tags that name no language count as none.
  assert.deepEqual(menu(ORIGINAL, { serverLanguages: ['und', ''] }), alone);
});

test('a hundred tracks and no server languages: German, English and Chinese on top, the other ninety-odd under "more languages"', () => {
  const codes = [
    'ara', 'bul', 'cat', 'ces', 'dan', 'ell', 'est', 'fin', 'fra', 'heb', 'hin', 'hrv', 'hun', 'ind', 'isl', 'ita', 'jpn', 'kor',
    'lav', 'lit', 'msa', 'nld', 'nor', 'pol', 'por', 'ron', 'rus', 'slk', 'slv', 'spa', 'srp', 'swe', 'tha', 'tur', 'ukr', 'vie',
  ];
  const tracks: SubtitleSource[] = [];
  let n = 2;
  for (const lang of codes) {
    tracks.push({ id: `emb-${n++}`, lang, embedded: true });
    tracks.push({ id: `emb-${n++}`, lang, title: 'SDH', embedded: true });
  }
  tracks.push({ id: `emb-${n++}`, lang: 'ger', embedded: true });
  tracks.push({ id: `emb-${n++}`, lang: 'eng', embedded: true });
  tracks.push({ id: `emb-${n++}`, lang: 'chi', title: '简体中文', embedded: true });
  for (const lang of codes) tracks.push({ id: `side-${lang}`, lang, title: 'AI' });
  tracks.push({ id: 'side-zh-hant', lang: 'zh-Hant', title: 'AI' });
  assert.ok(tracks.length > 100);
  // German subtitles in Settings, English audio, a browser in Chinese.
  const m = menu(tracks, { preferred: 'ger', audio: 'eng', device: 'zh-CN', serverLanguages: [] });
  assert.deepEqual(labels(m.top), ['German', 'English', 'Chinese (Simplified)', 'Chinese (Traditional) · AI']);
  assert.equal(m.more.length, codes.length * 3);
  assert.equal(m.more[0].label, 'Arabic');
  // Every track is still there to pick, each once.
  assert.equal(menuEntries(m).length, tracks.length);
});

test('the person\'s own languages: the audio setting\'s unless Original, the browser\'s, each language once', () => {
  const tracks: SubtitleSource[] = [
    { id: 'emb-2', lang: 'fre', embedded: true },
    { id: 'emb-3', lang: 'ita', embedded: true },
    { id: 'emb-4', lang: 'eng', embedded: true },
    { id: 'emb-5', lang: 'en-GB', embedded: true },
  ];
  // Audio set to Original names no language: the browser's alone.
  const original = menu(tracks, { preferred: 'off', audio: 'orig', device: 'it-IT', serverLanguages: [] });
  assert.deepEqual(labels(original.top), ['Italian']);
  assert.deepEqual(labels(original.more), ['English', 'English (United Kingdom)', 'French']);
  // The browser's language with a region takes the whole language, the
  // bare name first.
  assert.deepEqual(labels(menu(tracks, { preferred: 'off', device: 'en-US', serverLanguages: [] }).top), ['English', 'English (United Kingdom)']);
  // The same language twice (the setting's "eng", the browser's "en-GB") is
  // one block, where the first of them puts it.
  assert.deepEqual(labels(menu(tracks, { preferred: 'eng', audio: 'fre', device: 'en-GB', serverLanguages: [] }).top), [
    'English',
    'English (United Kingdom)',
    'French',
  ]);
  // None of them: "off" and "more languages" alone.
  const none = menu(tracks, { preferred: 'off', audio: 'orig', device: 'ja-JP', serverLanguages: [] });
  assert.deepEqual(none.top, []);
  assert.equal(none.more.length, 4);
  // On a server that names its languages, the audio setting's and the
  // browser's count for nothing: the subtitle setting's, then the server's.
  assert.deepEqual(labels(menu(tracks, { preferred: 'off', audio: 'fre', device: 'it-IT', serverLanguages: ['en'] }).top), [
    'English',
    'English (United Kingdom)',
  ]);
});

test('no server languages: the preferred language first, the whole of it, its runs in order; the rest under "more languages"', () => {
  const tracks: SubtitleSource[] = [
    { id: 'emb-2', lang: 'chi', title: '中文', embedded: true },
    { id: 'emb-3', lang: 'fre', embedded: true },
    { id: 'emb-4', lang: 'und', title: 'Signs', embedded: true },
    { id: 'emb-5', lang: 'ger', embedded: true },
    { id: 'emb-6', lang: 'fre', title: 'SDH', embedded: true },
    { id: 'emb-7', lang: 'eng', embedded: true },
    { id: 'emb-8', lang: 'zh-Hant', embedded: true },
    { id: 'side-zh', lang: 'zh-Hans', title: 'AI' },
    { id: 'side-de', lang: 'de', title: 'AI' },
    { id: 'side-en', lang: 'en', title: 'AI' },
  ];
  const eng = menu(tracks, { preferred: 'eng', serverLanguages: [] });
  assert.deepEqual(labels(eng.top), ['English', 'English · AI']);
  // The rest under "more languages", alphabetical, a language's tracks
  // together: the AI Chinese with the file's Chinese, not after French.
  assert.deepEqual(labels(eng.more), [
    'Chinese',
    'Chinese (Simplified) · AI',
    'Chinese (Traditional)',
    'French',
    'French · for deaf and hard of hearing',
    'German',
    'German · AI',
    'Signs',
  ]);
  // Subtitles off in Settings: nothing on top, a language's runs under
  // "more languages" the bare one first, then alphabetical.
  const off = menu(tracks, { preferred: 'off', serverLanguages: [] });
  assert.deepEqual(off.top, []);
  assert.deepEqual(labels(off.more).slice(0, 3), ['Chinese', 'Chinese (Simplified) · AI', 'Chinese (Traditional)']);
  // A preferred language with a script: the language on top, the whole of
  // it, its runs the bare one first, then alphabetical - the others under
  // "more languages".
  const hans = menu(tracks, { preferred: 'zh-Hans', serverLanguages: [] });
  assert.deepEqual(labels(hans.top), ['Chinese', 'Chinese (Simplified) · AI', 'Chinese (Traditional)']);
  assert.equal(hans.more[0].label, 'English');
  // And with a region: the language's runs, the others under "more
  // languages".
  const portuguese: SubtitleSource[] = [
    { id: 'emb-2', lang: 'eng', embedded: true },
    { id: 'emb-3', lang: 'pt-PT', embedded: true },
    { id: 'emb-4', lang: 'por', title: 'Português (Brasil)', embedded: true },
    { id: 'side-pt', lang: 'pt-BR', title: 'AI' },
  ];
  const brazil = menu(portuguese, { preferred: 'pt-BR', serverLanguages: [] });
  assert.deepEqual(labels(brazil.top), ['Portuguese (Brazil)', 'Portuguese (Brazil) · AI', 'Portuguese (Portugal)']);
  assert.deepEqual(labels(brazil.more), ['English']);
  // A preferred run that doesn't sort first keeps the language's order:
  // the bare name, then the runs alphabetically - not its own run first,
  // nor the rest of the language spliced in after it.
  const chinese: SubtitleSource[] = [
    { id: 'emb-2', lang: 'zh-Hans', embedded: true },
    { id: 'emb-3', lang: 'zh-Hant', embedded: true },
    { id: 'emb-4', lang: 'chi', embedded: true },
    { id: 'emb-5', lang: 'zh-CN', embedded: true },
    { id: 'side-zh', lang: 'zh-Hant', title: 'AI' },
    { id: 'emb-6', lang: 'eng', embedded: true },
  ];
  const hant = menu(chinese, { preferred: 'zh-Hant', serverLanguages: [] });
  assert.deepEqual(labels(hant.top), [
    'Chinese',
    'Chinese (China)',
    'Chinese (Simplified)',
    'Chinese (Traditional)',
    'Chinese (Traditional) · AI',
  ]);
  assert.deepEqual(labels(hant.more), ['English']);
  // The same order for the browser's language with a region.
  assert.deepEqual(labels(menu(chinese, { preferred: 'off', device: 'zh-TW', serverLanguages: [] }).top), labels(hant.top));
  const portugal: SubtitleSource[] = [
    { id: 'emb-2', lang: 'pt-BR', embedded: true },
    { id: 'emb-3', lang: 'eng', embedded: true },
    { id: 'emb-4', lang: 'pt-PT', embedded: true },
    { id: 'emb-5', lang: 'por', embedded: true },
  ];
  const pt = menu(portugal, { preferred: 'pt-PT', serverLanguages: [] });
  assert.deepEqual(labels(pt.top), ['Portuguese', 'Portuguese (Brazil)', 'Portuguese (Portugal)']);
  assert.deepEqual(labels(pt.more), ['English']);
  // What comes on by itself is as before: the language's first track the
  // preference takes, the bare one.
  assert.equal(autoSubtitle(menu(chinese, { preferred: 'zh-Hant', serverLanguages: [] }), { audioLang: 'eng', subtitlePref: 'zh-Hant' }), 'emb-4');
  assert.equal(autoSubtitle(menu(portugal, { preferred: 'pt-PT', serverLanguages: [] }), { audioLang: 'eng', subtitlePref: 'pt-PT' }), 'emb-5');
});

test('a packaged title follows the general rule: the viewer\'s language, the server\'s, then "more languages" for the rest', () => {
  // A package's sidecars: the server's languages, and the tracks it kept
  // outside them.
  const packaged: SubtitleSource[] = [
    { id: 'de', lang: 'de' },
    { id: 'fr', lang: 'fr' },
    { id: 'en', lang: 'en' },
    { id: 'ja', lang: 'ja' },
    { id: 'zh', lang: 'zh-Hans' },
    { id: 'de-ai', lang: 'de', title: 'AI' },
  ];
  const m = menu(packaged);
  assert.deepEqual(labels(m.top), ['English', 'German', 'German · AI', 'Chinese (Simplified)']);
  assert.deepEqual(labels(m.more), ['French', 'Japanese']);
  // Only the server's languages: nothing more to open.
  assert.deepEqual(menu(packaged.filter((t) => t.lang !== 'fr' && t.lang !== 'ja')).more, []);
  // A server with no subtitle languages: a package's tracks as an
  // original's - the person's own languages on top, the rest under "more
  // languages".
  const none = menu(packaged, { audio: 'deu', serverLanguages: [] });
  assert.deepEqual(labels(none.top), ['English', 'German', 'German · AI']);
  assert.deepEqual(labels(none.more), ['Chinese (Simplified)', 'French', 'Japanese']);
});

test('tracks that would read the same show once: the file\'s own before a sidecar, else the first in the file', () => {
  const m = menu(ORIGINAL);
  const english = m.top.filter((e) => e.label === 'English');
  assert.equal(english.length, 1);
  assert.equal(english[0].id, 'emb-6');
  // "German" and "Deutsch" on a German track read the same: once.
  assert.equal(m.top.filter((e) => e.label === 'German').length, 1);
  // A number the server gave to keep a title unique is no difference.
  assert.deepEqual(labels(menu([{ id: 'a', lang: 'eng', title: 'English' }, { id: 'b', lang: 'eng', title: 'English (2)' }]).top), ['English']);
  // Three of the file's own, then two sidecars: the first of the file's.
  const many = menu([
    { id: 'emb-2', lang: 'eng', embedded: true },
    { id: 'emb-3', lang: 'eng', title: 'English', embedded: true },
    { id: 'emb-4', lang: 'en', embedded: true },
    { id: 'side-1', lang: 'en' },
    { id: 'side-2', lang: 'eng', title: 'English' },
  ]);
  assert.deepEqual(many.top.map((e) => [e.id, e.label]), [['emb-2', 'English']]);
  // Two sidecars alone: the first.
  assert.deepEqual(menu([{ id: 'side-1', lang: 'en' }, { id: 'side-2', lang: 'en' }]).top.map((e) => e.id), ['side-1']);
});

test('never numbered: no entry of a menu reads "(2)", in any language or kind', () => {
  const tracks: SubtitleSource[] = [
    ...ORIGINAL,
    { id: 'emb-20', lang: 'ger', embedded: true },
    { id: 'emb-21', lang: 'jpn', title: '日本語', embedded: true },
    { id: 'emb-22', lang: 'eng', title: 'SDH', embedded: true },
    { id: 'emb-23', lang: 'und', title: 'Signs', embedded: true },
    { id: 'emb-24', lang: 'und', title: 'English', embedded: true },
    { id: 'side-en-2', lang: 'eng', title: 'English (2)' },
    { id: 'side-zh-2', lang: 'zh-Hans', title: 'AI (2)' },
  ];
  for (const serverLanguages of [SERVER, []]) {
    const all = menuEntries(menu(tracks, { serverLanguages }));
    for (const e of all) assert.doesNotMatch(e.label, /\(\d+\)/, e.label);
    // Each label once.
    assert.equal(new Set(all.map((e) => e.label)).size, all.length);
  }
});

test('tracks that read the same: the one on stays, whichever it is; a text one before a picture one', () => {
  const twice: SubtitleSource[] = [
    { id: 'emb', lang: 'eng', embedded: true },
    { id: 'side', lang: 'en' },
    { id: 'comm', lang: 'eng', title: 'Commentary' },
  ];
  assert.deepEqual(menu(twice, { on: 'side' }).top.map((e) => e.id), ['side', 'comm']);
  assert.deepEqual(menu(twice).top.map((e) => e.id), ['emb', 'comm']);
  const pictures: SubtitleSource[] = [
    { id: 'pgs', lang: 'eng', format: 'pgs' },
    { id: 'vtt', lang: 'eng', format: 'webvtt' },
  ];
  assert.deepEqual(menu(pictures).top.map((e) => e.id), ['vtt']);
  assert.equal(subtitleEntries(pictures)[0].picture, true);
});

test('a track tagged with no language that reads as one: the file\'s own, else the first, shows - in the language of its twin', () => {
  // The file's untagged track titled "English", then a French one, then an
  // English sidecar: they read the same, and show once - the file's own,
  // timed to it, with the sidecar's language: on top, and on by itself.
  // No "English (2)".
  const tracks: SubtitleSource[] = [
    { id: 'emb-2', lang: 'und', title: 'English', embedded: true },
    { id: 'emb-3', lang: 'fre', embedded: true },
    { id: 's1', lang: 'en' },
  ];
  const m = menu(tracks);
  assert.deepEqual(m.top.map((e) => [e.id, e.label, e.tag]), [['emb-2', 'English', 'en']]);
  assert.deepEqual(m.more.map((e) => [e.id, e.label]), [['emb-3', 'French']]);
  assert.equal(autoSubtitle(m, { audioLang: 'fre', subtitlePref: 'eng' }), 'emb-2');
  // The same without the server's languages, and with no preferred language.
  const own = menu(tracks, { serverLanguages: [] });
  assert.deepEqual([own.top.map((e) => [e.id, e.tag]), own.more.map((e) => e.id)], [[['emb-2', 'en']], ['emb-3']]);
  assert.deepEqual(menuEntries(menu(tracks, { preferred: 'off' })).map((e) => e.id), ['emb-2', 'emb-3']);
  // The sidecar on: it stays, whichever it is.
  assert.deepEqual(menu(tracks, { on: 's1' }).top.map((e) => e.id), ['s1']);
  // Alone, it is listed by its title, in its place in the file.
  assert.deepEqual(menu(tracks.slice(0, 2)).more.map((e) => [e.id, e.label]), [['emb-2', 'English'], ['emb-3', 'French']]);
  // Two of the file's own, the untagged one first: the first, in English.
  const both = menu([{ id: 'emb-2', lang: 'und', title: 'English', embedded: true }, { id: 'emb-3', lang: 'eng', embedded: true }]);
  assert.deepEqual(both.top.map((e) => [e.id, e.tag]), [['emb-2', 'en']]);
  assert.equal(autoSubtitle(both, { audioLang: 'fre', subtitlePref: 'eng' }), 'emb-2');
  // The foreign-language parts only, too: English audio, the file's own forced track.
  const forced = menu([
    { id: 'emb-4', lang: 'und', title: 'English Forced', embedded: true },
    { id: 's2', lang: 'eng', forced: true },
  ]);
  assert.equal(autoSubtitle(forced, { audioLang: 'eng', subtitlePref: 'off' }), 'emb-4');
  // Untagged tracks that read the same are one.
  assert.equal(menu([{ id: 'a', lang: 'und', title: 'Signs' }, { id: 'b', lang: '', title: 'Signs' }]).more.length, 1);
});

test('Simplified and Traditional Chinese, told apart by their titles only, are two', () => {
  const tracks: SubtitleSource[] = [
    { id: 'emb-3', lang: 'chi', title: '简体中文', embedded: true },
    { id: 'emb-4', lang: 'chi', title: '繁體中文', embedded: true },
    { id: 'emb-5', lang: 'eng', embedded: true },
  ];
  const m = menu(tracks, { preferred: 'en' });
  // The server's Simplified Chinese on top brings the Traditional too, each
  // by its script.
  assert.deepEqual(labels(m.top), ['English', 'Chinese (Simplified)', 'Chinese (Traditional)']);
  assert.deepEqual(m.top.map((e) => e.tag), ['en', 'zh-Hans', 'zh-Hant']);
  assert.deepEqual(m.more, []);
  // A server with no languages: both, each by its script, under "more
  // languages"; on top for a browser in Chinese.
  assert.deepEqual(labels(menu(tracks, { preferred: 'en', serverLanguages: [] }).more), ['Chinese (Simplified)', 'Chinese (Traditional)']);
  assert.deepEqual(labels(menu(tracks, { preferred: 'en', device: 'zh-HK', serverLanguages: [] }).top), ['English', 'Chinese (Simplified)', 'Chinese (Traditional)']);
  // Mandarin and Cantonese are two as well.
  assert.deepEqual(labels(menuEntries(menu([{ id: 'a', lang: 'chi', title: '國語' }, { id: 'b', lang: 'chi', title: '粵語' }], { serverLanguages: [] }))), [
    'Chinese · Mandarin',
    'Chinese · Cantonese',
  ]);
});

test('a language\'s region in a title lists the track with that region', () => {
  const tracks: SubtitleSource[] = [
    { id: 'es', lang: 'spa', title: 'Español (España)' },
    { id: 'la', lang: 'spa', title: 'Español (Latinoamérica)' },
    { id: 'la2', lang: 'es-419' },
  ];
  const m = menuEntries(menu(tracks, { serverLanguages: [] }));
  // The same region twice is one; Spain and Latin America are two, a run
  // each, in alphabetical order.
  assert.deepEqual(labels(m), ['Spanish (Latin America)', 'Spanish (Spain)']);
  assert.deepEqual(m.map((e) => e.tag), ['es-419', 'es-ES']);
  // A region's adjective reads as the region: the file's Brazilian
  // Portuguese and the server's are one, the file's own.
  const brazil: SubtitleSource[] = [
    { id: 'emb-2', lang: 'por', title: 'Portuguese (Brazilian)', embedded: true },
    { id: 'side-pt', lang: 'pt-BR' },
  ];
  for (const serverLanguages of [[], ['en', 'pt-BR']]) {
    assert.deepEqual(menuEntries(menu(brazil, { serverLanguages })).map((e) => [e.id, e.label]), [['emb-2', 'Portuguese (Brazil)']]);
  }
});

test('titles that are codes with a region or a script: two regions, two scripts are two', () => {
  const pairs: [string, string, string, string[], string[]][] = [
    ['por', 'PT-BR', 'PT-PT', ['Portuguese (Brazil)', 'Portuguese (Portugal)'], ['emb-2', 'emb-3']],
    ['chi', 'zh-Hant', 'zh-Hans', ['Chinese (Simplified)', 'Chinese (Traditional)'], ['emb-3', 'emb-2']],
    ['spa', 'es-419', 'es-ES', ['Spanish (Latin America)', 'Spanish (Spain)'], ['emb-2', 'emb-3']],
    ['por', 'Português (BR)', 'Português (PT)', ['Portuguese (Brazil)', 'Portuguese (Portugal)'], ['emb-2', 'emb-3']],
  ];
  for (const [lang, first, second, expected, ids] of pairs) {
    const tracks: SubtitleSource[] = [
      { id: 'emb-2', lang, title: first, embedded: true },
      { id: 'emb-3', lang, title: second, embedded: true },
    ];
    // Without the server's languages, a run each, in alphabetical order...
    const all = menuEntries(menu(tracks, { serverLanguages: [] }));
    assert.deepEqual(labels(all), expected, `${first}, ${second}`);
    assert.deepEqual(all.map((e) => e.id), ids);
    // ...and with them, both still there to pick.
    assert.deepEqual(menuEntries(menu(tracks)).map((e) => e.id).sort(), ['emb-2', 'emb-3']);
  }
  // The same region twice, as a code and by its name, is one.
  const twice = menu([
    { id: 'emb-2', lang: 'por', title: 'PT-BR', embedded: true },
    { id: 'side-pt', lang: 'pt-BR' },
  ]);
  assert.deepEqual(menuEntries(twice).map((e) => [e.id, e.label]), [['emb-2', 'Portuguese (Brazil)']]);
});

test('each region or script a run of its own: the bare name first, the others alphabetical, AI ones in their run', () => {
  // In the file's order: Traditional before the bare one, the AI one last.
  const tracks: SubtitleSource[] = [
    { id: 'emb-2', lang: 'zh-Hant', embedded: true },
    { id: 'emb-3', lang: 'pt-PT', embedded: true },
    { id: 'emb-4', lang: 'chi', embedded: true },
    { id: 'emb-5', lang: 'kor', embedded: true },
    { id: 'emb-6', lang: 'zh-Hans', embedded: true },
    { id: 'emb-7', lang: 'pt-BR', title: 'SDH', embedded: true },
    { id: 'emb-8', lang: 'ara', embedded: true },
    { id: 'side-zh', lang: 'zh-Hans', title: 'AI' },
    { id: 'side-pt', lang: 'pt-BR' },
  ];
  const chinese = ['Chinese', 'Chinese (Simplified)', 'Chinese (Simplified) · AI', 'Chinese (Traditional)'];
  // On top, as a server's language.
  assert.deepEqual(labels(menu(tracks, { preferred: 'off', serverLanguages: ['zh'] }).top), chinese);
  // Under "more languages": the languages by their names, as a collator
  // sorts them, each language's runs as on top.
  assert.deepEqual(labels(menu(tracks, { preferred: 'off', serverLanguages: ['en'] }).more), [
    'Arabic',
    ...chinese,
    'Korean',
    'Portuguese (Brazil)',
    'Portuguese (Brazil) · for deaf and hard of hearing',
    'Portuguese (Portugal)',
  ]);
  // Without the server's languages, the browser's language on top, the
  // rest under "more languages", each language's runs the same way.
  const own = menu(tracks, { preferred: 'off', device: 'pt-BR', serverLanguages: [] });
  assert.deepEqual(labels(own.top), [
    'Portuguese (Brazil)',
    'Portuguese (Brazil) · for deaf and hard of hearing',
    'Portuguese (Portugal)',
  ]);
  assert.deepEqual(labels(own.more), ['Arabic', ...chinese, 'Korean']);
  // A track in no language is sorted by its own name, as a reader sorts
  // it - not by its letters' codes, which put "Spanish" before "signs".
  const signs: SubtitleSource[] = [
    { id: 'emb-2', lang: 'spa', embedded: true },
    { id: 'emb-3', lang: 'und', title: 'signs', embedded: true },
    { id: 'emb-4', lang: 'fre', embedded: true },
  ];
  assert.deepEqual(labels(menu(signs, { preferred: 'off', serverLanguages: ['en'] }).more), ['French', 'signs', 'Spanish']);
});

test('a language takes its regions and scripts only where they agree', () => {
  assert.equal(sameLanguage('en', 'en-GB'), true);
  assert.equal(sameLanguage('eng', 'en'), true);
  assert.equal(sameLanguage('zh-Hans', 'chi'), true);
  assert.equal(sameLanguage('zh-Hans', 'zh-Hant'), false);
  assert.equal(sameLanguage('pt-BR', 'pt-PT'), false);
  assert.equal(sameLanguage('pt', 'pt-BR'), true);
  assert.equal(sameLanguage('de', 'und'), false);
});

test('what comes on by itself: the preferred language where the audio is in another, its plain track, the file\'s own', () => {
  const m = menu(ORIGINAL, { preferred: 'ger' });
  assert.equal(autoSubtitle(m, { audioLang: 'jpn', subtitlePref: 'ger' }), 'emb-8');
  // English audio, English subtitles in Settings: not the full English
  // ones - nothing, as the file has no English forced track.
  assert.equal(autoSubtitle(menu(ORIGINAL), { audioLang: 'eng', subtitlePref: 'eng' }), null);
  // Only for deaf and hard of hearing in that language: that one.
  const sdhOnly = menu([{ id: 'sdh', lang: 'eng', title: 'SDH' }, { id: 'de', lang: 'ger' }]);
  assert.equal(autoSubtitle(sdhOnly, { audioLang: 'fre', subtitlePref: 'eng' }), 'sdh');
});

test('what comes on by itself: else the foreign-language parts only in the audio\'s language, never another language', () => {
  const m = menu(ORIGINAL, { preferred: 'eng' });
  // German audio: the German forced track, whatever Settings say.
  assert.equal(autoSubtitle(m, { audioLang: 'ger', subtitlePref: 'off' }), 'emb-3');
  assert.equal(autoSubtitle(m, { audioLang: 'ger', subtitlePref: 'ger' }), 'emb-3');
  // The file flags a track default: it counts for nothing.
  const flagged = menu([{ id: 'de', lang: 'ger', title: 'German' }, { id: 'en', lang: 'eng' }]);
  assert.equal(autoSubtitle(flagged, { audioLang: 'eng', subtitlePref: 'eng' }), null);
  // No track in the chosen language: off, not some other language.
  assert.equal(autoSubtitle(menu(ORIGINAL), { audioLang: 'jpn', subtitlePref: 'ita' }), null);
  // The audio's language not known: nothing.
  assert.equal(autoSubtitle(m, { audioLang: 'und', subtitlePref: 'eng' }), null);
});

test('one at a time: a pick replaces the one on, "off" leaves none', () => {
  let c = viewerPicks(NO_SUBTITLE, 'emb-6');
  assert.deepEqual(c, { on: 'emb-6', picked: true });
  c = viewerPicks(c, 'side-zh');
  assert.deepEqual(c, { on: 'side-zh', picked: true });
  // The one on again stays on.
  assert.equal(viewerPicks(c, 'side-zh'), c);
  assert.deepEqual(viewerPicks(c, null), { on: null, picked: true });
});

test('the player decides until the viewer picks; their pick holds for the rest of the playback', () => {
  let c = playerChooses(NO_SUBTITLE, 'emb-3');
  assert.deepEqual(c, { on: 'emb-3', picked: false });
  // The audio changes: the player decides again.
  c = playerChooses(c, null);
  assert.deepEqual(c, { on: null, picked: false });
  // The same choice again is the same state.
  assert.equal(playerChooses(c, null), c);
  // The viewer picks: nothing the player decides changes it, an Off too.
  c = viewerPicks(c, 'emb-6');
  assert.equal(playerChooses(c, 'emb-3'), c);
  const off = viewerPicks(c, null);
  assert.equal(playerChooses(off, 'emb-3'), off);
  assert.equal(playerChooses(off, 'emb-3').on, null);
});

test('the Settings text: the same words as every chino app, and as the rule does it', () => {
  assert.equal(
    SUBTITLE_SETTING_TEXT,
    "Subtitles in the language you pick here come on when a title's audio is in another language. " +
      'Otherwise, only the foreign-language parts get subtitles, where a title has them. ' +
      "A choice in the player applies only to what's playing now.",
  );
  // It compares with the audio that plays: no "or your audio language".
  assert.doesNotMatch(SUBTITLE_SETTING_TEXT, /audio language/);
  // What it says is what the player does. The language picked comes on
  // for audio in another language...
  const tracks: SubtitleSource[] = [
    { id: 'en', lang: 'eng' },
    { id: 'en-forced', lang: 'eng', forced: true },
    { id: 'de', lang: 'ger' },
  ];
  assert.equal(autoSubtitle(menu(tracks), { audioLang: 'ger', subtitlePref: 'eng' }), 'en');
  // ...otherwise only the foreign-language parts, where the title has them...
  assert.equal(autoSubtitle(menu(tracks), { audioLang: 'eng', subtitlePref: 'eng' }), 'en-forced');
  assert.equal(autoSubtitle(menu(tracks.slice(2)), { audioLang: 'ger', subtitlePref: 'ger' }), null);
  // ...and a choice in the player holds for what is playing only: the next
  // playback starts from NO_SUBTITLE and the setting again.
  assert.equal(playerChooses(viewerPicks(NO_SUBTITLE, null), 'en').on, null);
  assert.deepEqual(playerChooses(NO_SUBTITLE, 'en'), { on: 'en', picked: false });
});

test('every entry in the menu\'s order', () => {
  const m = menu(ORIGINAL);
  assert.deepEqual(menuEntries(m), [...m.top, ...m.more]);
});

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

test('the server\'s subtitle languages: asked once a session, kept', async () => {
  const storage = memoryStorage();
  forgetServerSubtitleLanguages(storage);
  let asked = 0;
  const ask = async () => {
    asked++;
    return { status: 200, body: { languages: ['en', 'de', 'zh-Hans'] } };
  };
  const [a, b] = await Promise.all([serverSubtitleLanguages(ask, storage), serverSubtitleLanguages(ask, storage)]);
  assert.deepEqual(a, ['en', 'de', 'zh-Hans']);
  assert.deepEqual(b, ['en', 'de', 'zh-Hans']);
  assert.deepEqual(await serverSubtitleLanguages(ask, storage), ['en', 'de', 'zh-Hans']);
  assert.equal(asked, 1);
  // The tab's next page: from the session's storage, not asked again.
  const page2 = memoryStorage();
  page2.setItem('chino:subtitleLanguages', storage.getItem('chino:subtitleLanguages')!);
  forgetServerSubtitleLanguages(memoryStorage());
  assert.deepEqual(await serverSubtitleLanguages(ask, page2), ['en', 'de', 'zh-Hans']);
  assert.equal(asked, 1);
  forgetServerSubtitleLanguages(storage);
});

test('a server without the route (404) has none, and is not asked again', async () => {
  const storage = memoryStorage();
  forgetServerSubtitleLanguages(storage);
  let asked = 0;
  const ask = async () => {
    asked++;
    return { status: 404, body: null };
  };
  assert.deepEqual(await serverSubtitleLanguages(ask, storage), []);
  assert.deepEqual(await serverSubtitleLanguages(ask, storage), []);
  assert.equal(asked, 1);
  forgetServerSubtitleLanguages(storage);
});

test('no answer counts as none for now; the next playback asks again', async () => {
  const storage = memoryStorage();
  forgetServerSubtitleLanguages(storage);
  let fail = true;
  let asked = 0;
  const ask = async () => {
    asked++;
    if (fail) throw new Error('no connection');
    return { status: 200, body: { languages: ['de'] } };
  };
  assert.deepEqual(await serverSubtitleLanguages(ask, storage), []);
  fail = false;
  assert.deepEqual(await serverSubtitleLanguages(ask, storage), ['de']);
  assert.equal(asked, 2);
  forgetServerSubtitleLanguages(storage);
  // A server error is no answer either; a body without a list neither.
  assert.equal(languagesFromResponse(500, null), null);
  assert.equal(languagesFromResponse(200, { other: 1 }), null);
  assert.deepEqual(languagesFromResponse(200, { languages: ['en', 7, 'und', 'zh-Hans'] }), ['en', 'zh-Hans']);
  assert.deepEqual(languagesFromResponse(200, { languages: [] }), []);
});

test("Settings' languages: a failure is said with its status, not taken for none; a 404 is none", async () => {
  const storage = memoryStorage();
  forgetServerSubtitleLanguages(storage);
  // The server ran into a problem: the status, for the screen to say why.
  await assert.rejects(settingsSubtitleLanguages(async () => ({ status: 503, body: null }), storage), (e: unknown) => {
    assert.equal(caseOf(e, 'list'), 'server');
    return true;
  });
  // No answer: the network's error, as it came.
  await assert.rejects(
    settingsSubtitleLanguages(async () => {
      throw new TypeError('Failed to fetch');
    }, storage),
    (e: unknown) => caseOf(e, 'list') === 'unreachable',
  );
  // An answer that couldn't be read is the server's.
  await assert.rejects(settingsSubtitleLanguages(async () => ({ status: 200, body: 'nope' }), storage), (e: unknown) => caseOf(e, 'list') === 'server');
  // Nothing was kept on the way: the player still asks.
  assert.deepEqual(await settingsSubtitleLanguages(async () => ({ status: 200, body: { languages: ['en', 'de'] } }), storage), ['en', 'de']);
  // Kept for the session, as the player keeps them.
  assert.deepEqual(await serverSubtitleLanguages(async () => ({ status: 503, body: null }), storage), ['en', 'de']);
  forgetServerSubtitleLanguages(storage);
  // A server without the route names none: every language is offered.
  assert.deepEqual(await settingsSubtitleLanguages(async () => ({ status: 404, body: null }), storage), []);
  forgetServerSubtitleLanguages(storage);
});
