// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTO,
  ORIGINAL,
  autoLabel,
  chosenQuality,
  frameQualityName,
  highRungFrame,
  ladderRow,
  ladderRows,
  lowerRung,
  onTheFlyLadder,
  packagedQualityMenu,
  playingLabel,
  qualityName,
  rungName,
  rungOfUri,
  shownQualityName,
  type LadderEntry,
  type PlayQuality,
} from './qualities.ts';

// /play/info for the H.264 rungs of a ladder, named as chino-stream names them.
const QUALITIES: PlayQuality[] = [
  { name: 'auto', label: 'Auto' },
  { name: 'v1', id: 'v1', label: 'Medium (720p)', width: 1280, height: 720, codec: 'avc1.64001f', bitrate: 1505267, video_range: 'SDR' },
  { name: 'v2', id: 'v2', label: 'Low (480p)', width: 854, height: 480, codec: 'avc1.64001e', bitrate: 706649, video_range: 'SDR' },
];
const info = (qualities: unknown, mode = 'packaged') => ({ mode, qualities: qualities as PlayQuality[] | null });

test('the table: a height named by the step it reaches, with its own height', () => {
  const cases: [number, string][] = [
    [240, 'Lowest (240p)'],
    [360, 'Lowest (360p)'],
    [479, 'Lowest (479p)'],
    [480, 'Low (480p)'],
    [576, 'Low (576p)'],
    [719, 'Low (719p)'],
    [720, 'Medium (720p)'],
    [900, 'Medium (900p)'],
    [1079, 'Medium (1079p)'],
    [1080, 'High (1080p)'],
    [1440, 'High (1440p)'],
    [2159, 'High (2159p)'],
    [2160, 'Ultra (2160p)'],
    [4320, 'Ultra (4320p)'],
  ];
  for (const [h, name] of cases) {
    assert.equal(qualityName(h), name, String(h));
    // A 16:9 frame of the height, and the height alone, are named the same.
    assert.equal(frameQualityName(Math.floor((h * 16 + 4) / 9), h), name, `16:9 ${h}`);
    assert.equal(frameQualityName(0, h), name, `${h} alone`);
  }
  for (const h of [0, -1, NaN, null, undefined]) assert.equal(qualityName(h), null, String(h));
});

test("a frame is named as chino-stream names one: the 16:9 frame it fills (chino-stream's own cases)", () => {
  const cases: [number, number, string | null][] = [
    // 2.39:1, as the transcoder fits it into its boxes.
    [3840, 1606, 'Ultra (2160p)'], [1920, 804, 'High (1080p)'], [1920, 800, 'High (1080p)'],
    [1280, 536, 'Medium (720p)'], [854, 358, 'Low (480p)'], [640, 268, 'Lowest (360p)'],
    // 1.85:1.
    [1920, 1038, 'High (1080p)'], [1998, 1080, 'High (1080p)'], [1280, 692, 'Medium (720p)'],
    // DCI.
    [4096, 2160, 'Ultra (2160p)'], [4096, 1716, 'Ultra (2160p)'], [2048, 1080, 'High (1080p)'], [2048, 858, 'High (1080p)'],
    // A few pixels cropped off the sides: the standard frame.
    [1916, 800, 'High (1080p)'], [1904, 800, 'High (1080p)'], [1912, 1036, 'High (1080p)'], [1918, 1040, 'High (1080p)'],
    [3836, 1600, 'Ultra (2160p)'], [3816, 1600, 'Ultra (2160p)'], [1278, 534, 'Medium (720p)'], [1276, 716, 'Medium (720p)'],
    // More than 3% narrower: its own height, or the 16:9 frame as wide.
    [1856, 800, 'Medium (1044p)'], [1856, 1036, 'Medium (1036p)'],
    // 4:3 and SD: the height.
    [1440, 1080, 'High (1080p)'], [960, 720, 'Medium (720p)'], [720, 576, 'Low (576p)'], [720, 480, 'Low (480p)'], [640, 480, 'Low (480p)'],
    // 21:9 and wider, between the steps.
    [2560, 1080, 'High (1440p)'], [1600, 900, 'Medium (900p)'], [1666, 900, 'Medium (900p)'], [1728, 720, 'Medium (972p)'], [1152, 480, 'Low (648p)'],
    // Past 2160p.
    [7680, 4320, 'Ultra (4320p)'], [8192, 4320, 'Ultra (4320p)'],
    // No height.
    [0, 0, null], [1920, 0, null], [1920, -1, null],
  ];
  for (const [w, h, name] of cases) assert.equal(frameQualityName(w, h), name, `${w}x${h}`);
});

