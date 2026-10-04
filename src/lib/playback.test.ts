// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  IN_PLACE_TRIES,
  downgradeStep,
  isLadderQuality,
  mediaFallback,
  onTheFlyQuality,
  restorePosition,
  stallAction,
  type StallState,
} from './playback.ts';

const stall = (s: Partial<StallState>): StallState => ({
  mode: 'packaged',
  quality: 'high',
  forcedTranscode: false,
  positionSec: 512.4,
  bufferedAheadSec: 0,
  loading: true,
  tries: 0,
  ...s,
});

test('a rebuilt source goes back to the saved position, inside the title', () => {
  assert.equal(restorePosition(512.4, 888), 512.4);
  assert.equal(restorePosition(512.4), 512.4);
  assert.equal(restorePosition(900, 888), 887);
  assert.equal(restorePosition(512.4, NaN), 512.4);
  for (const saved of [null, undefined, 0, -3, NaN, Infinity]) assert.equal(restorePosition(saved, 888), null, String(saved));
});

test('a packaged title that stalls is retried in place, at its position', () => {
  assert.deepEqual(stallAction(stall({ bufferedAheadSec: 4 })), { kind: 'nudge', at: 512.4 });
  assert.deepEqual(stallAction(stall({ loading: false })), { kind: 'resume-loading', at: 512.4 });
  // Fetching, nothing buffered: the network is the bottleneck - wait, do not throw it away.
  assert.deepEqual(stallAction(stall({})), { kind: 'wait' });
  assert.deepEqual(stallAction(stall({ tries: 10 })), { kind: 'wait' });
});

test('a packaged title is rebuilt only after the tries in place - same quality, no forced transcode, same position', () => {
  const action = stallAction(stall({ bufferedAheadSec: 4, tries: IN_PLACE_TRIES }));
  assert.equal(action.kind, 'reload');
  assert.deepEqual(action, { kind: 'reload', at: 512.4, quality: 'high', forceTranscode: false, notice: null, label: 'reconnecting' });
  assert.equal(stallAction(stall({ loading: false, tries: IN_PLACE_TRIES - 1 })).kind, 'resume-loading');
});

test('a packaged title never switches to Medium or to a forced transcode on a stall', () => {
  for (const s of [{}, { bufferedAheadSec: 2 }, { loading: false }, { tries: 99, bufferedAheadSec: 1 }, { tries: 99, loading: false }]) {
    const a = stallAction(stall(s));
    if (a.kind === 'reload') {
      assert.equal(a.quality, 'high');
      assert.equal(a.forceTranscode, false);
    }
  }
});

test('a transcode is retried in place first too, then rebuilt at its quality and position', () => {
  assert.deepEqual(stallAction(stall({ mode: 'transcode', quality: 'medium', bufferedAheadSec: 1 })), { kind: 'nudge', at: 512.4 });
  assert.deepEqual(stallAction(stall({ mode: 'transcode', quality: 'medium', loading: false, tries: 3 })), {
    kind: 'reload', at: 512.4, quality: 'medium', forceTranscode: false, notice: null, label: 'reconnecting',
  });
  assert.deepEqual(stallAction(stall({ mode: 'remux', forcedTranscode: true, quality: 'low', loading: false, tries: 3 })), {
    kind: 'reload', at: 512.4, quality: 'low', forceTranscode: true, notice: null, label: 'reconnecting',
  });
});

test('a direct stream moves onto the transcode ladder at Medium - at the same position', () => {
  for (const mode of ['passthrough', 'remux', null] as const) {
    const a = stallAction(stall({ mode }));
    assert.equal(a.kind, 'reload');
    if (a.kind !== 'reload') continue;
    assert.equal(a.at, 512.4);
    assert.equal(a.quality, 'medium');
    assert.equal(a.forceTranscode, true);
    assert.match(a.label, /→ Medium/);
  }
});

