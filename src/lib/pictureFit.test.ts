// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FILL_KEY,
  LIFT_GAP,
  NO_TRANSFORM,
  WHOLE_FRAME,
  intersectRect,
  loadFill,
  pictureAreaOf,
  pictureLift,
  pictureScales,
  pictureTransform,
  placePicture,
  saveFill,
  subtitleRegion,
  transformCss,
  transformRect,
} from './pictureFit.ts';
import { pictureRect } from './subtitleLook.ts';

const close = (a: number, b: number, what: string, eps = 0.001) => assert.ok(Math.abs(a - b) < eps, `${what}: ${a} is not ${b}`);
const rectClose = (a: { left: number; top: number; width: number; height: number }, b: typeof a, what: string) => {
  close(a.left, b.left, `${what} left`, 0.01);
  close(a.top, b.top, `${what} top`, 0.01);
  close(a.width, b.width, `${what} width`, 0.01);
  close(a.height, b.height, `${what} height`, 0.01);
};

// A scope film letterboxed in a 16:9 frame: 1920 x 804 inside 1920 x 1080.
const LETTERBOX = { left: 0, top: 0.1278, width: 1, height: 0.7444 };
// A 4:3 picture pillarboxed in a 16:9 frame.
const PILLARBOX = { left: 0.125, top: 0, width: 0.75, height: 1 };
// A 4:3 picture with bars on all four sides.
const WINDOWBOX = { left: 0.1625, top: 0.05, width: 0.675, height: 0.9 };

test('a pictureArea is four numbers inside the frame; a rounding past an edge is clamped, anything else is the whole frame', () => {
  assert.deepEqual(pictureAreaOf(LETTERBOX), LETTERBOX);
  assert.deepEqual(pictureAreaOf(PILLARBOX), PILLARBOX);
  // Absent, malformed or out of the frame: none.
  assert.equal(pictureAreaOf(undefined), null);
  assert.equal(pictureAreaOf(null), null);
  assert.equal(pictureAreaOf('0,0,1,1'), null);
  assert.equal(pictureAreaOf({ left: 0, top: 0.1, width: 1 }), null);
  assert.equal(pictureAreaOf({ left: 0, top: '0.1', width: 1, height: 0.7 }), null);
  assert.equal(pictureAreaOf({ left: 0, top: Number.NaN, width: 1, height: 0.7 }), null);
  assert.equal(pictureAreaOf({ left: -0.05, top: 0.1, width: 1, height: 0.7 }), null);
  assert.equal(pictureAreaOf({ left: 0, top: 0.4, width: 1, height: 0.7 }), null);
  assert.equal(pictureAreaOf({ left: 0, top: 0.1, width: 0, height: 0.7 }), null);
  // A rounding: clamped into the frame.
  const rounded = pictureAreaOf({ left: -0.0004, top: 0.1278, width: 1.0004, height: 0.7444 });
  assert.ok(rounded);
  assert.equal(rounded.left, 0);
  assert.equal(rounded.width, 1);
  // Implausibly small: a side under a fifth of the frame.
  assert.equal(pictureAreaOf({ left: 0.4, top: 0.1, width: 0.19, height: 0.8 }), null);
  // The whole frame, or as good as: none.
  assert.equal(pictureAreaOf({ left: 0, top: 0, width: 1, height: 1 }), null);
  assert.equal(pictureAreaOf({ left: 0.002, top: 0.004, width: 0.996, height: 0.992 }), null);
  // One side whole, the other not: an area.
  assert.ok(pictureAreaOf({ left: 0, top: 0.004, width: 1, height: 0.985 }));
});

