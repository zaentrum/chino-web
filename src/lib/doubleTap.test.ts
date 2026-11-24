// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BEFORE_END_SECONDS,
  FURTHER_TAP_MS,
  SECOND_TAP_MS,
  SKIP_MARK,
  SKIP_MARK_PLACE,
  SKIP_SECONDS,
  halfAt,
  markWords,
  skipTarget,
  tap,
  tapCounts,
  tapElsewhere,
  type Half,
  type Taps,
} from './doubleTap.ts';

/** Taps on the picture one after the other, each `[half, at]`: what the
 *  last one did. */
function taps(...series: [Half, number][]) {
  let before: Taps | null = null;
  let last = tapElsewhere(null);
  for (const [half, at] of series) {
    last = tap(before, half, at);
    before = last.taps;
  }
  return last;
}

test('11.C54: the times and the step are the chapter\'s: 0.3 seconds for the second tap, 0.6 for a further one, 10 seconds, a second before the end', () => {
  assert.equal(SECOND_TAP_MS, 300);
  assert.equal(FURTHER_TAP_MS, 600);
  assert.equal(SKIP_SECONDS, 10);
  assert.equal(BEFORE_END_SECONDS, 1);
});

test('11.C54: left of the picture\'s middle is the left half, the middle and right of it the right half', () => {
  // A phone held sideways, 780 px wide.
  assert.equal(halfAt(0, 0, 780), 'left');
  assert.equal(halfAt(389, 0, 780), 'left');
  assert.equal(halfAt(390, 0, 780), 'right');
  assert.equal(halfAt(779, 0, 780), 'right');
  // A picture that doesn't start at the screen's edge.
  assert.equal(halfAt(279, 100, 360), 'left');
  assert.equal(halfAt(281, 100, 360), 'right');
});

test('11.C54: one tap skips nothing and waits for a second', () => {
  const one = taps(['right', 1000]);
  assert.deepEqual(one, { taps: { half: 'right', at: 1000, seconds: 0 }, skips: false, single: false });
});

test('11.C54: two taps in the same half, the second within 0.3 seconds of the first, skip 10 seconds', () => {
  for (const half of ['left', 'right'] as const) {
    const two = taps([half, 1000], [half, 1000 + SECOND_TAP_MS]);
    assert.deepEqual(two, { taps: { half, at: 1300, seconds: 10 }, skips: true, single: false }, half);
    assert.equal(taps([half, 1000], [half, 1120]).skips, true, half);
  }
});

test('11.C54: a second tap later than 0.3 seconds is a single tap again, and so was the first', () => {
  const late = taps(['left', 1000], ['left', 1000 + SECOND_TAP_MS + 1]);
  assert.deepEqual(late, { taps: { half: 'left', at: 1301, seconds: 0 }, skips: false, single: true });
});

test('11.C54: a tap in the left half and then one in the right half are two single taps', () => {
  const across = taps(['left', 1000], ['right', 1100]);
  assert.deepEqual(across, { taps: { half: 'right', at: 1100, seconds: 0 }, skips: false, single: true });
  assert.equal(taps(['right', 1000], ['left', 1100]).skips, false);
  // The second of them can still be the first of a double tap in its half.
  assert.equal(taps(['left', 1000], ['right', 1100], ['right', 1300]).taps?.seconds, 10);
});

test('11.C54: more taps add up: each further tap in the same half within 0.6 seconds of the last adds 10, and four taps go 30 seconds', () => {
  const three = taps(['right', 0], ['right', 200], ['right', 200 + FURTHER_TAP_MS]);
  assert.deepEqual(three, { taps: { half: 'right', at: 800, seconds: 20 }, skips: true, single: false });
  const four = taps(['left', 0], ['left', 250], ['left', 700], ['left', 1250]);
  assert.deepEqual(four, { taps: { half: 'left', at: 1250, seconds: 30 }, skips: true, single: false });
});

test('11.C54: a further tap later than 0.6 seconds, or in the other half, adds nothing: it is a first tap again', () => {
  const late = taps(['right', 0], ['right', 200], ['right', 200 + FURTHER_TAP_MS + 1]);
  assert.deepEqual(late, { taps: { half: 'right', at: 801, seconds: 0 }, skips: false, single: false });
  const across = taps(['right', 0], ['right', 200], ['left', 400]);
  assert.deepEqual(across, { taps: { half: 'left', at: 400, seconds: 0 }, skips: false, single: false });
});

test('11.C54: only the picture: a tap on the bars, a button, a menu or a card, a tap while a menu is open or a card shows, and a second finger are no taps of a double tap', () => {
  const picture = { primary: true, onPicture: true, menuOpen: false, cardShown: false };
  assert.equal(tapCounts(picture), true);
  assert.equal(tapCounts({ ...picture, onPicture: false }), false);
  assert.equal(tapCounts({ ...picture, menuOpen: true }), false);
  assert.equal(tapCounts({ ...picture, cardShown: true }), false);
  assert.equal(tapCounts({ ...picture, primary: false }), false);
  // Such a tap ends the taps so far; one that waited was a single tap.
  assert.deepEqual(tapElsewhere(null), { taps: null, skips: false, single: false });
  assert.deepEqual(tapElsewhere({ half: 'left', at: 1000, seconds: 0 }), { taps: null, skips: false, single: true });
  assert.deepEqual(tapElsewhere({ half: 'left', at: 1000, seconds: 20 }), { taps: null, skips: false, single: false });
});

