// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  IN_PLACE_TRIES,
  downgradeStep,
  isLadderQuality,
  leaveSource,
  mediaFallback,
  networkFallback,
  onTheFlyQuality,
  restorePosition,
  stallAction,
  stepDownNotice,
  type StallState,
  type StepDownWhy,
} from './playback.ts';
import { onTheFlyLadder, type PlayQuality } from './qualities.ts';

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
  assert.deepEqual(downgradeStep({ mode: 'transcode', quality: 'high', forcedTranscode: false }), { quality: 'medium', forceTranscode: false, why: 'step' });
  assert.deepEqual(downgradeStep({ mode: 'remux', quality: 'medium', forcedTranscode: true }), { quality: 'low', forceTranscode: true, why: 'step' });
  assert.equal(downgradeStep({ mode: 'transcode', quality: 'low', forcedTranscode: false }), null);
  assert.deepEqual(downgradeStep({ mode: 'passthrough', quality: 'high', forcedTranscode: false }), { quality: 'medium', forceTranscode: true, why: 'original-stall' });
});

// /play/info's on-the-fly qualities, as chino-stream names them.
const named = (labels: [string, string, string]): PlayQuality[] => ['high', 'medium', 'low'].map((name, i) => ({ name, label: labels[i] }));

test('a step down on a named ladder goes to the next rung with another name', () => {
  // A 720p original: high and medium encode one frame, "Medium (720p)".
  const ladder = onTheFlyLadder({ mode: 'transcode', listed: named(['Medium (720p)', 'Medium (720p)', 'Low (480p)']) });
  assert.deepEqual(downgradeStep({ mode: 'transcode', quality: 'high', forcedTranscode: false, ladder }), { quality: 'low', forceTranscode: false, why: 'step' });
  assert.deepEqual(downgradeStep({ mode: 'transcode', quality: 'medium', forcedTranscode: false, ladder }), { quality: 'low', forceTranscode: false, why: 'step' });
  assert.equal(downgradeStep({ mode: 'transcode', quality: 'low', forcedTranscode: false, ladder }), null);
  // A 360p original: one name, nowhere lower.
  const small = onTheFlyLadder({ mode: 'transcode', listed: named(['Lowest (360p)', 'Lowest (360p)', 'Lowest (360p)']) });
  assert.equal(downgradeStep({ mode: 'transcode', quality: 'high', forcedTranscode: false, ladder: small }), null);
  // A direct stream still moves onto the ladder at Medium first, then on by its names.
  const moved = onTheFlyLadder({ mode: 'remux', listed: named(['High (1080p)', 'Medium (720p)', 'Low (480p)']) });
  assert.deepEqual(downgradeStep({ mode: 'remux', quality: 'high', forcedTranscode: false, ladder: moved }), { quality: 'medium', forceTranscode: true, why: 'original-stall' });
  assert.deepEqual(downgradeStep({ mode: 'remux', quality: 'medium', forcedTranscode: true, ladder: moved }), { quality: 'low', forceTranscode: true, why: 'step' });
});

