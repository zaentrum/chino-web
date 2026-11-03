// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlaneObjects, drawnCanvas, followPlane, pgsMode, type PlaneContext } from './pgsPlane.ts';

/** A 2D context as libpgs uses it, recording what reaches the canvas. */
function fakeContext(width: number, height: number) {
  const calls: string[] = [];
  const ctx: PlaneContext = {
    canvas: { width, height },
    putImageData: (...args: unknown[]) => void calls.push(`put ${args.slice(1).join(',')}`),
    clearRect: (x: number, y: number, w: number, h: number) => void calls.push(`clear ${x},${y},${w},${h}`),
  } as PlaneContext;
  return { ctx, calls };
}

const image = (width: number, height: number) => ({ width, height }) as ImageData;

test('each picture libpgs puts on the plane is followed where it lands, and drawn as before', () => {
  const { ctx, calls } = fakeContext(1920, 1080);
  const objects = new PlaneObjects();
  let changes = 0;
  followPlane(ctx, objects, () => changes++);
  ctx.putImageData(image(486, 78), 717, 968);
  ctx.putImageData(image(402, 78), 759, 170);
  assert.deepEqual(objects.pictures, [
    { x: 717, y: 968, width: 486, height: 78 },
    { x: 759, y: 170, width: 402, height: 78 },
  ]);
  assert.equal(objects.width, 1920);
  assert.equal(objects.height, 1080);
  assert.equal(changes, 2);
  assert.deepEqual(calls, ['put 717,968', 'put 759,170']);
});

test('a clear is everything drawn before gone: each picture forgotten, and cleared on the plane where it was drawn', () => {
  const { ctx, calls } = fakeContext(1920, 1080);
  const objects = new PlaneObjects();
  followPlane(ctx, objects, () => undefined);
  ctx.putImageData(image(486, 78), 717, 968);
  ctx.putImageData(image(402, 78), 759, 170);
  calls.length = 0;
  // libpgs clears the union of what it drew before the next set; a part of
  // it is all of it.
  ctx.clearRect(717, 900, 10, 10);
  assert.deepEqual(objects.pictures, []);
  assert.deepEqual(calls, ['clear 717,900,10,10', 'clear 717,968,486,78', 'clear 759,170,402,78']);
});

test('part of an image put (its dirty rectangle) lands at its own place; a plane of another size starts empty', () => {
  const { ctx } = fakeContext(1920, 1080);
  const objects = new PlaneObjects();
  followPlane(ctx, objects, () => undefined);
  ctx.putImageData(image(600, 100), 100, 900, 50, 10, 200, 60);
  assert.deepEqual(objects.pictures, [{ x: 150, y: 910, width: 200, height: 60 }]);
  // A dirty rectangle past the image's edge is cut at it.
  objects.reset();
  ctx.putImageData(image(600, 100), 100, 900, 500, 0, 300, 100);
  assert.deepEqual(objects.pictures, [{ x: 600, y: 900, width: 100, height: 100 }]);
  // The canvas resized to another plane: what was on it is gone.
  ctx.canvas.width = 1280;
  ctx.canvas.height = 720;
  ctx.putImageData(image(300, 50), 490, 640);
  assert.deepEqual(objects.pictures, [{ x: 490, y: 640, width: 300, height: 50 }]);
  assert.equal(objects.width, 1280);
});

test('a picture partly off the plane counts as its part on it; one wholly off is no picture', () => {
  const objects = new PlaneObjects();
  objects.put({ x: -20, y: 1050, width: 200, height: 60 }, 1920, 1080);
  assert.deepEqual(objects.pictures, [{ x: 0, y: 1050, width: 180, height: 30 }]);
  objects.put({ x: 2000, y: 10, width: 50, height: 50 }, 1920, 1080);
  assert.equal(objects.pictures.length, 1);
});