test('11.C54: back never goes before the start', () => {
  assert.equal(skipTarget(754, 'left', 10, 888), 744);
  assert.equal(skipTarget(10, 'left', 10, 888), 0);
  assert.equal(skipTarget(4, 'left', 10, 888), 0);
  assert.equal(skipTarget(25, 'left', 30, 888), 0);
  assert.equal(skipTarget(0, 'left', 10, 888), 0);
});

test('11.C54: forward stops a second before the end, and never goes back', () => {
  assert.equal(skipTarget(754, 'right', 10, 888), 764);
  assert.equal(skipTarget(754, 'right', 30, 888), 784);
  assert.equal(skipTarget(877, 'right', 10, 888), 887);
  assert.equal(skipTarget(880, 'right', 10, 888), 887);
  assert.equal(skipTarget(870, 'right', 30, 888), 887);
  // Already in the last second: it stays where it is.
  assert.equal(skipTarget(887.5, 'right', 10, 888), 887.5);
  // A title whose length isn't known yet has no end to stop before.
  assert.equal(skipTarget(12, 'right', 10, 0), 12);
  assert.equal(skipTarget(12, 'right', 10, Number.NaN), 12);
  assert.equal(skipTarget(12, 'right', 10, Number.POSITIVE_INFINITY), 12);
});

test('11.C54: the mark says the seconds so far with their sign, the minus a real minus sign: −10 s, +10 s, −20 s, +30 s', () => {
  assert.equal(markWords('left', 10), '−10 s');
  assert.equal(markWords('right', 10), '+10 s');
  assert.equal(markWords('left', 20), '−20 s');
  assert.equal(markWords('right', 30), '+30 s');
  // U+2212, then the digits, a space and "s".
  assert.deepEqual([...markWords('left', 10)].map((c) => c.codePointAt(0)), [0x2212, 0x31, 0x30, 0x20, 0x73]);
  // The seconds asked for, as four taps add them up.
  const four = taps(['left', 0], ['left', 250], ['left', 700], ['left', 1250]).taps!;
  assert.equal(markWords(four.half, four.seconds), '−30 s');
});

test('11.C54: the mark stands in the middle of the half that was tapped, and lets taps through', () => {
  const look = SKIP_MARK.split(/\s+/);
  for (const cls of ['absolute', 'top-1/2', '-translate-x-1/2', '-translate-y-1/2', 'pointer-events-none', 'font-mono']) {
    assert.ok(look.includes(cls), cls);
  }
  assert.deepEqual(SKIP_MARK_PLACE, { left: 'left-1/4', right: 'left-3/4' });
});

test('11.C54: the player draws the mark from the taps: rewind or fast forward over the words, in the half that was tapped', () => {
  const page = readFileSync(new URL('../components/PlayerPage.tsx', import.meta.url), 'utf8');
  const mark = page.indexOf('{skipMark && (');
  assert.ok(mark > 0);
  const body = page.slice(mark, page.indexOf('</div>', mark));
  assert.match(body, /<div aria-hidden className=\{`\$\{SKIP_MARK\} \$\{SKIP_MARK_PLACE\[skipMark\.half\]\}`\}>/);
  assert.match(body, /skipMark\.half === 'left' \? <Rewind className="w-8 h-8" \/> : <FastForward className="w-8 h-8" \/>/);
  assert.match(body, /<span>\{markWords\(skipMark\.half, skipMark\.seconds\)\}<\/span>/);
  // It goes 0.6 seconds after the last tap.
  assert.match(page, /setSkipMark\(null\);\s*\}, FURTHER_TAP_MS\);/);
});

test('11.C54: in the player a tap counts on the video alone, with no menu open and no card showing; every card over the picture is marked as one', () => {
  const page = readFileSync(new URL('../components/PlayerPage.tsx', import.meta.url), 'utf8');
  assert.match(page, /primary: e\.isPrimary,\s*onPicture: target === videoRef\.current,\s*menuOpen: openMenuRef\.current !== null,\s*cardShown: el\.querySelector\('\[data-picture-card\]'\) !== null,/);
  const cards = page.split('${PICTURE_CARD}`}').length - 1;
  assert.ok(cards > 0);
  assert.equal(page.split('data-picture-card\n          className={`absolute right-4 md:right-6 z-10 max-w-sm p-4 ${PICTURE_CARD}`}').length - 1, cards);
  // A tap alone waits the 0.3 seconds a second one may take, then shows or
  // hides the controls.
  assert.match(page, /singleTap\(tapShownRef\.current\);\s*\}, SECOND_TAP_MS\);/);
});

test('11.C54: a mouse click on the picture plays or pauses as before: the taps are a touch\'s', () => {
  const page = readFileSync(new URL('../components/PlayerPage.tsx', import.meta.url), 'utf8');
  const handler = page.slice(page.indexOf('const onPointer = (e: PointerEvent) => {'), page.indexOf('const onPointerMove = '));
  // A mouse leaves the handler before any tap is counted.
  const mouse = handler.indexOf("if (e.pointerType === 'mouse') { showChrome(); return; }");
  assert.ok(mouse > 0 && mouse < handler.indexOf('tapCounts('));
  assert.match(page, /onClick=\{\(\) => \{\s*if \(lastPointerTypeRef\.current === 'mouse'\) userTogglePlay\(\);\s*\}\}/);
});
