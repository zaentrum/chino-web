// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codecName, extraAudioTracks, extraHeading, extraInfo, extraQualities, playerCalls } from './playerMode.ts';
import { chosenQuality, packagedQualityMenu, playingLabel } from './qualities.ts';
import { audioLabels, audioRenditionFor } from './languages.ts';

const ITEM = '9c4e7a12-0000-4000-8000-000000000001';
const EXTRA = '1b5c2a8e-6f0d-4c3e-9a51-2d7f0c4b8e01';
const base = `/api/v1/items/${ITEM}/extras/${EXTRA}/play`;
// An extra's ladder as hls.js lists it: chino-stream's EXTRA_LADDER
// (720p and 480p H.264), the URIs carrying the master's query.
const V720 = { uri: `${base}/v0/playlist.m3u8?stream=tok&q=auto`, width: 1280, height: 720, bitrate: 2780004, videoCodec: 'avc1.4d401f', audioCodec: 'mp4a.40.2' };
const V480 = { uri: `${base}/v1/playlist.m3u8?stream=tok&q=auto`, width: 854, height: 480, bitrate: 1129412, videoCodec: 'avc1.4d401e', audioCodec: 'mp4a.40.2' };
const ENG = { name: 'English', lang: 'eng', default: true, channels: '2', audioCodec: 'mp4a.40.2' };

test('a title makes every call the player has', () => {
  assert.deepEqual(playerCalls('title'), { title: true, trickplay: true, progress: true, watched: true, events: 'session' });
});

test("an extra makes none of the title's calls, and reports only that it played", () => {
  // No item of its own (its page read the title), segments, /play/info or
  // subtitles - so no next episode, Up next or prewarm either - no
  // trickplay, no progress (no resume, nothing in Continue watching), no
  // watched; one trailer_play.
  assert.deepEqual(playerCalls('extra'), { title: false, trickplay: false, progress: false, watched: false, events: 'trailer_play' });
});

test("a mode not known makes none of the title's calls", () => {
  assert.deepEqual(playerCalls('trailer' as never), playerCalls('extra'));
  assert.deepEqual(playerCalls(undefined as never), playerCalls('extra'));
});

test("an extra's heading: the title's name and the extra's", () => {
  assert.equal(extraHeading('Sintel', 'Trailer'), 'Sintel · Trailer');
  assert.equal(extraHeading('Sintel', ''), 'Sintel');
  assert.equal(extraHeading(' Sintel ', ' Season 2 Trailer '), 'Sintel · Season 2 Trailer');
  assert.equal(extraHeading(undefined, 'Trailer'), 'Trailer');
  assert.equal(extraHeading(null, null), '');
});

test("an extra's quality menu: Auto, then its rungs by size, tallest first, each asked for by its directory", () => {
  const menu = extraQualities([V480, V720]);
  assert.deepEqual(menu?.map((e) => [e.name, e.label]), [['auto', 'Auto'], ['v0', '720p'], ['v1', '480p']]);
  assert.equal(menu?.[1].width, 1280);
  assert.equal(menu?.[1].codec, 'avc1.4d401f');
  // The menu a packaged title's /play/info gives: the player's menu, and the
  // entry it is on, for the q it asked with.
  const packaged = packagedQualityMenu({ mode: 'packaged', qualities: menu });
  assert.deepEqual(packaged, menu);
  assert.equal(chosenQuality(packaged!, 'auto').label, 'Auto');
  assert.equal(chosenQuality(packaged!, 'v1').label, '480p');
  // Auto names the rung that plays, by the variant's directory.
  assert.equal(playingLabel({ uri: V480.uri, width: 854, height: 480 }, packaged), '480p');
});

test('no quality menu for one rung or none, or for variants without a directory', () => {
  assert.equal(extraQualities([V720]), null);
  assert.equal(extraQualities([V720, { ...V720, bitrate: 1 }]), null, 'the same rung twice is one');
  assert.equal(extraQualities([]), null);
  assert.equal(extraQualities([{ uri: 'playlist.m3u8', width: 1280, height: 720 }, { width: 854, height: 480 }]), null);
});

test('a rung without a size is named by its directory', () => {
  assert.deepEqual(extraQualities([V720, { uri: `${base}/v1/playlist.m3u8`, bitrate: 500000 }])?.map((e) => e.label), ['Auto', '720p', 'v1']);
});

