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
    'Chinese (Simplified) · AI',
  ]);
  // The rest in alphabetical order of their names, a track in no language
  // by its own; "zh-Hant" is not "zh-Hans".
  assert.deepEqual(labels(m.more), ['Chinese (Traditional)', 'French', 'Japanese', 'Signs']);
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

test('a server with no subtitle languages (404, or none set): every track on top, the viewer\'s language first, no "more languages"', () => {
  const m = menu(ORIGINAL, { serverLanguages: [] });
  assert.deepEqual(m.more, []);
  // Then the file's order, a language's tracks together: the AI Chinese
  // with the file's Chinese, not after French - each script a run of its
  // own, in alphabetical order.
  assert.deepEqual(labels(m.top), [
    'English',
    'English · for deaf and hard of hearing',
    'German',
    'German · foreign-language parts only',
    'German · AI',
    'Japanese',
    'Chinese (Simplified) · AI',
    'Chinese (Traditional)',
    'French',
    'Signs',
  ]);
  // Tags that name no language count as none.
  assert.deepEqual(menu(ORIGINAL, { serverLanguages: ['und', ''] }).more, []);
});

test('no server languages: the preferred language first, then the file\'s order; a language\'s tracks together, AI ones and regions and scripts with it', () => {
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
  assert.deepEqual(labels(menu(tracks, { preferred: 'eng', serverLanguages: [] }).top), [
    'English',
    'English · AI',
    'Chinese',
    'Chinese (Simplified) · AI',
    'Chinese (Traditional)',
    'French',
    'French · for deaf and hard of hearing',
    // A track in no language: in its place in the file.
    'Signs',
    'German',
    'German · AI',
  ]);
  // Subtitles off in Settings: the file's order alone, a language's runs
  // the bare one first, then alphabetical.
  assert.deepEqual(labels(menu(tracks, { preferred: 'off', serverLanguages: [] }).top).slice(0, 3), [
    'Chinese',
    'Chinese (Simplified) · AI',
    'Chinese (Traditional)',
  ]);
  // A preferred language with a script: its own first, then the rest of
  // the language right after it, before the others.
  assert.deepEqual(labels(menu(tracks, { preferred: 'zh-Hans', serverLanguages: [] }).top).slice(0, 4), [
    'Chinese',
    'Chinese (Simplified) · AI',
    'Chinese (Traditional)',
    'French',
  ]);
  // And with a region: Brazil's, then Portugal's, then the others.
  const portuguese: SubtitleSource[] = [
    { id: 'emb-2', lang: 'eng', embedded: true },
    { id: 'emb-3', lang: 'pt-PT', embedded: true },
    { id: 'emb-4', lang: 'por', title: 'Português (Brasil)', embedded: true },
    { id: 'side-pt', lang: 'pt-BR', title: 'AI' },
  ];
  assert.deepEqual(labels(menu(portuguese, { preferred: 'pt-BR', serverLanguages: [] }).top), [
    'Portuguese (Brazil)',
    'Portuguese (Brazil) · AI',
    'Portuguese (Portugal)',
    'English',
  ]);
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
  // A server with no subtitle languages lists a package's tracks all on
  // top, as an original's: the viewer's language first, then their order.
  const none = menu(packaged, { serverLanguages: [] });
  assert.deepEqual(none.more, []);
  assert.deepEqual(labels(none.top), ['English', 'German', 'German · AI', 'French', 'Japanese', 'Chinese (Simplified)']);
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
  assert.deepEqual(menu(tracks, { serverLanguages: [] }).top.map((e) => e.id), ['emb-2', 'emb-3']);
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
  assert.deepEqual(labels(m.top), ['English', 'Chinese (Simplified)']);
  assert.deepEqual(labels(m.more), ['Chinese (Traditional)']);
  assert.deepEqual(m.more.map((e) => e.tag), ['zh-Hant']);
  // A server with no languages: both, each by its script.
  assert.deepEqual(labels(menu(tracks, { preferred: 'en', serverLanguages: [] }).top), ['English', 'Chinese (Simplified)', 'Chinese (Traditional)']);
  // Mandarin and Cantonese are two as well.
  assert.deepEqual(labels(menu([{ id: 'a', lang: 'chi', title: '國語' }, { id: 'b', lang: 'chi', title: '粵語' }], { serverLanguages: [] }).top), [
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
  const m = menu(tracks, { serverLanguages: [] });
  // The same region twice is one; Spain and Latin America are two, a run
  // each, in alphabetical order.
  assert.deepEqual(labels(m.top), ['Spanish (Latin America)', 'Spanish (Spain)']);
  assert.deepEqual(m.top.map((e) => e.tag), ['es-419', 'es-ES']);
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
  // Without the server's languages, in the file's order by language, each
  // language's runs the same way.
  assert.deepEqual(labels(menu(tracks, { preferred: 'off', serverLanguages: [] }).top), [
    ...chinese,
    'Portuguese (Brazil)',
    'Portuguese (Brazil) · for deaf and hard of hearing',
    'Portuguese (Portugal)',
    'Korean',
    'Arabic',
  ]);
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