test('a letterboxed scope film on a phone held sideways: fitted, it fills the width and its bars go; filled, a little of its sides goes too', () => {
  // A: 2400 x 1080, the 16:9 frame laid out 1920 x 1080 in the middle.
  const frame = pictureRect(2400, 1080, 1920, 1080);
  assert.deepEqual(frame, { left: 240, top: 0, width: 1920, height: 1080 });
  const s = pictureScales(2400, 1080, frame, LETTERBOX);
  close(s.fit, 1.25, 'fit');
  close(s.fill, 1.34336, 'fill');
  assert.equal(s.fills, true);
  const t = pictureTransform(2400, 1080, frame, LETTERBOX, 0);
  close(t.scale, 1.25, 'scale');
  close(t.x, 0, 'x');
  close(t.y, 0, 'y');
  // What shows of the frame: the whole screen.
  rectClose(subtitleRegion(2400, 1080, frame, t), { left: 0, top: 0, width: 2400, height: 1080 }, 'region');
  // The picture itself, fitted: the whole width, its bars cropped.
  const picture = transformRect(2400, 1080, t, { left: 240, top: 0.1278 * 1080, width: 1920, height: 0.7444 * 1080 });
  rectClose(picture, { left: 0, top: 37.53, width: 2400, height: 1004.94 }, 'picture');
  // Filled: the height, the sides cropped.
  const filled = pictureTransform(2400, 1080, frame, LETTERBOX, 1);
  close(filled.scale, 1.34336, 'filled');
  // Half way: the scale half way on a log scale.
  close(pictureTransform(2400, 1080, frame, LETTERBOX, 0.5).scale, Math.sqrt(1.25 * 1.34336), 'half');
});

test('a 4:3 picture pillarboxed in 16:9: on a wide phone it stays as it was, on a 4:3 tablet it fills it and fill has nothing to add', () => {
  // B: the phone held sideways - fit is the frame's own fit, fill crops.
  const frame = pictureRect(2400, 1080, 1920, 1080);
  const b = pictureScales(2400, 1080, frame, PILLARBOX);
  close(b.fit, 1, 'fit');
  close(b.fill, 1.66667, 'fill');
  assert.equal(b.fills, true);
  // C: a 4:3 tablet held sideways - the picture fills it exactly.
  const tablet = pictureRect(2048, 1536, 1920, 1080);
  assert.deepEqual(tablet, { left: 0, top: 192, width: 2048, height: 1152 });
  const c = pictureScales(2048, 1536, tablet, PILLARBOX);
  close(c.fit, 1.33333, 'fit');
  close(c.fill, 1.33333, 'fill');
  assert.equal(c.fills, false);
});

test('a windowboxed picture on a 16:9 screen: fitted, it grows until its height fills the screen, from its own middle', () => {
  // D
  const frame = pictureRect(1920, 1080, 1920, 1080);
  const s = pictureScales(1920, 1080, frame, WINDOWBOX);
  close(s.fit, 1.11111, 'fit');
  const t = pictureTransform(1920, 1080, frame, WINDOWBOX, 0);
  close(t.x, 0, 'x');
  close(t.y, 0, 'y');
});

test('a display cutout\'s band kept clear at each side: the fitted picture stays inside it, the filled one covers the whole screen', () => {
  // E: 100 px each side.
  const frame = pictureRect(2400, 1080, 1920, 1080);
  const s = pictureScales(2400, 1080, frame, LETTERBOX, 100);
  close(s.fit, 1.14583, 'fit');
  close(s.fill, 1.34336, 'fill');
  // What shows for a text subtitle: never the band.
  const region = subtitleRegion(2400, 1080, frame, pictureTransform(2400, 1080, frame, LETTERBOX, 1, 100), 100);
  rectClose(region, { left: 100, top: 0, width: 2200, height: 1080 }, 'region');
});

test('a phone held upright: a scope film is as before, and there is no fill', () => {
  // F
  const frame = pictureRect(1080, 2400, 1920, 1080);
  close(frame.height, 607.5, 'frame');
  const s = pictureScales(1080, 2400, frame, LETTERBOX);
  close(s.fit, 1, 'fit');
  assert.equal(s.fills, false);
  assert.equal(s.fill, s.fit);
  const t = pictureTransform(1080, 2400, frame, LETTERBOX, 1);
  close(t.scale, 1, 'scale');
  // What shows: the frame, bars and all - the text subtitle as before.
  rectClose(subtitleRegion(1080, 2400, frame, t), frame, 'region');
});