test('media errors: a packaged title asks again without HEVC, or gives up - never a forced transcode', () => {
  assert.deepEqual(mediaFallback({ mode: 'packaged', quality: 'high', forcedTranscode: false, caps: ['avc', 'hvc', 'aac'] }), { kind: 'drop-hevc' });
  assert.deepEqual(mediaFallback({ mode: 'packaged', quality: 'high', forcedTranscode: false, caps: ['avc', 'aac'] }), { kind: 'give-up' });
  assert.deepEqual(mediaFallback({ mode: 'passthrough', quality: 'high', forcedTranscode: false, caps: ['avc'] }), { kind: 'transcode' });
  assert.deepEqual(mediaFallback({ mode: null, quality: 'high', forcedTranscode: false, caps: [] }), { kind: 'transcode' });
  assert.deepEqual(mediaFallback({ mode: 'remux', quality: 'medium', forcedTranscode: true, caps: [] }), { kind: 'give-up' });
  assert.deepEqual(mediaFallback({ mode: 'transcode', quality: 'high', forcedTranscode: false, caps: [] }), { kind: 'give-up' });
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
  assert.deepEqual(mediaFallback({ mode: 'packaged', quality: 'high', forcedTranscode: false, caps: ['avc', 'hvc:1080', 'aac'] }), { kind: 'drop-hevc' });
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

const fragmentError = (s: Partial<Parameters<typeof networkFallback>[0]>) =>
  networkFallback({ mode: 'remux', quality: 'high', forcedTranscode: false, details: 'fragLoadError', status: 404, fatal: false, ...s });

test('a direct stream whose fragment is answered 404 moves onto the ladder at once, saying the original could not be streamed', () => {
  for (const mode of ['remux', 'passthrough'] as const) {
    const a = fragmentError({ mode });
    assert.equal(a.kind, 'transcode', mode);
    if (a.kind !== 'transcode') continue;
    assert.equal(a.quality, 'medium');
    assert.match(a.label, /→ Medium/);
    assert.equal(a.notice, 'original-error');
  }
  assert.equal(fragmentError({ fatal: true }).kind, 'transcode');
});

test('each move onto the ladder says why: the connection, or the original', () => {
  const stalled = stallAction(stall({ mode: 'remux' }));
  assert.equal(stalled.kind === 'reload' ? stalled.notice : null, 'original-stall');
  const error = fragmentError({});
  assert.equal(error.kind === 'transcode' ? error.notice : null, 'original-error');
  for (const why of ['original-stall', 'original-error', 'step', 'rung-error'] as StepDownWhy[]) {
    const line = stepDownNotice('Medium (720p)', why, 'High (1080p)');
    // A line in the viewer's words: no code, no cause it is not.
    assert.doesNotMatch(line, /\b(404|5\d\d)\b|unstable connection|adaptive streaming/i, line);
    // In words, or the name of the quality left.
    assert.match(line, /^Switched to Medium \(720p\) quality: (?:[a-z]|High \(1080p\) ).*\.$/, line);
  }
});

test("the notices of docs/chino, word for word, the quality by the server's name", () => {
  assert.equal(stepDownNotice('Medium (720p)', 'original-stall'), "Switched to Medium (720p) quality: the connection can't keep up with the original.");
  assert.equal(stepDownNotice('Low (480p)', 'original-error'), "Switched to Low (480p) quality: the original couldn't be streamed.");
  assert.equal(stepDownNotice('Low (480p)', 'step'), "Switched to Low (480p) quality: the connection can't keep up.");
  assert.equal(stepDownNotice('Low (480p)', 'rung-error', 'Medium (720p)'), "Switched to Low (480p) quality: Medium (720p) couldn't be streamed.");
});

test('a source left for another keeps the position from before its teardown, which sends the media back to 0:00', () => {
  const media = { currentTime: 512.4 };
  const calls: string[] = [];
  let kept = -1;
  const at = leaveSource(
    media,
    (t) => { kept = t; calls.push('keep'); },
    () => { media.currentTime = 0; calls.push('teardown'); },
  );
  assert.equal(at, 512.4);
  assert.equal(kept, 512.4);
  assert.deepEqual(calls, ['keep', 'teardown']);
  assert.equal(leaveSource(null, (t) => { kept = t; }, () => {}), 0);
});

test('a direct stream waits for hls.js\'s own retries on any other failure to load a fragment, then moves onto the ladder', () => {
  for (const s of [{ status: 503 }, { status: 0 }, { status: null }, { status: 502, details: 'fragLoadTimeOut' }]) {
    assert.equal(fragmentError(s).kind, 'keep', JSON.stringify(s));
    assert.equal(fragmentError({ ...s, fatal: true }).kind, 'transcode', JSON.stringify(s));
  }
});

test('a packaged title and a mode not known keep their handling of a fragment that failed', () => {
  for (const s of [{ mode: 'packaged' as const }, { mode: null }, { mode: 'packaged' as const, quality: 'v2' }]) {
    assert.deepEqual(fragmentError(s), { kind: 'keep' }, JSON.stringify(s));
    assert.deepEqual(fragmentError({ ...s, fatal: true, status: 503 }), { kind: 'keep' }, JSON.stringify(s));
  }
});

const FULL = named(['High (1080p)', 'Medium (720p)', 'Low (480p)']);

test("a rung of the ladder that can't be streamed steps down to the next, saying which couldn't be streamed", () => {
  const ladder = onTheFlyLadder({ mode: 'transcode', listed: FULL });
  // A 404 at once: the server can't make that segment, no retry changes it.
  const a = fragmentError({ mode: 'transcode', quality: 'medium', ladder });
  assert.equal(a.kind, 'step');
  if (a.kind !== 'step') return;
  assert.equal(a.quality, 'low');
  assert.equal(a.forceTranscode, false);
  assert.equal(a.previous, 'Medium (720p)');
  // As the player says it, the quality it went to by the ladder's name.
  assert.equal(
    stepDownNotice(ladder.find((e) => e.name === a.quality)!.label, a.notice, a.previous),
    "Switched to Low (480p) quality: Medium (720p) couldn't be streamed.",
  );
  assert.deepEqual(
    (({ kind, quality, previous }) => ({ kind, quality, previous }))(fragmentError({ mode: 'transcode', quality: 'high', ladder }) as { kind: string; quality: string; previous: string }),
    { kind: 'step', quality: 'medium', previous: 'High (1080p)' },
  );
  // Any other failure once hls.js's own retries ran out.
  for (const status of [503, 502, 504, 0, null]) {
    assert.equal(fragmentError({ mode: 'transcode', quality: 'medium', ladder, status }).kind, 'keep', String(status));
    assert.equal(fragmentError({ mode: 'transcode', quality: 'medium', ladder, status, fatal: true }).kind, 'step', String(status));
  }
  // A direct stream moved onto the ladder steps down on it, still forced.
  const moved = onTheFlyLadder({ mode: 'remux', listed: FULL });
  const m = fragmentError({ mode: 'remux', quality: 'medium', forcedTranscode: true, ladder: moved });
  assert.equal(m.kind, 'step');
  if (m.kind === 'step') {
    assert.equal(m.quality, 'low');
    assert.equal(m.forceTranscode, true);
    assert.equal(m.previous, 'Medium (720p)');
  }
});

test('past the last rung there is nowhere lower: the player tries on, then gives up', () => {
  const ladder = onTheFlyLadder({ mode: 'transcode', listed: FULL });
  assert.deepEqual(fragmentError({ mode: 'transcode', quality: 'low', ladder }), { kind: 'keep' });
  assert.deepEqual(fragmentError({ mode: 'transcode', quality: 'low', ladder, fatal: true, status: 503 }), { kind: 'keep' });
  // A 360p original: every rung reads the same, nothing lower.
  const small = onTheFlyLadder({ mode: 'transcode', listed: named(['Lowest (360p)', 'Lowest (360p)', 'Lowest (360p)']) });
  assert.deepEqual(fragmentError({ mode: 'transcode', quality: 'high', ladder: small }), { kind: 'keep' });
  // Not a rung of the ladder, or not a fragment: as before.
  assert.deepEqual(fragmentError({ mode: 'transcode', quality: 'auto', ladder }), { kind: 'keep' });
  assert.deepEqual(fragmentError({ mode: 'transcode', quality: 'medium', ladder, details: 'levelLoadError', fatal: true }), { kind: 'keep' });
});

test("a 720p original's high that can't be streamed goes past medium, which encodes the same frame", () => {
  const ladder = onTheFlyLadder({ mode: 'transcode', listed: named(['Medium (720p)', 'Medium (720p)', 'Low (480p)']) });
  const a = fragmentError({ mode: 'transcode', quality: 'high', ladder });
  assert.equal(a.kind === 'step' ? a.quality : null, 'low');
  assert.equal(a.kind === 'step' ? stepDownNotice('Low (480p)', a.notice, a.previous) : null, "Switched to Low (480p) quality: Medium (720p) couldn't be streamed.");
});

test('the rung left is named by its source where the server named it not; the fixed ladder where there is none', () => {
  // chino-stream names no high of an original of unknown size; the master of that source does.
  const unknown = onTheFlyLadder({ mode: 'transcode', listed: [{ name: 'high', label: '' }, FULL[1], FULL[2]] });
  const a = fragmentError({ mode: 'transcode', quality: 'high', ladder: unknown, playing: { q: 'high', name: 'High (1080p)', width: 1920, height: 1080 } });
  assert.equal(a.kind === 'step' ? a.previous : null, 'High (1080p)');
  // A level of another source names nothing of this one.
  const b = fragmentError({ mode: 'transcode', quality: 'high', ladder: unknown, playing: { q: 'medium', name: 'Medium (720p)' } });
  assert.equal(b.kind === 'step' ? b.previous : null, 'High');
  // No ladder: the fixed one, high, medium, low.
  const c = fragmentError({ mode: 'transcode', quality: 'high' });
  assert.equal(c.kind === 'step' ? c.quality : null, 'medium');
});

test('only a fragment that failed to load moves a direct stream: a playlist or the master does not', () => {
  for (const details of ['levelLoadError', 'manifestLoadError', 'audioTrackLoadError', 'keyLoadError', 'fragParsingError']) {
    assert.deepEqual(fragmentError({ details, fatal: true }), { kind: 'keep' }, details);
  }
});

test('three stalls step down a rung, named as the ladder names it, and move a direct stream onto the ladder on the stall line', () => {
  // As the player says it: the step, by the server's name for the rung it goes to.
  const noticeOf = (s: { mode: 'transcode' | 'remux'; quality: 'high' | 'medium'; forcedTranscode: boolean }, listed: PlayQuality[]) => {
    const ladder = onTheFlyLadder({ mode: s.mode, listed });
    const step = downgradeStep({ ...s, ladder });
    assert.ok(step);
    return stepDownNotice(ladder.find((e) => e.name === step.quality)!.label, step.why);
  };
  const full = named(['High (1080p)', 'Medium (720p)', 'Low (480p)']);
  assert.equal(noticeOf({ mode: 'transcode', quality: 'medium', forcedTranscode: false }, full), "Switched to Low (480p) quality: the connection can't keep up.");
  assert.equal(noticeOf({ mode: 'transcode', quality: 'high', forcedTranscode: false }, full), "Switched to Medium (720p) quality: the connection can't keep up.");
  assert.equal(noticeOf({ mode: 'remux', quality: 'medium', forcedTranscode: true }, full), "Switched to Low (480p) quality: the connection can't keep up.");
  assert.equal(
    noticeOf({ mode: 'remux', quality: 'high', forcedTranscode: false }, full),
    "Switched to Medium (720p) quality: the connection can't keep up with the original.",
  );
  // A 720p original's high steps past medium, which reads the same: the notice names a different picture.
  assert.equal(
    noticeOf({ mode: 'transcode', quality: 'high', forcedTranscode: false }, named(['Medium (720p)', 'Medium (720p)', 'Low (480p)'])),
    "Switched to Low (480p) quality: the connection can't keep up.",
  );
});

test('the Original picked again after a move onto the ladder is left as the original is, with its notice', () => {
  // A remux moved onto Medium, then the viewer picks "Original" (q=high),
  // which chino-stream stream-copies: forceTranscode stays on.
  const moved = { mode: 'remux' as const, quality: 'high', forcedTranscode: true };
  const ladder = onTheFlyLadder({ mode: 'remux', listed: named(['High (1080p)', 'Medium (720p)', 'Low (480p)']) });
  assert.equal(ladder[0].label, 'Original');
  const step = downgradeStep({ ...moved, ladder });
  assert.deepEqual(step, { quality: 'medium', forceTranscode: true, why: 'original-stall' });
  assert.equal(
    stepDownNotice(ladder.find((e) => e.name === step!.quality)!.label, step!.why),
    "Switched to Medium (720p) quality: the connection can't keep up with the original.",
  );
  // A hard stall, a fragment that can't be loaded, a decoder that refuses it: onto Medium, as from the original.
  const stalled = stallAction(stall(moved));
  assert.equal(stalled.kind, 'reload');
  if (stalled.kind === 'reload') {
    assert.equal(stalled.quality, 'medium');
    assert.equal(stalled.forceTranscode, true);
    assert.equal(stalled.notice, 'original-stall');
  }
  const error = fragmentError({ forcedTranscode: true });
  assert.equal(error.kind, 'transcode');
  assert.equal(error.kind === 'transcode' ? error.notice : null, 'original-error');
  assert.deepEqual(mediaFallback({ ...moved, caps: ['avc'] }), { kind: 'transcode' });
  // On the ladder's own rungs it is a step between qualities, as before.
  assert.deepEqual(downgradeStep({ ...moved, quality: 'medium', ladder }), { quality: 'low', forceTranscode: true, why: 'step' });
  assert.equal(stallAction(stall({ ...moved, quality: 'medium', bufferedAheadSec: 1 })).kind, 'nudge');
  assert.deepEqual(mediaFallback({ ...moved, quality: 'medium', caps: ['avc'] }), { kind: 'give-up' });
});
