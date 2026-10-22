// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SUBTITLE_COLOR,
  SUBTITLE_FONT,
  SUBTITLE_OUTLINE,
  cueCss,
  cueLines,
  pictureRect,
  shownLines,
  subtitlePlace,
} from './subtitleLook.ts';

const close = (a: number, b: number, what: string) => assert.ok(Math.abs(a - b) < 0.01, `${what}: ${a} is not ${b}`);

test('a 16:9 picture fills a 16:9 player: the subtitle 5.33 % of its height, within 80 % of its width, 8 % above its bottom', () => {
  const picture = pictureRect(1920, 1080, 1920, 1080);
  assert.deepEqual(picture, { left: 0, top: 0, width: 1920, height: 1080 });
  const place = subtitlePlace(picture, 1080);
  close(place.fontSize, 57.564, 'size');
  close(place.width, 1536, 'width');
  close(place.left, 192, 'left');
  close(place.bottom, 86.4, 'bottom');
});

test('a scope picture: the subtitle stays inside it, 8 % of its height above its bottom edge, sized by it', () => {
  // 2.39:1 in a 16:9 window: black bands above and below.
  const picture = pictureRect(1920, 1080, 1920, 804);
  close(picture.top, 138, 'band');
  close(picture.height, 804, 'height');
  const place = subtitlePlace(picture, 1080);
  close(place.bottom, 138 + 0.08 * 804, 'bottom');
  close(place.fontSize, 0.0533 * 804, 'size');
  // Never on the band below the picture.
  assert.ok(place.bottom > 1080 - (picture.top + picture.height));
});

test('a 4:3 picture in a wide window: within 80 % of the picture\'s width, not the window\'s', () => {
  const picture = pictureRect(1920, 1080, 1440, 1080);
  assert.deepEqual(picture, { left: 240, top: 0, width: 1440, height: 1080 });
  const place = subtitlePlace(picture, 1080);
  close(place.left, 240 + 144, 'left');
  close(place.width, 1152, 'width');
});

test('a phone held upright: the picture across the width, the subtitle by its height', () => {
  const picture = pictureRect(390, 844, 1920, 1080);
  close(picture.height, 219.375, 'height');
  const place = subtitlePlace(picture, 844);
  close(place.fontSize, 0.0533 * 219.375, 'size');
  close(place.bottom, (844 - 219.375) / 2 + 0.08 * 219.375, 'bottom');
});

test('the controls showing: the subtitle goes up above them, and back once they hide', () => {
  const picture = pictureRect(1280, 720, 1920, 1080);
  assert.equal(subtitlePlace(picture, 720, 120).bottom, 120);
  close(subtitlePlace(picture, 720, 0).bottom, 57.6, 'bottom');
  // Where 8 % is above them already, it stays.
  close(subtitlePlace(picture, 720, 20).bottom, 57.6, 'bottom');
});

test('the picture\'s size not known yet: the whole player; no player, no place', () => {
  assert.deepEqual(pictureRect(800, 450, 0, 0), { left: 0, top: 0, width: 800, height: 450 });
  assert.deepEqual(pictureRect(0, 0, 1920, 1080), { left: 0, top: 0, width: 0, height: 0 });
});

test('a cue\'s words and line breaks, without the file\'s styles', () => {
  assert.deepEqual(cueLines('<i>One line</i>\n<b>and</b> <u>another</u>'), [[{ text: 'One line' }], [{ text: 'and another' }]]);
  assert.deepEqual(cueLines('<c.yellow.bg_blue>Coloured</c> <v Speaker>voice</v>'), [[{ text: 'Coloured voice' }]]);
  // An ASS override block a converter left in, and a karaoke time.
  assert.deepEqual(cueLines('{\\an8}{\\i1}At the top<00:00:01.500> later'), [[{ text: 'At the top later' }]]);
  assert.deepEqual(cueLines('Fish &amp; chips &lt;3&gt; &#x4E2D;&#25991;'), [[{ text: 'Fish & chips <3> 中文' }]]);
  // Empty lines and spaces at the ends go.
  assert.deepEqual(cueLines('\n  First  \n\n Second\r\n'), [[{ text: 'First' }], [{ text: 'Second' }]]);
  assert.deepEqual(cueLines('<i></i>'), []);
});

test('a reading over its characters (ruby) stays', () => {
  assert.deepEqual(cueLines('<ruby>漢字<rt>かんじ</rt></ruby>のテスト'), [[{ base: '漢字', ruby: 'かんじ' }, { text: 'のテスト' }]]);
  // A ruby without a reading is its text.
  assert.deepEqual(cueLines('<ruby>漢字</ruby>です'), [[{ text: '漢字です' }]]);
});

test('two cues at once: one subtitle, top to bottom as the file placed them, else as they began', () => {
  const lines = shownLines([
    { text: 'Lower', line: 'auto', startTime: 1 },
    { text: 'Upper', line: 10, snapToLines: false, startTime: 2 },
  ]);
  assert.deepEqual(lines, [[{ text: 'Upper' }], [{ text: 'Lower' }]]);
  assert.deepEqual(shownLines([{ text: 'Second', startTime: 2 }, { text: 'First', startTime: 1 }]), [[{ text: 'First' }], [{ text: 'Second' }]]);
  assert.deepEqual(shownLines([]), []);
});

test('the browser\'s own cues look the same: white, the same outline, no box, the system\'s sans-serif', () => {
  const css = cueCss('chino-player');
  assert.match(css, /video\.chino-player::cue \{/);
  assert.ok(css.includes(`color: ${SUBTITLE_COLOR};`));
  assert.ok(css.includes('background: transparent;'));
  assert.ok(css.includes(`text-shadow: ${SUBTITLE_OUTLINE};`));
  assert.ok(css.includes(`font-family: ${SUBTITLE_FONT};`));
  // 5.33 % of the video's height, from the browser's 5 %.
  assert.ok(css.includes('font-size: 106.6%;'));
  assert.equal(SUBTITLE_COLOR, '#FFFFFF');
  assert.doesNotMatch(SUBTITLE_FONT, /Inter/);
  assert.match(SUBTITLE_FONT, /sans-serif/);
  // An outline: black shadows without blur all round, eight of them.
  const shadows = SUBTITLE_OUTLINE.split(', ');
  assert.equal(shadows.length, 8);
  for (const s of shadows) assert.match(s, /^-?[\d.]+em -?[\d.]+em 0 #000$/);
});
