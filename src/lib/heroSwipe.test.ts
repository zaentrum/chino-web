// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SWIPE_FLICK_PX_PER_MS,
  SWIPE_MIN_PX,
  SWIPE_SLOP_PX,
  gestureAxis,
  heroSlides,
  releaseVelocity,
  swipeDecision,
  wrapIndex,
} from './heroSwipe.ts';

// A phone's hero: 380 px wide, a quarter of it 95 px.
const W = 380;

test('a touch within the slop is a tap still; past it, across or down', () => {
  assert.equal(gestureAxis(0, 0), null);
  assert.equal(gestureAxis(SWIPE_SLOP_PX - 1, -(SWIPE_SLOP_PX - 1)), null);
  assert.equal(gestureAxis(-SWIPE_SLOP_PX, 2), 'x');
  assert.equal(gestureAxis(14, -9), 'x');
  assert.equal(gestureAxis(3, SWIPE_SLOP_PX), 'y');
  assert.equal(gestureAxis(-9, -14), 'y');
});

test('a touch as much down as across is the page scrolling, not a swipe', () => {
  assert.equal(gestureAxis(12, 12), 'y');
  assert.equal(gestureAxis(-12, 12), 'y');
  // A slop of one's own.
  assert.equal(gestureAxis(6, 1, 5), 'x');
  assert.equal(gestureAxis(4, 1, 5), null);
});

test('the velocity a finger lifts with: its travel over the last 100 ms', () => {
  // 30 px every 16 ms to the left: about -1.9 px/ms.
  const samples = Array.from({ length: 8 }, (_, i) => ({ t: 1000 + i * 16, x: 300 - i * 30 }));
  const v = releaseVelocity(samples, 1000 + 7 * 16);
  assert.ok(Math.abs(v - -30 / 16) < 1e-9, `v = ${v}`);
  // Only the window counts: slow first, fast at the end.
  const late = [{ t: 0, x: 0 }, { t: 400, x: 10 }, { t: 450, x: 60 }, { t: 500, x: 110 }];
  assert.equal(releaseVelocity(late, 500), 1);
});

test('no velocity where the finger stood still before it lifted, or moved once', () => {
  const samples = [{ t: 0, x: 0 }, { t: 16, x: 40 }, { t: 32, x: 80 }];
  assert.equal(releaseVelocity(samples, 32 + 250), 0);
  assert.equal(releaseVelocity([{ t: 10, x: 5 }], 20), 0);
  assert.equal(releaseVelocity([], 20), 0);
  // Two samples at the same moment: no time to divide by.
  assert.equal(releaseVelocity([{ t: 5, x: 0 }, { t: 5, x: 9 }], 5), 0);
});

test('a drag over a quarter of the hero brings the next title, or the previous one', () => {
  assert.equal(swipeDecision({ dx: -100, dy: 8, vx: 0, width: W }), 'next');
  assert.equal(swipeDecision({ dx: 100, dy: -8, vx: 0.1, width: W }), 'prev');
  // Under a quarter, slowly: back where it was.
  assert.equal(swipeDecision({ dx: -90, dy: 0, vx: -0.2, width: W }), 'none');
  assert.equal(swipeDecision({ dx: 60, dy: 0, vx: 0, width: W }), 'none');
});

test('a flick changes the title after a short drag', () => {
  assert.equal(swipeDecision({ dx: -40, dy: 5, vx: -SWIPE_FLICK_PX_PER_MS, width: W }), 'next');
  assert.equal(swipeDecision({ dx: 30, dy: 0, vx: 1.2, width: W }), 'prev');
  // Too short even flicked: a twitch.
  assert.equal(swipeDecision({ dx: -(SWIPE_MIN_PX - 1), dy: 0, vx: -2, width: W }), 'none');
});

test('flung back against the drag, the viewer changed their mind', () => {
  assert.equal(swipeDecision({ dx: -150, dy: 0, vx: 0.8, width: W }), 'none');
  assert.equal(swipeDecision({ dx: 120, dy: 0, vx: -0.5, width: W }), 'none');
});

test('only a drag more across than down changes the title', () => {
  assert.equal(swipeDecision({ dx: -120, dy: 130, vx: -1, width: W }), 'none');
  assert.equal(swipeDecision({ dx: 120, dy: -120, vx: 1, width: W }), 'none');
  assert.equal(swipeDecision({ dx: 0, dy: 0, vx: 0, width: W }), 'none');
});

test('without a width, the least drag decides', () => {
  assert.equal(swipeDecision({ dx: -SWIPE_MIN_PX, dy: 0, vx: 0, width: 0 }), 'next');
  assert.equal(swipeDecision({ dx: SWIPE_MIN_PX - 1, dy: 0, vx: 0, width: 0 }), 'none');
});

test('the pool goes round', () => {
  assert.equal(wrapIndex(8, 8), 0);
  assert.equal(wrapIndex(-1, 8), 7);
  assert.equal(wrapIndex(17, 8), 1);
  assert.equal(wrapIndex(3, 0), 0);
});

test('the slide on show, the next at its right and the previous at its left', () => {
  assert.deepEqual(heroSlides(8, 3), [
    { index: 3, pos: 0 },
    { index: 4, pos: 1 },
    { index: 2, pos: -1 },
  ]);
  // Round the ends of the pool.
  assert.deepEqual(heroSlides(8, 7), [
    { index: 7, pos: 0 },
    { index: 0, pos: 1 },
    { index: 6, pos: -1 },
  ]);
  assert.deepEqual(heroSlides(3, 0), [
    { index: 0, pos: 0 },
    { index: 1, pos: 1 },
    { index: 2, pos: -1 },
  ]);
});

test('one title, or none: nothing to swipe to', () => {
  assert.deepEqual(heroSlides(1, 0), [{ index: 0, pos: 0 }]);
  assert.deepEqual(heroSlides(0, 0), []);
});

test('with two titles, the other one waits on the side the finger drags from', () => {
  assert.deepEqual(heroSlides(2, 0), [{ index: 0, pos: 0 }, { index: 1, pos: 1 }]);
  assert.deepEqual(heroSlides(2, 1, -1), [{ index: 1, pos: 0 }, { index: 0, pos: -1 }]);
});

test('while a title leaves: it, at the side it leaves by, and the one settling in', () => {
  // Swiped to the next: the one before leaves by the left.
  assert.deepEqual(heroSlides(8, 4, 1, { index: 3, pos: -1 }), [{ index: 4, pos: 0 }, { index: 3, pos: -1 }]);
  // A dot from the 2nd to the 7th: the 2nd leaves by the left, wherever the 7th's neighbours are.
  assert.deepEqual(heroSlides(8, 6, 1, { index: 1, pos: -1 }), [{ index: 6, pos: 0 }, { index: 1, pos: -1 }]);
  // Two titles, swiped back: the other leaves by the right.
  assert.deepEqual(heroSlides(2, 0, 1, { index: 1, pos: 1 }), [{ index: 0, pos: 0 }, { index: 1, pos: 1 }]);
  // A leaving title the pool no longer has, or the one on show: none leaves.
  assert.deepEqual(heroSlides(3, 0, 1, { index: 5, pos: -1 }), heroSlides(3, 0));
  assert.deepEqual(heroSlides(3, 0, 1, { index: 0, pos: -1 }), heroSlides(3, 0));
});
