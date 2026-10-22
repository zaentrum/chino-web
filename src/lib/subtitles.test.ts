// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NO_SUBTITLE,
  autoSubtitle,
  forgetServerSubtitleLanguages,
  languagesFromResponse,
  menuEntries,
  playerChooses,
  sameLanguage,
  serverSubtitleLanguages,
  subtitleEntries,
  subtitleMenu,
  viewerPicks,
  type SubtitleSource,
} from './subtitles.ts';

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
  return subtitleMenu(subtitleEntries(tracks), { preferred: 'eng', serverLanguages: SERVER, packaged: false, ...opts });
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
  // The rest by language in the order they come, a track in no language
  // last; "zh-Hant" is not "zh-Hans".
  assert.deepEqual(labels(m.more), ['Japanese', 'Chinese (Traditional)', 'French', 'Signs']);
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
  assert.deepEqual(labels(m.top), [
    'English',
    'English · for deaf and hard of hearing',
    'German',
    'German · foreign-language parts only',
    'German · AI',
    'Japanese',
    'Chinese (Traditional)',
    'French',
    'Chinese (Simplified) · AI',
    'Signs',
  ]);
  // Tags that name no language count as none.
  assert.deepEqual(menu(ORIGINAL, { serverLanguages: ['und', ''] }).more, []);
});

test('a packaged title: the server\'s languages, no "more languages"', () => {
  const packaged: SubtitleSource[] = [
    { id: 'de', lang: 'de' },
    { id: 'en', lang: 'en' },
    { id: 'zh', lang: 'zh-Hans' },
  ];
  const m = menu(packaged, { packaged: true });
  assert.deepEqual(m.more, []);
  assert.deepEqual(labels(m.top), ['English', 'German', 'Chinese (Simplified)']);
  // Whatever else one brings is listed on top after them.
  assert.deepEqual(labels(menu([...packaged, { id: 'fr', lang: 'fr' }], { packaged: true }).top), [
    'English',
    'German',
    'Chinese (Simplified)',
    'French',
  ]);
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

test('a track tagged with no language is none of a language\'s, whatever its title says: one in the language stands for it', () => {
  // The file's untagged track titled "English", then a French one, then an
  // English sidecar: they read the same, and show once - the English one,
  // on top, which comes on by itself. No "English (2)".
  const tracks: SubtitleSource[] = [
    { id: 'emb-2', lang: 'und', title: 'English', embedded: true },
    { id: 'emb-3', lang: 'fre', embedded: true },
    { id: 's1', lang: 'en' },
  ];
  const m = menu(tracks);
  assert.deepEqual(m.top.map((e) => e.id), ['s1']);
  assert.deepEqual(m.more.map((e) => [e.id, e.label]), [['emb-3', 'French']]);
  assert.equal(autoSubtitle(m, { audioLang: 'fre', subtitlePref: 'eng' }), 's1');
  // Alone, it is listed by its title, with the tracks in no language.
  assert.deepEqual(menu(tracks.slice(0, 2)).more.map((e) => [e.id, e.label]), [['emb-3', 'French'], ['emb-2', 'English']]);
  // Two of the file's own, the untagged one first: the tagged one still.
  const both = menu([{ id: 'emb-2', lang: 'und', title: 'English', embedded: true }, { id: 'emb-3', lang: 'eng', embedded: true }]);
  assert.deepEqual(both.top.map((e) => e.id), ['emb-3']);
  assert.equal(autoSubtitle(both, { audioLang: 'fre', subtitlePref: 'eng' }), 'emb-3');
  // The foreign-language parts only, too: English audio, the tagged forced track.
  const forced = menu([
    { id: 'emb-4', lang: 'und', title: 'English Forced', embedded: true },
    { id: 's2', lang: 'eng', forced: true },
  ]);
  assert.equal(autoSubtitle(forced, { audioLang: 'eng', subtitlePref: 'off' }), 's2');
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
  // The same region twice is one; Spain and Latin America are two.
  assert.deepEqual(labels(m.top), ['Spanish (Spain)', 'Spanish (Latin America)']);
  assert.deepEqual(m.top.map((e) => e.tag), ['es-ES', 'es-419']);
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
  assert.equal(autoSubtitle(m, { audioLang: 'jpn', subtitlePref: 'ger', audioPref: 'orig' }), 'emb-8');
  // English audio, English subtitles in Settings: not the full English
  // ones - nothing, as the file has no English forced track.
  assert.equal(autoSubtitle(menu(ORIGINAL), { audioLang: 'eng', subtitlePref: 'eng', audioPref: 'eng' }), null);
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
