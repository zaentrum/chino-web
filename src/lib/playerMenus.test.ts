// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MENU_HEADER, MENU_HEADERS, PLAYBACK_RATES, speedName } from './playerMenus.ts';

test('the menus are headed in lowercase, in the mono face', () => {
  assert.deepEqual(Object.values(MENU_HEADERS), ['subtitles', 'audio', 'quality', 'speed', 'timing']);
  assert.match(MENU_HEADER, /\bfont-mono\b/);
});

test('a speed is "normal" at 1, else its rate without a trailing zero', () => {
  assert.deepEqual(PLAYBACK_RATES.map(speedName), ['0.5x', '0.75x', 'normal', '1.25x', '1.5x', '1.75x', '2x']);
  assert.equal(speedName(2.0), '2x');
  assert.equal(speedName(3), '3x');
  for (const rate of PLAYBACK_RATES) assert.doesNotMatch(speedName(rate), /\.0x$|Normal|\(1x\)/, String(rate));
});
