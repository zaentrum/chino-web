// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlaneObjects, followPlane, type PlaneContext } from './pgsPlane.ts';

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

test('a cleared area takes the pictures inside it away; a picture it only touches stays', () => {
  const { ctx } = fakeContext(1920, 1080);
  const objects = new PlaneObjects();
  followPlane(ctx, objects, () => undefined);
  ctx.putImageData(image(486, 78), 717, 968);
  ctx.putImageData(image(402, 78), 759, 170);
  ctx.clearRect(700, 900, 600, 180);
  assert.deepEqual(objects.pictures, [{ x: 759, y: 170, width: 402, height: 78 }]);
  ctx.clearRect(0, 0, 800, 200);
  assert.equal(objects.pictures.length, 1);
  // libpgs clears the union of what it drew before the next set.
  ctx.clearRect(717, 170, 486, 876);
  assert.deepEqual(objects.pictures, []);
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