test("a server's label is shown as given; an older server's height alone goes through the table, never with its height twice", () => {
  for (const label of ['Medium (720p)', 'High (1080p)', 'Ultra (2160p)', 'Lowest (360p)', 'Medium (900p)', 'Original', 'Auto']) {
    assert.equal(shownQualityName(label), label, label);
  }
  assert.equal(shownQualityName('720p'), 'Medium (720p)');
  assert.equal(shownQualityName('1080p'), 'High (1080p)');
  assert.equal(shownQualityName('2160p'), 'Ultra (2160p)');
  assert.equal(shownQualityName('480p'), 'Low (480p)');
  assert.equal(shownQualityName('360P'), 'Lowest (360p)');
  assert.equal(shownQualityName(' 576p '), 'Low (576p)');
  // Its name already, once.
  assert.equal(shownQualityName(shownQualityName('720p')), 'Medium (720p)');
  assert.doesNotMatch(shownQualityName('Medium (720p)'), /\(720p\).*720p|720p.*\(720p\)/);
  // A rung's id (no size known) and nothing at all.
  assert.equal(shownQualityName('v1'), 'v1');
  assert.equal(shownQualityName(''), '');
  assert.equal(shownQualityName(undefined), '');
});

test('an older server\'s "High (source resolution)": Original where it plays the original, else the original\'s frame, else the word', () => {
  const old = 'High (source resolution)';
  assert.equal(shownQualityName(old, { q: 'high', mode: 'remux', width: 1920, height: 1080 }), ORIGINAL);
  assert.equal(shownQualityName(old, { q: 'high', mode: 'passthrough' }), ORIGINAL);
  assert.equal(shownQualityName(old, { q: 'high', mode: 'transcode', width: 1920, height: 800 }), 'High (1080p)');
  assert.equal(shownQualityName(old, { q: 'high', mode: 'transcode', width: 1280, height: 720 }), 'Medium (720p)');
  assert.equal(shownQualityName(old, { q: 'high', mode: 'transcode' }), 'High');
  assert.doesNotMatch(shownQualityName(old, {}), /source/i);
});

test('an older server\'s high above 1080p is named by the frame it encodes: the original fitted into 1080 lines, or the device\'s cap', () => {
  const old = 'High (source resolution)';
  const high = (width: number, height: number, maxHeight?: number) => shownQualityName(old, { q: 'high', mode: 'transcode', width, height, maxHeight });
  // A 4K original is encoded at 1080p, 16:9 or scope alike; so is 1440p.
  assert.equal(high(3840, 2160), 'High (1080p)');
  assert.equal(high(3840, 1606), 'High (1080p)');
  assert.equal(high(4096, 2160), 'High (1080p)');
  assert.equal(high(2560, 1440), 'High (1080p)');
  assert.equal(high(2560, 1080), 'High (1080p)');
  // A device that decodes no taller than 720 lines: its cap's frame.
  assert.equal(high(3840, 2160, 720), 'Medium (720p)');
  assert.equal(high(1920, 800, 720), 'Medium (720p)');
  // A cap above 1080 changes nothing; a frame that fits is its own.
  assert.equal(high(3840, 2160, 2160), 'High (1080p)');
  assert.equal(high(1920, 1080, 720), 'Medium (720p)');
  assert.equal(high(1280, 720, 1080), 'Medium (720p)');
  // The frames, as chino-stream's transcodeGeometry has them.
  assert.deepEqual(highRungFrame(3840, 2160), { width: 1920, height: 1080 });
  assert.deepEqual(highRungFrame(3840, 1606), { width: 1920, height: 804 });
  assert.deepEqual(highRungFrame(1920, 800, 720), { width: 1280, height: 534 });
  assert.deepEqual(highRungFrame(1440, 1080), { width: 1440, height: 1080 });
  assert.deepEqual(highRungFrame(0, 0), { width: 0, height: 0 });
});

test('a packaged ladder: Auto, then its rungs by their names, in the order given', () => {
  const menu = packagedQualityMenu(info(QUALITIES));
  assert.deepEqual(menu?.map((e) => [e.name, e.label]), [['auto', 'Auto'], ['v1', 'Medium (720p)'], ['v2', 'Low (480p)']]);
  assert.equal(menu?.[1].width, 1280, 'the entry is passed through');
});

