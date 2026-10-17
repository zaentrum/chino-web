// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BANDWIDTH_EVERY_MS,
  BUDGETS,
  EventBudget,
  RebufferWatch,
  bandwidthPayload,
  firstFramePayload,
  levelSwitchPayload,
  playMode,
  renditionChanged,
  segmentKind,
  segmentPayload,
  sourceRequested,
  startBucket,
  startupClock,
  startupPhase,
  startupTimeoutPayload,
  type LoadTimes,
} from './qoe.ts';

const stats = (s: Partial<LoadTimes> & { start?: number; first?: number; end?: number }): LoadTimes => ({
  loaded: s.loaded ?? 0,
  total: s.total ?? 0,
  loading: { start: s.start ?? 0, first: s.first ?? 0, end: s.end ?? 0 },
});

test('the play mode is /play/info\'s, a forced transcode a transcode', () => {
  assert.equal(playMode('packaged', false), 'packaged');
  assert.equal(playMode('remux', false), 'remux');
  assert.equal(playMode('packaged', true), 'transcode');
  for (const m of [null, undefined, '', 'hls', 'Packaged']) assert.equal(playMode(m, false), 'unknown', String(m));
});

test('a fragment is the video\'s init segment, a video or an audio segment, or none', () => {
  assert.equal(segmentKind('main', 'initSegment'), 'init');
  assert.equal(segmentKind('main', 12), 'video');
  assert.equal(segmentKind('audio', 3), 'audio');
  assert.equal(segmentKind('audio', 'initSegment'), null);
  assert.equal(segmentKind('subtitle', 3), null);
});

test('a segment fetch reports its bytes, its size when known and its time so far', () => {
  assert.deepEqual(segmentPayload(null, 5000), { seg_loaded: null, seg_total: null, seg_load_ms: null, seg_ttfb_ms: null });
  assert.deepEqual(segmentPayload(stats({}), 5000), { seg_loaded: null, seg_total: null, seg_load_ms: null, seg_ttfb_ms: null });
  // In flight: 4 MB of 35 MB after 9.6 s, the first byte after 261 ms.
  assert.deepEqual(segmentPayload(stats({ loaded: 4_194_304, total: 35_000_000, start: 1000.4, first: 1261.2 }), 10_600), {
    seg_loaded: 4_194_304, seg_total: 35_000_000, seg_load_ms: 9600, seg_ttfb_ms: 261,
  });
  // Done, with no Content-Length: the size is not known, the time is to its last byte.
  assert.deepEqual(segmentPayload(stats({ loaded: 2_000_000, start: 1000, first: 1100, end: 3000 }), 99_999), {
    seg_loaded: 2_000_000, seg_total: null, seg_load_ms: 2000, seg_ttfb_ms: 100,
  });
});

test('a start goes through its phases: request, playlist, init, first segment, decode', () => {
  const c = startupClock(0, 100, true);
  assert.equal(startupPhase(c), 'request');
  sourceRequested(c, 250);
  assert.equal(startupPhase(c), 'playlist');
  c.playlist = true;
  assert.equal(startupPhase(c), 'init');
  c.videoAsked = true;
  assert.equal(startupPhase(c), 'first_segment');
  c.videoIn = true;
  assert.equal(startupPhase(c), 'decode');
  // An audio rendition apart: its first segment counts too.
  c.audioAsked = true;
  assert.equal(startupPhase(c), 'first_segment');
  c.audioIn = true;
  assert.equal(startupPhase(c), 'decode');
  // A source rebuilt before the first frame starts over, and is counted.
  sourceRequested(c, 4000);
  assert.equal(startupPhase(c), 'playlist');
  assert.equal(c.sources, 2);
  assert.equal(c.requestedAt, 4000);
});