test('a picture that is not in the middle of its frame: moved so its own middle is the screen\'s', () => {
  // G: bars only at the bottom.
  const area = { left: 0, top: 0, width: 1, height: 0.8 };
  const frame = pictureRect(2400, 1080, 1920, 1080);
  const t = pictureTransform(2400, 1080, frame, area, 0);
  close(t.scale, 1.25, 'scale');
  close(t.y, 135, 'y');
  close(t.x, 0, 'x');
  const picture = transformRect(2400, 1080, t, { left: 240, top: 0, width: 1920, height: 864 });
  close(picture.top + picture.height / 2, 540, 'middle');
});

test('without a pictureArea, a 16:9 picture in a 16:9 player is as before; fill only zooms where the shapes differ', () => {
  const frame = pictureRect(1920, 1080, 1920, 1080);
  const s = pictureScales(1920, 1080, frame, null);
  close(s.fit, 1, 'fit');
  assert.equal(s.fills, false);
  assert.deepEqual(pictureTransform(1920, 1080, frame, null, 1), NO_TRANSFORM);
  assert.equal(transformCss(pictureTransform(1920, 1080, frame, null, 0)), '');
  // A 21:9 screen: the 16:9 frame fitted as before, filled it covers it.
  const wide = pictureRect(2560, 1080, 1920, 1080);
  const w = pictureScales(2560, 1080, wide, null);
  close(w.fit, 1, 'fit');
  close(w.fill, 2560 / 1920, 'fill');
  assert.equal(w.fills, true);
  assert.equal(transformCss({ scale: 1.25, x: 0, y: -10 }), 'translate(0px, -10px) scale(1.25)');
  assert.deepEqual(WHOLE_FRAME, { left: 0, top: 0, width: 1, height: 1 });
});

test('a picture subtitle in a cropped bottom bar moves up until it is whole on screen, keeping the gap the file gave it', () => {
  // H: A fitted; the plane is the frame.
  const frame = pictureRect(2400, 1080, 1920, 1080);
  const t = pictureTransform(2400, 1080, frame, LETTERBOX, 0);
  const plane = transformRect(2400, 1080, t, frame);
  rectClose(plane, { left: 0, top: -135, width: 2400, height: 1350 }, 'plane');
  const region = intersectRect(plane, { left: 0, top: 0, width: 2400, height: 1080 });
  const r = transformRect(2400, 1080, t, { left: 240 + 717, top: 968, width: 486, height: 78 });
  rectClose(r, { left: 896.25, top: 1075, width: 607.5, height: 97.5 }, 'transformed');
  const placed = placePicture(r, plane, region);
  // 42.5 px under it in the frame; at the screen's bottom the same.
  rectClose(placed, { left: 896.25, top: 940, width: 607.5, height: 97.5 }, 'placed');
});

test('a picture subtitle whole on screen and clear of a cropped edge stays where the video takes it - a sign over the picture keeps its place', () => {
  const frame = pictureRect(2400, 1080, 1920, 1080);
  const t = pictureTransform(2400, 1080, frame, LETTERBOX, 0);
  const plane = transformRect(2400, 1080, t, frame);
  const region = intersectRect(plane, { left: 0, top: 0, width: 2400, height: 1080 });
  // A sign in the picture, and a line in it above its lower edge.
  for (const y of [300, 700]) {
    const r = transformRect(2400, 1080, t, { left: 240 + 759, top: y, width: 402, height: 78 });
    assert.deepEqual(placePicture(r, plane, region), r);
  }
  // Nearer a cropped edge than 8 % of what shows: kept 8 % from it, as a
  // text line is - a sign at the picture's very top moves down 9 px.
  const sign = placePicture(transformRect(2400, 1080, t, { left: 240 + 759, top: 170, width: 402, height: 78 }), plane, region);
  close(sign.top, 0.08 * 1080, 'sign');
  // Nothing cropped (a 16:9 player, no zoom): nothing moves, at an edge too.
  const flat = pictureRect(1920, 1080, 1920, 1080);
  const edge = { left: 10, top: 1040, width: 600, height: 38 };
  assert.deepEqual(placePicture(edge, flat, flat), edge);
});