test('repeated underruns: no step down for a packaged title; the ladder steps down; Low is the last rung', () => {
  assert.equal(downgradeStep({ mode: 'packaged', quality: 'high', forcedTranscode: false }), null);
  assert.deepEqual(downgradeStep({ mode: 'transcode', quality: 'high', forcedTranscode: false }), { quality: 'medium', forceTranscode: false });
  assert.deepEqual(downgradeStep({ mode: 'remux', quality: 'medium', forcedTranscode: true }), { quality: 'low', forceTranscode: true });
  assert.equal(downgradeStep({ mode: 'transcode', quality: 'low', forcedTranscode: false }), null);
  assert.deepEqual(downgradeStep({ mode: 'passthrough', quality: 'high', forcedTranscode: false }), { quality: 'medium', forceTranscode: true });
});

test('media errors: a packaged title asks again without HEVC, or gives up - never a forced transcode', () => {
  assert.deepEqual(mediaFallback({ mode: 'packaged', forcedTranscode: false, caps: ['avc', 'hvc', 'aac'] }), { kind: 'drop-hevc' });
  assert.deepEqual(mediaFallback({ mode: 'packaged', forcedTranscode: false, caps: ['avc', 'aac'] }), { kind: 'give-up' });
  assert.deepEqual(mediaFallback({ mode: 'passthrough', forcedTranscode: false, caps: ['avc'] }), { kind: 'transcode' });
  assert.deepEqual(mediaFallback({ mode: null, forcedTranscode: false, caps: [] }), { kind: 'transcode' });
  assert.deepEqual(mediaFallback({ mode: 'remux', forcedTranscode: true, caps: [] }), { kind: 'give-up' });
  assert.deepEqual(mediaFallback({ mode: 'transcode', forcedTranscode: false, caps: [] }), { kind: 'give-up' });
});

test('a packaged title on a rung the viewer picked, or on Auto, is rebuilt on it - and never stepped down by the player', () => {
  for (const quality of ['v2', 'auto', 'high']) {
    const a = stallAction(stall({ quality, bufferedAheadSec: 4, tries: IN_PLACE_TRIES }));
    assert.deepEqual(a, { kind: 'reload', at: 512.4, quality, forceTranscode: false, notice: null, label: 'reconnecting' }, quality);
    assert.equal(downgradeStep({ mode: 'packaged', quality, forcedTranscode: false }), null, quality);
  }
  // A rung's name is no transcode rung: nothing to step down from.
  assert.equal(downgradeStep({ mode: 'transcode', quality: 'v1', forcedTranscode: false }), null);
});

test('the transcode rungs are the ladder qualities; auto and a rung name are not', () => {
  for (const q of ['high', 'medium', 'low']) assert.equal(isLadderQuality(q), true, q);
  for (const q of ['auto', 'v0', 'v2', '']) assert.equal(isLadderQuality(q), false, q);
});

test('media errors on a packaged title asked with an HEVC height cap still ask again without HEVC', () => {
  assert.deepEqual(mediaFallback({ mode: 'packaged', forcedTranscode: false, caps: ['avc', 'hvc:1080', 'aac'] }), { kind: 'drop-hevc' });
});

test('a packaged q on a title now served on the fly goes back to high; anything else stays', () => {
  for (const mode of ['transcode', 'remux', 'passthrough'] as const) {
    assert.equal(onTheFlyQuality(mode, 'v2'), 'high', `${mode} v2`);
    assert.equal(onTheFlyQuality(mode, 'auto'), 'high', `${mode} auto`);
    for (const q of ['high', 'medium', 'low']) assert.equal(onTheFlyQuality(mode, q), null, `${mode} ${q}`);
  }
  assert.equal(onTheFlyQuality('packaged', 'v2'), null);
  assert.equal(onTheFlyQuality('packaged', 'auto'), null);
  assert.equal(onTheFlyQuality(null, 'v2'), null, 'not known yet');
  assert.equal(onTheFlyQuality(undefined, 'auto'), null);
});