test("an extra's audio: one track per language and name, the same sound in two groups once", () => {
  const tracks = extraAudioTracks([ENG, { ...ENG, channels: '6', audioCodec: 'ec-3', default: false }, { name: 'Deutsch', lang: 'ger', channels: '2', audioCodec: 'mp4a.40.2' }]);
  assert.deepEqual(tracks, [
    { index: 0, codec: 'aac', language: 'eng', title: 'English', default: true, channels: 2 },
    { index: 1, codec: 'aac', language: 'ger', title: 'Deutsch', default: undefined, channels: 2 },
  ]);
  // Each picks its own rendition, as a title's /play/info track does.
  const renditions = [ENG, { name: 'Deutsch', lang: 'ger' }];
  assert.equal(audioRenditionFor(tracks[0], 0, renditions), 0);
  assert.equal(audioRenditionFor(tracks[1], 1, renditions), 1);
  // "en" and "eng" are one language.
  assert.equal(extraAudioTracks([ENG, { ...ENG, lang: 'en' }]).length, 1);
  assert.deepEqual(extraAudioTracks([]), []);
});

test("an extra's master for an E-AC-3 client: the 5.1 companion a track of its own, labelled by its layout", () => {
  // The one group chino-stream serves a client with eac3 in its caps.
  const group = [
    { name: 'English 5.1', lang: 'en', default: true, channels: '6', audioCodec: 'ec-3', groupId: 'audio-surround' },
    { name: 'English', lang: 'en', default: false, channels: '2', audioCodec: 'mp4a.40.2', groupId: 'audio-surround' },
  ];
  const tracks = extraAudioTracks(group);
  assert.deepEqual(tracks, [
    { index: 0, codec: 'eac3', language: 'en', title: 'English 5.1', default: true, channels: 6, group: 'audio-surround' },
    { index: 1, codec: 'aac', language: 'en', title: 'English', default: undefined, channels: 2, group: 'audio-surround' },
  ]);
  // The player's menu labels a group's member by its channels.
  assert.deepEqual(audioLabels(tracks.map((t) => ({ lang: t.language, name: t.title, channels: t.group ? t.channels : undefined }))), [
    'English 5.1',
    'English',
  ]);
  // Each picks its own rendition.
  assert.equal(audioRenditionFor(tracks[0], 0, group), 0);
  assert.equal(audioRenditionFor(tracks[1], 1, group), 1);
});

test("an extra's audio without a name, a language or channels", () => {
  assert.deepEqual(extraAudioTracks([{}]), [{ index: 0, codec: '', language: '', title: undefined, default: undefined, channels: undefined }]);
});

test('codecs as /play/info names them', () => {
  assert.equal(codecName('avc1.4d401f'), 'h264');
  assert.equal(codecName('hvc1.1.6.L120.B0'), 'hevc');
  assert.equal(codecName('av01.0.05M.08'), 'av1');
  assert.equal(codecName('vp09.00.10.08'), 'vp9');
  assert.equal(codecName('mp4a.40.2'), 'aac');
  assert.equal(codecName('mp4a.40.5'), 'aac');
  assert.equal(codecName('mp4a.69'), 'mp3');
  assert.equal(codecName('ac-3'), 'ac3');
  assert.equal(codecName('ec-3'), 'eac3');
  assert.equal(codecName('Opus'), 'opus');
  assert.equal(codecName(undefined), '');
});

test('an extra described from its master: packaged, its top rung, its menu and its audio', () => {
  const info = extraInfo({ variants: [V720, V480], audio: [ENG], durationMs: 52000 });
  assert.equal(info.mode, 'packaged');
  assert.equal(info.video_codec, 'h264');
  assert.equal(info.audio_codec, 'aac');
  assert.deepEqual([info.width, info.height], [1280, 720]);
  assert.equal(info.duration_ms, 52000);
  assert.deepEqual(info.qualities?.map((e) => e.name), ['auto', 'v0', 'v1']);
  assert.deepEqual(info.audio_tracks.map((t) => t.language), ['eng']);
  assert.ok(info.reason);
});

test('an extra before its master is in: packaged, with no menu, no audio and no size', () => {
  const info = extraInfo({ durationMs: undefined });
  assert.equal(info.mode, 'packaged');
  assert.equal(info.qualities, null);
  assert.deepEqual(info.audio_tracks, []);
  assert.deepEqual([info.width, info.height, info.duration_ms, info.video_codec], [0, 0, 0, '']);
  assert.equal(extraInfo({ durationMs: -1 }).duration_ms, 0);
});
