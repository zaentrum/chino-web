// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUTO, chosenQuality, packagedQualityMenu, type PlayQuality } from './qualities.ts';

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
