// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUTO, autoLabel, chosenQuality, packagedQualityMenu, playingLabel, rungOfUri, sizeLabel, type PlayQuality } from './qualities.ts';

// /play/info for the H.264 rungs of a ladder (chino-stream's README).
const QUALITIES: PlayQuality[] = [
  { name: 'auto', label: 'Auto' },
  { name: 'v1', id: 'v1', label: '720p', width: 1280, height: 720, codec: 'avc1.64001f', bitrate: 1505267, video_range: 'SDR' },
  { name: 'v2', id: 'v2', label: '480p', width: 854, height: 480, codec: 'avc1.64001e', bitrate: 706649, video_range: 'SDR' },
];
const info = (qualities: unknown, mode = 'packaged') => ({ mode, qualities: qualities as PlayQuality[] | null });

test('a packaged ladder: Auto, then its rungs by their labels, in the order given', () => {
  const menu = packagedQualityMenu(info(QUALITIES));
  assert.deepEqual(menu?.map((e) => [e.name, e.label]), [['auto', 'Auto'], ['v1', '720p'], ['v2', '480p']]);
  assert.equal(menu?.[1].width, 1280, 'the entry is passed through');
});

test('no menu: one rendition (qualities null), a title not packaged, nothing usable', () => {
  assert.equal(packagedQualityMenu(info(null)), null);
  assert.equal(packagedQualityMenu(info(undefined)), null);
  assert.equal(packagedQualityMenu(info([])), null);
  assert.equal(packagedQualityMenu(info([{ name: 'auto', label: 'Auto' }])), null);
  // The transcode ladder has its own menu (high/medium/low).
  assert.equal(packagedQualityMenu(info([{ name: 'high', label: 'High' }, { name: 'low', label: 'Low' }], 'transcode')), null);
  assert.equal(packagedQualityMenu(null), null);
  // Entries without a name or a label are not shown.
  assert.equal(packagedQualityMenu(info([{ name: 'auto', label: 'Auto' }, { name: '', label: '720p' }, { name: 'v2' }, null])), null);
});

test('Auto first, also when the server did not put it there', () => {
  assert.deepEqual(packagedQualityMenu(info([QUALITIES[1], QUALITIES[2]]))?.map((e) => e.name), ['auto', 'v1', 'v2']);
  assert.deepEqual(packagedQualityMenu(info([QUALITIES[1], QUALITIES[0], QUALITIES[2]]))?.map((e) => e.name), ['auto', 'v1', 'v2']);
});

test('the entry the player is on: the rung it asked for, else Auto', () => {
  const menu = packagedQualityMenu(info(QUALITIES))!;
  assert.equal(chosenQuality(menu, 'v2').label, '480p');
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

test('a picture size is named as chino-stream names a rung', () => {
  const cases: [number, number, string][] = [
    [1920, 1080, '1080p'],
    [1280, 720, '720p'],
    [854, 480, '480p'],
    [640, 360, '360p'],
    [720, 576, '576p'],
    // Wider than 16:9: the box the frame fits.
    [1280, 536, '720p'],
    [1920, 800, '1080p'],
    [3840, 1606, '2160p'],
    // DCI: 10% of the width to spare.
    [4096, 2160, '2160p'],
    [3840, 2160, '2160p'],
    [7680, 4320, '4320p'],
    // Nothing holds it: its height.
    [10240, 5760, '5760p'],
  ];
  for (const [w, h, label] of cases) assert.equal(sizeLabel(w, h), label, `${w}x${h}`);
  assert.equal(sizeLabel(0, 0), null);
  assert.equal(sizeLabel(undefined, undefined), null);
  assert.equal(sizeLabel(undefined, 720), '720p');
});

test('what plays is named by the menu: by the rung in its URI, else by its size, else by its size class', () => {
  const menu = packagedQualityMenu(info(QUALITIES))!;
  const uri = (rung: string) => `https://chino.example/api/v1/items/i/play/${rung}/playlist.m3u8?stream=t&q=auto`;
  assert.equal(playingLabel({ uri: uri('v1'), width: 1280, height: 720 }, menu), '720p');
  assert.equal(playingLabel({ uri: uri('v2'), width: 854, height: 480 }, menu), '480p');
  // The menu's label wins over the size class.
  const named = [{ name: 'auto', label: 'Auto' }, { name: 'v1', id: 'v1', label: 'HD', width: 1280, height: 720 }];
  assert.equal(playingLabel({ uri: uri('v1'), width: 1280, height: 720 }, named), 'HD');
  // Natively played HLS: no URI, the picture's size.
  assert.equal(playingLabel({ width: 854, height: 480 }, menu), '480p');
  assert.equal(playingLabel({ width: 1280, height: 536 }, named), '720p');
  // A rung the menu does not list (another family's), or no menu at all.
  assert.equal(playingLabel({ uri: uri('v0'), width: 1920, height: 1080 }, menu), '1080p');
  assert.equal(playingLabel({ uri: uri('v0'), width: 1920, height: 1080 }, null), '1080p');
  assert.equal(playingLabel(null, menu), null);
  assert.equal(playingLabel({ width: 0, height: 0 }, menu), null);
});

test('Auto says what it plays', () => {
  assert.equal(autoLabel('Auto', '720p'), 'Auto · 720p');
  assert.equal(autoLabel('Auto', null), 'Auto');
});