test('the first frame: from the mount and from the request, the rendition, whether it resumed', () => {
  const c = startupClock(0, 1000, true);
  sourceRequested(c, 1180.2);
  const p = firstFramePayload(c, { at: 3412.6, position: 1534.2, rendition: { height: 1080, bitrate: 6_000_000 }, via: 'frame_callback' }, 'packaged');
  assert.deepEqual(p, {
    attempt: 0, startup_ms: 2413, request_ms: 2232, sources: 1, mode: 'packaged', height: 1080, bitrate: 6_000_000,
    resume: true, start_bucket: '5-30m', hidden: false, click_to_play: false, via: 'frame_callback',
  });
  // From the start, natively (no bitrate), a tab opened in the background, the viewer pressing play.
  const bg = startupClock(1, 0, false);
  bg.clicked = true;
  const q = firstFramePayload(bg, { at: 800, position: 0.04, rendition: { height: 720, bitrate: null }, via: 'timeupdate' }, 'unknown');
  assert.equal(q.request_ms, null);
  assert.equal(q.resume, false);
  assert.equal(q.start_bucket, '0');
  assert.equal(q.hidden, true);
  assert.equal(q.click_to_play, true);
  assert.equal(q.bitrate, null);
  assert.equal(q.attempt, 1);
});

test('a start position falls in a coarse bucket', () => {
  const cases: [number, string][] = [[0, '0'], [0.9, '0'], [NaN, '0'], [1, '<5m'], [299, '<5m'], [300, '5-30m'], [1799, '5-30m'], [1800, '30-60m'], [3599, '30-60m'], [3600, '60m+'], [9000, '60m+']];
  for (const [sec, bucket] of cases) assert.equal(startBucket(sec), bucket, String(sec));
});

test('a start given up on says what it waited for and the fetch in flight', () => {
  const c = startupClock(0, 0, true);
  sourceRequested(c, 300);
  c.playlist = c.videoAsked = true;
  const p = startupTimeoutPayload(c, 20_300, 'packaged', {
    kind: 'video', stats: stats({ loaded: 6_291_456, total: 35_651_584, start: 2300, first: 2560 }), rendition: { height: 2160, bitrate: 40_000_000 },
  });
  assert.deepEqual(p, {
    phase: 'first_segment', mode: 'packaged', sources: 1, seg_kind: 'video',
    seg_loaded: 6_291_456, seg_total: 35_651_584, seg_load_ms: 18_000, seg_ttfb_ms: 260, height: 2160, bitrate: 40_000_000,
  });
  // No stream token, so nothing asked for: nothing in flight.
  const none = startupTimeoutPayload(startupClock(0, 0, true), 20_000, 'unknown', null);
  assert.equal(none.phase, 'request');
  assert.equal(none.seg_kind, null);
  assert.equal(none.seg_loaded, null);
  assert.equal(none.height, null);
});

test('bandwidth: hls.js\'s estimate and the last video segment, none without an estimate', () => {
  for (const bps of [NaN, 0, -1, Infinity]) assert.equal(bandwidthPayload(bps, null, 'interval'), null, String(bps));
  const last = { stats: stats({ loaded: 4_500_000, start: 1000, first: 1250, end: 2500 }), durationSec: 6.006, rendition: { height: 1080, bitrate: 6_000_000 } };
  assert.deepEqual(bandwidthPayload(23_871_002.4, last, 'first_frame'), {
    bps: 23_871_002, frag_bytes: 4_500_000, frag_duration_ms: 6006, frag_load_ms: 1500, frag_ttfb_ms: 250, height: 1080, trigger: 'first_frame',
  });
  // A segment still loading has no size or time yet.
  const loading = { stats: stats({ loaded: 10, start: 1000 }), durationSec: 6, rendition: null };
  assert.deepEqual(bandwidthPayload(5e6, loading, 'interval'), {
    bps: 5_000_000, frag_bytes: null, frag_duration_ms: null, frag_load_ms: null, frag_ttfb_ms: null, height: null, trigger: 'interval',
  });
});