/** A .sup file, made here: display sets of PGS segments (no title's). */
function sup(sets: { at: number; objects: { x: number; y: number; width: number; height: number; crop?: [number, number, number, number] }[] }[]): ArrayBuffer {
  const bytes: number[] = [];
  const u16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
  const u32 = (n: number) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  const segment = (kind: number, at: number, data: number[]) => bytes.push(0x50, 0x47, ...u32(Math.round(at * 90000)), ...u32(0), kind, ...u16(data.length), ...data);
  sets.forEach((set, n) => {
    const pcs = [...u16(1920), ...u16(1080), 0x10, ...u16(n), 0x80, 0, 0, set.objects.length];
    set.objects.forEach((o, id) => {
      pcs.push(...u16(id), id, o.crop ? 0x80 : 0, ...u16(o.x), ...u16(o.y));
      if (o.crop) pcs.push(...o.crop.flatMap(u16));
    });
    segment(0x16, set.at, pcs);
    if (set.objects.length === 0) {
      segment(0x17, set.at, [1, 0, ...u16(0), ...u16(0), ...u16(1), ...u16(1)]);
      segment(0x80, set.at, []);
      return;
    }
    segment(0x17, set.at, [set.objects.length, ...set.objects.flatMap((o, id) => [id, ...u16(o.x), ...u16(o.y), ...u16(o.width), ...u16(o.height)])]);
    segment(0x14, set.at, [0, 0, 0, 16, 128, 128, 0, 1, 235, 128, 128, 255]);
    set.objects.forEach((o, id) => {
      // Every row one run of colour 1, then the end of the line.
      const row = o.width < 64 ? [0, 0x80 | o.width, 1] : [0, 0xc0 | (o.width >> 8), o.width & 0xff, 1];
      const rle = Array.from({ length: o.height }, () => [...row, 0, 0]).flat();
      const length = rle.length + 4;
      segment(0x15, set.at, [...u16(id), 0, 0xc0, (length >> 16) & 0xff, (length >> 8) & 0xff, length & 0xff, ...u16(o.width), ...u16(o.height), ...rle]);
    });
    segment(0x80, set.at, []);
  });
  return new Uint8Array(bytes).buffer;
}

test('libpgs itself: a cropped picture is gone with the next display set, never drawn again beside the new one', async () => {
  // What libpgs reaches for outside a browser: ImageData, and a frame to
  // draw in.
  const g = globalThis as Record<string, unknown>;
  const had = { ImageData: g.ImageData, requestAnimationFrame: g.requestAnimationFrame };
  g.ImageData = class {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    constructor(data: Uint8ClampedArray, width: number, height: number) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  };
  g.requestAnimationFrame = (f: (t: number) => void) => setTimeout(() => f(Date.now()), 0);
  try {
    const { PgsRenderer } = await import('libpgs');
    const { ctx, calls } = fakeContext(300, 150);
    const canvas = ctx.canvas as { width: number; height: number; style?: object; getContext?: () => PlaneContext };
    canvas.style = {};
    canvas.getContext = () => ctx;
    const objects = new PlaneObjects();
    followPlane(ctx, objects, () => undefined);
    const renderer = new PgsRenderer({ canvas: canvas as unknown as HTMLCanvasElement, mode: 'mainThread' as never });
    renderer.loadFromBuffer(
      sup([
        // An object shown in part: its columns 100 to 400.
        { at: 1, objects: [{ x: 700, y: 960, width: 500, height: 8, crop: [100, 0, 300, 8] }] },
        { at: 2, objects: [{ x: 760, y: 960, width: 400, height: 8 }] },
        { at: 3, objects: [] },
      ]),
    );
    const tick = () => new Promise((done) => setTimeout(done, 5));
    for (let i = 0; i < 100; i++) {
      await tick();
      renderer.renderAtTimestamp(-1);
      renderer.renderAtTimestamp(1.5);
      await tick();
      if (objects.pictures.length) break;
    }
    // libpgs draws the cropped part at the object's place plus the crop's.
    assert.deepEqual(objects.pictures, [{ x: 800, y: 960, width: 300, height: 8 }]);
    renderer.renderAtTimestamp(2.5);
    await tick();
    assert.deepEqual(objects.pictures, [{ x: 760, y: 960, width: 400, height: 8 }]);
    // Its own clear missed the part (it clears at the object's place), so
    // the player cleared it where it was.
    assert.ok(calls.includes('clear 800,960,300,8'), calls.join(' | '));
    renderer.renderAtTimestamp(3.5);
    await tick();
    assert.deepEqual(objects.pictures, []);
    renderer.dispose();
  } finally {
    g.ImageData = had.ImageData;
    g.requestAnimationFrame = had.requestAnimationFrame;
  }
});