test('a line in a cropped top bar moves down; one far down in a bar keeps at most 8 % of what shows under it', () => {
  const frame = pictureRect(2400, 1080, 1920, 1080);
  const t = pictureTransform(2400, 1080, frame, LETTERBOX, 1);
  const plane = transformRect(2400, 1080, t, frame);
  const region = intersectRect(plane, { left: 0, top: 0, width: 2400, height: 1080 });
  const top = placePicture(transformRect(2400, 1080, t, { left: 240 + 755, top: 44, width: 409, height: 78 }), plane, region);
  close(top.top, 44 * 1.34336, 'top');
  // 120 px above the frame's bottom: more than 8 % of 1080.
  const high = placePicture(transformRect(2400, 1080, t, { left: 960, top: 1080 - 120 - 78, width: 400, height: 78 }), plane, region);
  close(high.top + high.height, 1080 - 0.08 * 1080, 'bottom');
});

test('a line wider than what shows - a 4:3 picture filled, the line out into its side bars - is made smaller in its own shape, its bottom kept', () => {
  const frame = pictureRect(2400, 1080, 1920, 1080);
  const t = pictureTransform(2400, 1080, frame, PILLARBOX, 1);
  const plane = transformRect(2400, 1080, t, frame);
  const region = intersectRect(plane, { left: 0, top: 0, width: 2400, height: 1080 });
  const r = transformRect(2400, 1080, t, { left: 240 + 111, top: 950, width: 1697, height: 83 });
  assert.ok(r.width > 2400);
  const placed = placePicture(r, plane, region);
  assert.ok(placed.left >= 0 && placed.left + placed.width <= 2400, 'inside across');
  assert.ok(placed.top >= 0 && placed.top + placed.height <= 1080, 'inside up and down');
  close(placed.width / placed.height, r.width / r.height, 'shape');
  close(placed.left + placed.width / 2, r.left + r.width / 2, 'middle', 1);
});

test('while the controls show, the pictures low on the plane rise above them by a gap; a sign at the top stays, and none rises out of what shows', () => {
  const plane = { left: 0, top: -135, width: 2400, height: 1350 };
  const region = { left: 0, top: 0, width: 2400, height: 1080 };
  const line = { left: 896, top: 940, width: 608, height: 97.5 };
  const sign = { left: 900, top: 120, width: 500, height: 97.5 };
  // The controls cover 180 px: the line's bottom at 1080 - 180 - 8.
  close(pictureLift([line, sign], plane, region, 1080, 180), 1037.5 - (1080 - 180 - LIFT_GAP), 'lift');
  assert.equal(pictureLift([line, sign], plane, region, 1080, 0), 0);
  assert.equal(pictureLift([sign], plane, region, 1080, 180), 0);
  // Never out of the top of what shows.
  assert.equal(pictureLift([{ left: 0, top: 600, width: 10, height: 10 }], plane, region, 1080, 1070), 600);
});

test('fill is remembered on the device: across titles and reloads', () => {
  const store = new Map<string, string>();
  const g = globalThis as { window?: unknown };
  g.window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  };
  try {
    assert.equal(loadFill(), false);
    saveFill(true);
    assert.equal(store.get(FILL_KEY), '1');
    assert.equal(loadFill(), true);
    saveFill(false);
    assert.equal(loadFill(), false);
    assert.equal(store.has(FILL_KEY), false);
  } finally {
    delete g.window;
  }
});