test('a level switch is a change of height or bitrate, never the first rendition', () => {
  const uhd = { height: 2160, bitrate: 40_000_000 };
  const hd = { height: 1080, bitrate: 6_000_000 };
  assert.equal(renditionChanged(null, hd), false);
  assert.equal(renditionChanged(hd, { ...hd }), false);
  assert.equal(renditionChanged(uhd, hd), true);
  assert.equal(renditionChanged(hd, { height: 1080, bitrate: 3_000_000 }), true);
  assert.deepEqual(levelSwitchPayload(uhd, hd, false, 'packaged'), {
    from_height: 2160, from_bitrate: 40_000_000, to_height: 1080, to_bitrate: 6_000_000, manual: false, mode: 'packaged',
  });
});

// Feeds a watch the timeupdates of a playhead moving from `from` for `sec`
// seconds, four a second, from `now` on; returns what the last one ended.
function play(w: RebufferWatch, now: number, from: number, sec: number) {
  let out = null;
  for (let i = 0; i <= sec * 4; i++) {
    const r = w.time(now + i * 250, from + i * 0.25, { paused: false, seeking: false, started: true });
    if (r) out = r;
  }
  return out;
}

test('no rebuffer before the first frame: the wait at the start is the startup', () => {
  const w = new RebufferWatch();
  w.time(0, 0, { paused: false, seeking: false, started: false });
  w.time(250, 0.25, { paused: false, seeking: false, started: false });
  w.waiting(300, 0.25, false, null);
  w.playing(2000);
  assert.equal(play(w, 2000, 0.25, 2), null);
});

test('a stall mid-play is one rebuffer, from waiting to playing, with the fetch it waited on', () => {
  const w = new RebufferWatch();
  assert.equal(play(w, 0, 0, 3), null);
  const seg = { kind: 'video' as const, stats: stats({ loaded: 1_000_000, total: 8_000_000, start: 2500, first: 2700 }) };
  w.waiting(3100, 3, false, seg);
  // The segment arrives, the element plays again, the playhead moves.
  seg.stats.loaded = 8_000_000;
  seg.stats.loading.end = 5400;
  w.playing(5500);
  const r = play(w, 5600, 3, 1);
  assert.deepEqual(r, {
    duration_ms: 2400, position: 3, cause: 'waiting', end: 'playing', seeked: false,
    seg_kind: 'video', seg_loaded: 8_000_000, seg_total: 8_000_000, seg_load_ms: 2900, seg_ttfb_ms: 200,
  });
  // Playing on: no second report.
  assert.equal(play(w, 7000, 4, 2), null);
});

test('timeupdates 15 ms apart still make a moving playhead, and a stall the creep does not end', () => {
  const w = new RebufferWatch();
  const on = { paused: false, seeking: false, started: true };
  let t = 0;
  let pos = 0;
  for (; t <= 2000; t += 15, pos += 0.015) w.time(t, pos, on);
  w.waiting(t, pos, false, null);
  // A frame of what was left plays out: the stall goes on.
  assert.equal(w.time(t + 30, pos + 0.03, on), null);
  w.playing(t + 1000);
  let r = null;
  for (let i = 1; i <= 10 && !r; i++) r = w.time(t + 1000 + i * 15, pos + 0.03 + i * 0.015, on);
  assert.equal(r?.duration_ms, 1000);
});

test('playing then waiting again at once is still one stall', () => {
  const w = new RebufferWatch();
  play(w, 0, 0, 2);
  w.waiting(2100, 2, false, null);
  w.playing(2600);
  w.waiting(2650, 2, false, null);
  w.playing(4100);
  const r = play(w, 4200, 2, 1);
  assert.equal(r?.duration_ms, 2000);
  assert.equal(r?.cause, 'waiting');
  assert.equal(r?.seg_kind, null);
});

test('the wait after a seek is no rebuffer; a seek inside a stall does not end it', () => {
  const w = new RebufferWatch();
  play(w, 0, 0, 2);
  w.seeking();
  w.waiting(2100, 600, true, null);
  w.waiting(2200, 600, false, null); // seeked, not playing yet
  w.playing(3000);
  assert.equal(play(w, 3000, 600, 2), null);
  // Now a stall, and the viewer seeks out of it.
  w.waiting(5100, 602, false, null);
  w.seeking();
  w.playing(7100);
  const r = play(w, 7200, 900, 1);
  assert.equal(r?.duration_ms, 2000);
  assert.equal(r?.seeked, true);
});

