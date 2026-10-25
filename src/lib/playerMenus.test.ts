// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MENU_HEADER,
  MENU_HEADERS,
  OVER_PICTURE,
  OVER_PICTURE_HOVER,
  PLAYBACK_RATES,
  MENU_ROW_REM,
  SUBTITLES_LIST,
  SUBTITLES_LIST_AT_TOP,
  SUBTITLES_LIST_SCROLLED,
  SUBTITLES_MENU,
  WAITING_LINE,
  WAITING_PANEL,
  WAITING_SQUARE,
  speedName,
  waitingPanel,
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

test('the spinner alone waits in a square frame, as the start-up\'s; with a line, in the panel', () => {
  const look = WAITING_SQUARE.split(/\s+/);
  assert.ok(WAITING_SQUARE.includes(OVER_PICTURE));
  // As wide as it is high.
  assert.ok(look.includes('w-16') && look.includes('h-16'));
  for (const c of look) assert.doesNotMatch(c, /^(rounded|px-|py-|max-w-)/, c);
  assert.equal(waitingPanel(false), WAITING_SQUARE);
  assert.equal(waitingPanel(true), WAITING_PANEL);
});

test('the subtitles menu opens above the whole control bar: never over the seek bar, at any width', () => {
  const look = SUBTITLES_MENU.split(/\s+/);
  assert.ok(look.includes('absolute') && look.includes('bottom-full'));
  // Within the bar's 16 px sides, never wider than the bar leaves.
  assert.ok(look.includes('right-4'));
  assert.ok(look.includes('max-w-[calc(100%-2rem)]'));
  // One place for every width: no breakpoint moves it back over the bar.
  for (const c of look) assert.doesNotMatch(c, /^(sm|md|lg|xl):/, c);
  // Its list scrolls, never taller than the screen leaves above the bar:
  // the list and "off" over it together as tall as the list was alone.
  assert.match(SUBTITLES_LIST, /overflow-y-auto/);
  assert.match(SUBTITLES_LIST, /max-h-\[min\(21\.5rem,calc\(55vh-2\.5rem\),calc\(100vh-20\.5rem\)\)\]/);
  assert.equal(21.5 + MENU_ROW_REM, 24);
  assert.equal(18 + MENU_ROW_REM, 20.5);
  // In the player, the bar is its anchor: between the bar and the menu no
  // wrapper is positioned, so bottom-full is the bar's top, above the seek
  // bar.
  const source = readFileSync(new URL('../components/PlayerPage.tsx', import.meta.url), 'utf8');
  const bar = source.indexOf('ref={bottomBarRef}');
  const seek = source.indexOf('ref={seekBarRef}', bar);
  const menu = source.indexOf('className={SUBTITLES_MENU}', bar);
  assert.ok(bar > 0 && seek > bar && menu > seek);
  const between = source.slice(source.indexOf('<div className="flex items-center gap-2 mt-2">', seek), menu);
  assert.ok(between.length > 0);
  assert.doesNotMatch(between.slice(0, 60), /relative/);
  assert.doesNotMatch(between, /md:relative/);
});

test('"more languages" opened keeps "off" reachable: "off" stays with the header, outside the list that scrolls', () => {
  const source = readFileSync(new URL('../components/PlayerPage.tsx', import.meta.url), 'utf8');
  const menu = source.indexOf('className={SUBTITLES_MENU}');
  const header = source.indexOf('{MENU_HEADERS.subtitles}', menu);
  const off = source.indexOf('{SUBTITLES_OFF_ROW}', menu);
  const list = source.indexOf('ref={subListRef}', menu);
  const more = source.indexOf('more languages</span>', menu);
  assert.ok(menu > 0 && header > menu && off > header && list > off && more > list, 'header, off, then the list with "more languages"');
  // Nothing between the header and "off" scrolls: "off" is no row of the list.
  assert.doesNotMatch(source.slice(header, off), /overflow|SUBTITLES_LIST/);
  // Scrolled, a hairline under "off"; at its top, the same line unseen, so
  // nothing moves when it shows.
  assert.match(source, /subListScrolled \? SUBTITLES_LIST_SCROLLED : SUBTITLES_LIST_AT_TOP/);
  assert.deepEqual(SUBTITLES_LIST_SCROLLED.split(' ').slice(0, 1), SUBTITLES_LIST_AT_TOP.split(' ').slice(0, 1));
  assert.match(SUBTITLES_LIST_SCROLLED, /\bborder-chino-border-2\b/);
  assert.match(SUBTITLES_LIST_AT_TOP, /\bborder-transparent\b/);
  // Opening "more languages" scrolls the list alone, to it.
  const open = source.slice(source.indexOf('const openMoreLangs = '), source.indexOf('// The server\'s subtitle languages, asked once'));
  assert.match(open, /list\.scrollTop = more\.offsetTop - list\.offsetTop/);
});
