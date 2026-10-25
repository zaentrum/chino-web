// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MENU_HEADER,
  MENU_HEADERS,
  OVER_PICTURE,
  OVER_PICTURE_HOVER,
  PLAYBACK_RATES,
  WAITING_LINE,
  WAITING_PANEL,
  speedName,
} from './playerMenus.ts';

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

test('what sits over the picture sits on a solid surface', () => {
  for (const cls of `${OVER_PICTURE} ${OVER_PICTURE_HOVER}`.split(/\s+/)) {
    if (/^(hover:)?bg-/.test(cls)) assert.doesNotMatch(cls, /\/\d+$|black|white|transparent/, cls);
  }
  assert.match(OVER_PICTURE, /\bbg-chino-surface\b/);
});

test('the spinner and its line while the player waits: on the solid surface, in token colours - no see-through wash or text', () => {
  assert.ok(WAITING_PANEL.includes(OVER_PICTURE));
  for (const cls of `${WAITING_PANEL} ${WAITING_LINE}`.split(/\s+/)) {
    if (/^(bg|text)-/.test(cls) && !/^text-(xs|sm|base|lg|center)$/.test(cls)) assert.match(cls, /^(bg|text)-chino-[a-z0-9-]+$/, cls);
  }
});