test('libpgs runs as it chooses for the browser, but never into a canvas handed to a worker: a worker builds, this thread draws; old browsers and TVs all here', () => {
  const chrome = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
  const safari = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15';
  const firefox = 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0';
  assert.equal(pgsMode(chrome, true), 'workerWithoutOffscreenCanvas');
  assert.equal(pgsMode(safari, true), 'workerWithoutOffscreenCanvas');
  assert.equal(pgsMode(firefox, true), 'workerWithoutOffscreenCanvas');
  // No workers at all: this thread.
  assert.equal(pgsMode(chrome, false), 'mainThread');
  // Where libpgs itself chooses this thread.
  assert.equal(pgsMode('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/35.0.1916.153 Safari/537.36', true), 'mainThread');
  assert.equal(pgsMode('Mozilla/5.0 (X11; Linux x86_64; rv:24.0) Gecko/20100101 Firefox/24.0', true), 'mainThread');
  assert.equal(pgsMode('Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/538.2 (KHTML, like Gecko) Large Screen Safari/538.2 LG Browser/7.00.00(LGE; WEBOS1; 04.06.25; 1; DTV_W15U); webOS.TV-2015; LG NetCast.TV-2013 Compatible (LGE, WEBOS1, wireless)', true), 'mainThread');
  assert.equal(pgsMode('Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.106 Safari/537.36 WebAppManager', true), 'mainThread');
  assert.equal(pgsMode('Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36 WebAppManager', true), 'workerWithoutOffscreenCanvas');
});

test('the pictures\' canvas is only as large as what it shows: one line on a 4K screen, a line\'s pixels, never the whole player at its resolution', () => {
  // A 3840 x 2160 player at 2 pixels a CSS pixel, one line at its bottom.
  const one = drawnCanvas([{ left: 1320.5, top: 1900.25, width: 1200, height: 100 }], 3840, 2160, 2);
  assert.deepEqual(one, { left: 1319, top: 1899, width: 1203, height: 103, pixelWidth: 2406, pixelHeight: 206, scale: 2 });
  assert.ok(one.pixelWidth * one.pixelHeight * 4 < 3840 * 2160 * 4 * 4 / 50);
  // A sign at the top and a line at the bottom: one canvas round both.
  const two = drawnCanvas([{ left: 900, top: 100, width: 400, height: 60 }, { left: 700, top: 980, width: 800, height: 60 }], 1920, 1080, 1);
  assert.deepEqual([two.left, two.top, two.width, two.height], [699, 99, 802, 942]);
  // Kept within the player, and never wider than 3840 pixels.
  const edge = drawnCanvas([{ left: -20, top: 1060, width: 4000, height: 40 }], 1920, 1080, 4);
  assert.deepEqual([edge.left, edge.top, edge.width, edge.height], [0, 1059, 1920, 21]);
  assert.equal(edge.pixelWidth, 3840);
  // Nothing shown: nothing drawn.
  assert.deepEqual(drawnCanvas([], 1920, 1080, 2), { left: 0, top: 0, width: 0, height: 0, pixelWidth: 0, pixelHeight: 0, scale: 1 });
});