test('the viewer pausing ends a stall; the browser pausing with the viewer watching begins one', () => {
  const w = new RebufferWatch();
  play(w, 0, 0, 2);
  w.waiting(2100, 2, false, null);
  const r = w.paused(5100, true, 2, null);
  assert.equal(r?.duration_ms, 3000);
  assert.equal(r?.end, 'pause');
  // A pause of the viewer's with no stall reports nothing; after it a waiting
  // before the playhead moved is the wait to play again, not a stall.
  assert.equal(w.paused(6000, true, 2, null), null);
  w.waiting(9000, 2, false, null);
  w.playing(9500);
  assert.equal(play(w, 9500, 2, 2), null);
  // The browser pauses on an underrun.
  assert.equal(w.paused(12_000, false, 4, null), null);
  w.playing(13_500);
  const b = play(w, 13_600, 4, 1);
  assert.equal(b?.cause, 'pause');
  assert.equal(b?.duration_ms, 1500);
});

test('a playhead standing still with no waiting is a stall from when it last moved', () => {
  const w = new RebufferWatch();
  play(w, 0, 0, 2);
  w.stuck(2000, 2, null);
  // No playing comes: it ends when the playhead moves.
  const r = play(w, 12_000, 2, 1);
  assert.equal(r?.cause, 'stuck');
  assert.equal(r?.duration_ms, 10_250);
  // Not while a stall is on, and not before playback is under way.
  const fresh = new RebufferWatch();
  fresh.stuck(0, 0, null);
  assert.equal(play(fresh, 1000, 0, 1), null);
});

test('a stall goes on through a rebuilt source; a new source alone is none', () => {
  const w = new RebufferWatch();
  play(w, 0, 0, 2);
  w.source(); // a quality the viewer picked
  w.waiting(2200, 2, false, null);
  w.playing(3000);
  assert.equal(play(w, 3000, 2, 1), null);
  w.waiting(5000, 3, false, null);
  w.source(); // the stall watcher rebuilds it
  w.seeking(); // and the new source seeks back
  w.waiting(6000, 3, false, null);
  w.playing(9000);
  const r = play(w, 9100, 3, 1);
  assert.equal(r?.duration_ms, 4000);
});

test('the page hidden, left, or the player giving up ends a stall', () => {
  for (const how of ['hidden', 'exit', 'error'] as const) {
    const w = new RebufferWatch();
    play(w, 0, 0, 2);
    assert.equal(w.stop(2100, how), null, 'nothing to end');
    play(w, 2100, 2, 1);
    w.waiting(3300, 3, false, null);
    const r = w.stop(4300, how);
    assert.equal(r?.end, how);
    assert.equal(r?.duration_ms, 1000);
    // After it, playback is not under way until the playhead moves.
    w.paused(5000, false, 3, null);
    assert.equal(play(w, 6000, 3, 1), null);
  }
});

test('a session reports each kind within its budget', () => {
  const b = new EventBudget();
  assert.equal(b.allow('bandwidth', 0), true);
  assert.equal(b.allow('bandwidth', BANDWIDTH_EVERY_MS - 1), false);
  assert.equal(b.allow('bandwidth', BANDWIDTH_EVERY_MS), true);
  // The report at the first frame does not wait, and counts.
  assert.equal(b.allow('bandwidth', BANDWIDTH_EVERY_MS + 10, true), true);
  assert.equal(b.allow('bandwidth', BANDWIDTH_EVERY_MS + 20), false);
  for (let i = 0; i < BUDGETS.rebuffer.max; i++) assert.equal(b.allow('rebuffer', i), true);
  assert.equal(b.allow('rebuffer', 10_000), false);
  assert.equal(b.allow('level_switch', 0), true);
  assert.equal(b.allow('level_switch', 0), true);
});
