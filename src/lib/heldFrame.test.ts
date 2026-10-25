// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HELD_FRAME, frameToHold, releasesHeldFrame } from './heldFrame.ts';

test('a quality pick holds the picture on screen, at its size; nothing where none shows yet', () => {
  assert.deepEqual(frameToHold({ readyState: 4, videoWidth: 1920, videoHeight: 800 }), { width: 1920, height: 800 });
  assert.deepEqual(frameToHold({ readyState: 2, videoWidth: 1280, videoHeight: 720 }), { width: 1280, height: 720 });
  // Nothing decoded yet, or no picture at all.
  assert.equal(frameToHold({ readyState: 1, videoWidth: 1920, videoHeight: 1080 }), null);
  assert.equal(frameToHold({ readyState: 4, videoWidth: 0, videoHeight: 0 }), null);
  assert.equal(frameToHold({ readyState: 0, videoWidth: 0, videoHeight: 0 }), null);
});

test('the held picture stays until the new quality\'s first frame, never a black frame between', () => {
  // Held on source 3: its own events, as it is torn down, keep it.
  assert.equal(releasesHeldFrame(3, { source: 3, readyState: 4, seeking: false }), false);
  // The new source, before its first frame: kept.
  assert.equal(releasesHeldFrame(3, { source: 4, readyState: 0, seeking: false }), false);
  assert.equal(releasesHeldFrame(3, { source: 4, readyState: 1, seeking: false }), false);
  // Its first frame, but still seeking to where the old one was: kept.
  assert.equal(releasesHeldFrame(3, { source: 4, readyState: 2, seeking: true }), false);
  // Its first frame at the playhead: it goes.
  assert.equal(releasesHeldFrame(3, { source: 4, readyState: 2, seeking: false }), true);
  assert.equal(releasesHeldFrame(3, { source: 5, readyState: 4, seeking: false }), true);
  // Nothing held: nothing to release.
  assert.equal(releasesHeldFrame(null, { source: 4, readyState: 4, seeking: false }), false);
});

test('the held picture covers the video as it fits, and takes no presses', () => {
  const look = HELD_FRAME.split(' ');
  for (const c of ['absolute', 'inset-0', 'w-full', 'h-full', 'pointer-events-none', 'object-contain']) assert.ok(look.includes(c), c);
});