test("an older server's packaged rungs, named by height alone, are named by the table", () => {
  const old = [{ name: 'auto', label: 'Auto' }, { name: 'v0', id: 'v0', label: '1080p' }, { name: 'v1', id: 'v1', label: '720p' }, { name: 'v2', id: 'v2', label: '480p' }];
  assert.deepEqual(packagedQualityMenu(info(old))?.map((e) => e.label), ['Auto', 'High (1080p)', 'Medium (720p)', 'Low (480p)']);
});

test('packaged rungs of one name are one row, the first', () => {
  const twins = [
    { name: 'auto', label: 'Auto' },
    { name: 'v0', id: 'v0', label: 'High (1080p)', codec: 'hvc1.2.4.L120.B0' },
    { name: 'v3', id: 'v3', label: 'High (1080p)', codec: 'avc1.640028' },
    { name: 'v1', id: 'v1', label: '720p' },
    { name: 'v4', id: 'v4', label: 'Medium (720p)' },
  ];
  assert.deepEqual(packagedQualityMenu(info(twins))?.map((e) => e.name), ['auto', 'v0', 'v1']);
  // One name is nothing to choose.
  assert.equal(packagedQualityMenu(info([{ name: 'auto', label: 'Auto' }, twins[1], twins[2]])), null);
});

test('no menu: one rendition (qualities null), a title not packaged, nothing usable', () => {
  assert.equal(packagedQualityMenu(info(null)), null);
  assert.equal(packagedQualityMenu(info(undefined)), null);
  assert.equal(packagedQualityMenu(info([])), null);
  assert.equal(packagedQualityMenu(info([{ name: 'auto', label: 'Auto' }])), null);
  // The transcode ladder has its own menu (onTheFlyLadder).
  assert.equal(packagedQualityMenu(info([{ name: 'high', label: 'High (1080p)' }, { name: 'low', label: 'Low (480p)' }], 'transcode')), null);
  assert.equal(packagedQualityMenu(null), null);
  // Entries without a name or a label are not shown.
  assert.equal(packagedQualityMenu(info([{ name: 'auto', label: 'Auto' }, { name: '', label: '720p' }, { name: 'v2' }, { name: 'v3', label: ' ' }, null])), null);
});

test('Auto first, also when the server did not put it there', () => {
  assert.deepEqual(packagedQualityMenu(info([QUALITIES[1], QUALITIES[2]]))?.map((e) => e.name), ['auto', 'v1', 'v2']);
  assert.deepEqual(packagedQualityMenu(info([QUALITIES[1], QUALITIES[0], QUALITIES[2]]))?.map((e) => e.name), ['auto', 'v1', 'v2']);
});

test('the entry the player is on: the rung it asked for, else Auto', () => {
  const menu = packagedQualityMenu(info(QUALITIES))!;
  assert.equal(chosenQuality(menu, 'v2').label, 'Low (480p)');
  assert.equal(chosenQuality(menu, 'v1').name, 'v1');
  // What the player starts with (q=high), an explicit Auto, a rung no longer on the menu.
  for (const q of ['high', 'medium', 'low', AUTO, 'v0', '']) assert.equal(chosenQuality(menu, q).name, AUTO, q);
});

test('the rung of a variant URI: its directory, absolute or relative, query and all', () => {
  assert.equal(rungOfUri(`https://chino.example/api/v1/items/1adde700-0000-4000-8000-000000000001/play/v1/playlist.m3u8?stream=t&q=auto&caps=avc%2Caac`), 'v1');
  assert.equal(rungOfUri('v2/playlist.m3u8?q=v2'), 'v2');
  assert.equal(rungOfUri('/api/v1/items/x/play/high/index.m3u8'), 'high');
  for (const uri of ['playlist.m3u8', '', undefined]) assert.equal(rungOfUri(uri), '', String(uri));
});

