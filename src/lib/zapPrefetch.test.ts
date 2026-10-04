// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { __test } from './zapPrefetch.ts';

const { pickVariantUri, pickAudioRenditionUri, resolveUrl } = __test;

// A packaged ladder's master as chino-stream serves it to a browser that
// decodes H.264 and E-AC-3: the stereo group's variants first, then the 5.1 group's.
const LADDER = `#EXTM3U
#EXT-X-INDEPENDENT-SEGMENTS
#EXT-X-MEDIA:TYPE=AUDIO,URI="a0/playlist.m3u8?q=medium",GROUP-ID="audio",LANGUAGE="en",NAME="English",DEFAULT=YES,AUTOSELECT=YES,CHANNELS="2"
#EXT-X-MEDIA:TYPE=AUDIO,URI="a1/playlist.m3u8?q=medium",GROUP-ID="audio",LANGUAGE="de",NAME="German",DEFAULT=NO,AUTOSELECT=YES,CHANNELS="2"
#EXT-X-MEDIA:TYPE=AUDIO,URI="a2/playlist.m3u8?q=medium",GROUP-ID="audio-surround",LANGUAGE="en",NAME="English 5.1",DEFAULT=YES,AUTOSELECT=YES,CHANNELS="6"
#EXT-X-STREAM-INF:BANDWIDTH=1505267,CODECS="avc1.64001f,mp4a.40.2",RESOLUTION=1280x720,AUDIO="audio",CLOSED-CAPTIONS=NONE
v1/playlist.m3u8?q=medium
#EXT-X-STREAM-INF:BANDWIDTH=706649,CODECS="avc1.64001e,mp4a.40.2",RESOLUTION=854x480,AUDIO="audio",CLOSED-CAPTIONS=NONE
v2/playlist.m3u8?q=medium
#EXT-X-STREAM-INF:BANDWIDTH=1762229,CODECS="avc1.64001f,ec-3",RESOLUTION=1280x720,AUDIO="audio-surround",CLOSED-CAPTIONS=NONE
v1/playlist.m3u8?q=medium
`;

test('the card starts on the first variant, and on the DEFAULT audio of its group - not every rendition', () => {
  assert.equal(pickVariantUri(LADDER), 'v1/playlist.m3u8?q=medium');
  assert.equal(pickAudioRenditionUri(LADDER), 'a0/playlist.m3u8?q=medium');
});

test('no DEFAULT in the group: its first rendition; a first variant of the 5.1 group: that group\'s', () => {
  assert.equal(pickAudioRenditionUri(LADDER.replace('DEFAULT=YES,AUTOSELECT=YES,CHANNELS="2"', 'DEFAULT=NO,AUTOSELECT=YES,CHANNELS="2"')), 'a0/playlist.m3u8?q=medium');
  const germanDefault = LADDER.replace('NAME="English",DEFAULT=YES', 'NAME="English",DEFAULT=NO').replace('NAME="German",DEFAULT=NO', 'NAME="German",DEFAULT=YES');
  assert.equal(pickAudioRenditionUri(germanDefault), 'a1/playlist.m3u8?q=medium');
  const surroundOnly = `#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,URI="a2/playlist.m3u8",GROUP-ID="audio-surround",LANGUAGE="en",NAME="English 5.1",DEFAULT=YES,CHANNELS="6"
#EXT-X-MEDIA:TYPE=AUDIO,URI="a0/playlist.m3u8",GROUP-ID="audio",LANGUAGE="en",NAME="English",DEFAULT=YES,CHANNELS="2"
#EXT-X-STREAM-INF:BANDWIDTH=1762229,CODECS="avc1.64001f,ec-3",RESOLUTION=1280x720,AUDIO="audio-surround"
v1/playlist.m3u8
`;
  assert.equal(pickAudioRenditionUri(surroundOnly), 'a2/playlist.m3u8');
});

test('audio in the video segments, or no master at all: nothing more to warm', () => {
  const muxed = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=4000000,CODECS="avc1.640028,mp4a.40.2",RESOLUTION=1920x1080
copy/index.m3u8
`;
  assert.equal(pickVariantUri(muxed), 'copy/index.m3u8');
  assert.equal(pickAudioRenditionUri(muxed), null);
  const media = `#EXTM3U
#EXT-X-TARGETDURATION:6
#EXTINF:6.0,
seg-00001.m4s
`;
  assert.equal(pickVariantUri(media), null);
  assert.equal(pickAudioRenditionUri(media), null);
});

test('a page-relative master: its variant, init and segments resolve to the API, not to the page', () => {
  const page = 'https://chino.example/chino/';
  const master = '/api/v1/items/1adde700-0000-4000-8000-000000000001/play/master.m3u8?stream=t&q=medium&caps=avc%2Caac';
  const variant = resolveUrl(master, 'v1/playlist.m3u8?stream=t&q=medium&caps=avc%2Caac', page);
  assert.equal(variant, 'https://chino.example/api/v1/items/1adde700-0000-4000-8000-000000000001/play/v1/playlist.m3u8?stream=t&q=medium&caps=avc%2Caac');
  assert.equal(resolveUrl(variant, 'seg-00002.m4s?stream=t', page), 'https://chino.example/api/v1/items/1adde700-0000-4000-8000-000000000001/play/v1/seg-00002.m4s?stream=t');
  assert.equal(resolveUrl(variant, 'https://cdn.example/x.m4s', page), 'https://cdn.example/x.m4s');
  assert.equal(resolveUrl('https://chino.example/a/master.m3u8', 'b.m3u8', page), 'https://chino.example/a/b.m3u8');
});