test("what plays is named by the menu: by the rung in its URI, else by its size, else by the master's NAME, else by its frame", () => {
  const menu = packagedQualityMenu(info(QUALITIES))!;
  const uri = (rung: string) => `https://chino.example/api/v1/items/i/play/${rung}/playlist.m3u8?stream=t&q=auto`;
  assert.equal(playingLabel({ uri: uri('v1'), width: 1280, height: 720 }, menu), 'Medium (720p)');
  assert.equal(playingLabel({ uri: uri('v2'), width: 854, height: 480 }, menu), 'Low (480p)');
  // Natively played HLS: no URI, the picture's size.
  assert.equal(playingLabel({ width: 854, height: 480 }, menu), 'Low (480p)');
  // A rung the menu does not list (another family's), or no menu at all:
  // the name its master gives it, else its frame by the table.
  assert.equal(playingLabel({ uri: uri('v0'), width: 1920, height: 1080, name: 'High (1080p)' }, menu), 'High (1080p)');
  assert.equal(playingLabel({ uri: uri('v0'), width: 1920, height: 1080 }, null), 'High (1080p)');
  assert.equal(playingLabel({ width: 1280, height: 536 }, null), 'Medium (720p)');
  assert.equal(playingLabel({ width: 1920, height: 1080, name: '1080p' }, null), 'High (1080p)');
  assert.equal(playingLabel(null, menu), null);
  assert.equal(playingLabel({ width: 0, height: 0 }, menu), null);
});

test('Auto says what it plays', () => {
  assert.equal(autoLabel('Auto', 'Medium (720p)'), 'Auto · Medium (720p)');
  assert.equal(autoLabel('Auto', null), 'Auto');
});

// /play/info's on-the-fly qualities, as chino-stream names them for a 720p
// original: high encodes the original's frame, as medium does.
const ON_THE_FLY_720: PlayQuality[] = [
  { name: 'high', label: 'Medium (720p)' },
  { name: 'medium', label: 'Medium (720p)' },
  { name: 'low', label: 'Low (480p)' },
];
const labels = (l: readonly LadderEntry[]) => l.map((e) => [e.name, e.label]);

test("the on-the-fly menu shows the server's names, one row per name, the first rung of each", () => {
  const ladder = onTheFlyLadder({ mode: 'transcode', listed: ON_THE_FLY_720, width: 1280, height: 720 });
  assert.deepEqual(labels(ladder), [['high', 'Medium (720p)'], ['medium', 'Medium (720p)'], ['low', 'Low (480p)']]);
  assert.deepEqual(labels(ladderRows(ladder)), [['high', 'Medium (720p)'], ['low', 'Low (480p)']]);
  // A 1080p original: three names, three rows; no "source" anywhere.
  const full = onTheFlyLadder({
    mode: 'transcode',
    listed: [{ name: 'high', label: 'High (1080p)' }, { name: 'medium', label: 'Medium (720p)' }, { name: 'low', label: 'Low (480p)' }],
  });
  assert.deepEqual(ladderRows(full).map((e) => e.label), ['High (1080p)', 'Medium (720p)', 'Low (480p)']);
  for (const e of full) assert.doesNotMatch(e.label, /source/i);
  // A 360p original: one name, nothing to choose.
  const small = onTheFlyLadder({ mode: 'transcode', listed: ['high', 'medium', 'low'].map((name) => ({ name, label: 'Lowest (360p)' })) });
  assert.equal(ladderRows(small).length, 1);
});

test("the row the player is on: its q's own, or the row of its q's name", () => {
  const ladder = onTheFlyLadder({ mode: 'transcode', listed: ON_THE_FLY_720 });
  assert.equal(ladderRow(ladder, 'high')?.name, 'high');
  assert.equal(ladderRow(ladder, 'medium')?.name, 'high', "medium reads as high's row");
  assert.equal(ladderRow(ladder, 'low')?.name, 'low');
  assert.equal(ladderRow(ladder, 'v2'), null);
});

test('a step down goes to the next rung with another name, never to one of the same name', () => {
  const ladder = onTheFlyLadder({ mode: 'transcode', listed: ON_THE_FLY_720 });
  assert.equal(lowerRung(ladder, 'high'), 'low', 'past medium, the same frame');
  assert.equal(lowerRung(ladder, 'medium'), 'low');
  assert.equal(lowerRung(ladder, 'low'), null);
  const full = onTheFlyLadder({ mode: 'transcode', listed: [{ name: 'high', label: 'High (1080p)' }, { name: 'medium', label: 'Medium (720p)' }, { name: 'low', label: 'Low (480p)' }] });
  assert.equal(lowerRung(full, 'high'), 'medium');
  assert.equal(lowerRung(full, 'medium'), 'low');
  const small = onTheFlyLadder({ mode: 'transcode', listed: ['high', 'medium', 'low'].map((name) => ({ name, label: 'Lowest (360p)' })) });
  assert.equal(lowerRung(small, 'high'), null, 'nowhere lower');
  assert.equal(lowerRung(full, 'v1'), null);
});

test("a direct stream moved onto the ladder: its high is the Original, the rungs by the server's names or by what plays", () => {
  // /play/info asked again for a q of the ladder names its rungs.
  const named = onTheFlyLadder({ mode: 'remux', listed: ON_THE_FLY_720, width: 1280, height: 720 });
  assert.deepEqual(labels(named), [['high', ORIGINAL], ['medium', 'Medium (720p)'], ['low', 'Low (480p)']]);
  assert.ok(named.every((e) => e.known));
  // Before that answers: the rung playing by its variant's NAME, the others by their word alone, not known.
  const playing = onTheFlyLadder({ mode: 'passthrough', listed: null, width: 1920, height: 1080, playing: { q: 'medium', name: 'Medium (720p)', width: 1280, height: 720 } });
  assert.deepEqual(labels(playing), [['high', ORIGINAL], ['medium', 'Medium (720p)'], ['low', 'Low']]);
  assert.deepEqual(playing.map((e) => e.known), [true, true, false]);
  // A master without NAMEs (an older server): the frame that plays.
  const older = onTheFlyLadder({ mode: 'remux', playing: { q: 'low', width: 854, height: 480 } });
  assert.equal(older[2].label, 'Low (480p)');
  // What plays is of another q (the source before): not this rung's name.
  const stale = onTheFlyLadder({ mode: 'remux', playing: { q: 'high', name: ORIGINAL } });
  assert.equal(stale[1].label, 'Medium');
  assert.equal(stale[1].known, false);
});

test("an older server's on-the-fly labels go through the table; an empty one is named by the player", () => {
  const old = onTheFlyLadder({
    mode: 'transcode',
    listed: [{ name: 'high', label: 'High (source resolution)' }, { name: 'medium', label: 'Medium (720p)' }, { name: 'low', label: 'Low (480p)' }],
    width: 1920,
    height: 800,
  });
  assert.deepEqual(old.map((e) => e.label), ['High (1080p)', 'Medium (720p)', 'Low (480p)']);
  // A 4K original: high is encoded at 1080p, three rows; on a 720p cap one
  // row with medium, the same frame.
  const oldListed = old.map((e) => ({ name: e.name, label: e.name === 'high' ? 'High (source resolution)' : e.label }));
  const uhd = onTheFlyLadder({ mode: 'transcode', listed: oldListed, width: 3840, height: 2160, playing: { q: 'high', width: 1920, height: 1080 } });
  assert.deepEqual(ladderRows(uhd).map((e) => e.label), ['High (1080p)', 'Medium (720p)', 'Low (480p)']);
  const capped = onTheFlyLadder({ mode: 'transcode', listed: oldListed, width: 3840, height: 2160, maxHeight: 720 });
  assert.deepEqual(ladderRows(capped).map((e) => e.label), ['Medium (720p)', 'Low (480p)']);
  assert.equal(ladderRow(capped, 'medium')?.name, 'high');
  // Nothing listed for high: named by the frame it encodes too, not known.
  const unlisted = onTheFlyLadder({ mode: 'transcode', listed: oldListed.slice(1), width: 3840, height: 2160 });
  assert.deepEqual([unlisted[0].label, unlisted[0].known], ['High (1080p)', false]);
  // chino-stream names no high of an original of unknown size: the word, not a guess.
  const unknown = onTheFlyLadder({ mode: 'transcode', listed: [{ name: 'high', label: '' }, { name: 'medium', label: 'Medium (720p)' }, { name: 'low', label: 'Low (480p)' }] });
  assert.deepEqual(unknown.map((e) => [e.label, e.known]), [['High', false], ['Medium (720p)', true], ['Low (480p)', true]]);
});

test("a rung's name for a notice: the server's, else what its source plays, else its word", () => {
  const ladder = onTheFlyLadder({ mode: 'transcode', listed: [{ name: 'high', label: '' }, ...ON_THE_FLY_720.slice(1)] });
  assert.equal(rungName(ladder, 'medium'), 'Medium (720p)');
  assert.equal(rungName(ladder, 'high'), 'High');
  assert.equal(rungName(ladder, 'high', { q: 'high', name: 'High (1080p)' }), 'High (1080p)');
  assert.equal(rungName(ladder, 'high', { q: 'high', width: 1920, height: 800 }), 'High (1080p)');
  assert.equal(rungName(ladder, 'high', { q: 'low', name: 'Low (480p)' }), 'High', "another source's level");
  assert.equal(rungName(ladder, 'v1'), null);
});
