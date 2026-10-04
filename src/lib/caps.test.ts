// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CODEC_PROBES, capsTokens, codecOf, decoderCheck, hasCodec, withoutCodec } from './caps.ts';

const mime = (token: string) => CODEC_PROBES.find((p) => p.token === token)!.mime;
const only = (...tokens: string[]) => {
  const yes = new Set(tokens.map(mime));
  return (m: string) => yes.has(m);
};

test('every codec the browser decodes, video and audio, in one order', () => {
  assert.deepEqual(capsTokens(() => true), ['avc', 'hvc', 'av1', 'vp9', 'aac', 'mp3', 'opus', 'ac3', 'eac3']);
  // Order is the probe list's, whatever order the answers come in.
  assert.deepEqual(capsTokens(only('eac3', 'aac', 'hvc', 'avc')), ['avc', 'hvc', 'aac', 'eac3']);
  assert.deepEqual(capsTokens(() => false), []);
});

test('ac3 and eac3 only where the browser says it decodes them; aacmc never', () => {
  // A browser that decodes Dolby audio (Safari, Edge with the OS codec).
  assert.deepEqual(capsTokens(only('avc', 'hvc', 'aac', 'mp3', 'ac3', 'eac3')), ['avc', 'hvc', 'aac', 'mp3', 'ac3', 'eac3']);
  // Chrome, mostly: no Dolby, no HEVC on some machines.
  assert.deepEqual(capsTokens(only('avc', 'av1', 'vp9', 'aac', 'mp3', 'opus')), ['avc', 'av1', 'vp9', 'aac', 'mp3', 'opus']);
  assert.ok(!capsTokens(() => true).includes('aacmc'));
});

test('with MSE the answer is isTypeSupported; without it (iPhone Safari) canPlayType, "maybe" included', () => {
  const asked: string[] = [];
  const mse = { isTypeSupported: (m: string) => (asked.push(m), m === mime('avc')) };
  const video = { canPlayType: () => 'probably' };
  const viaMse = decoderCheck(mse, video);
  assert.equal(viaMse(mime('avc')), true);
  assert.equal(viaMse(mime('hvc')), false, 'MSE says no: canPlayType is not asked');
  assert.deepEqual(asked, [mime('avc'), mime('hvc')]);

  const native = decoderCheck(undefined, { canPlayType: (m: string) => (m === mime('hvc') ? 'maybe' : m === mime('avc') ? 'probably' : '') });
  assert.deepEqual(capsTokens(native), ['avc', 'hvc']);
  assert.deepEqual(capsTokens(decoderCheck(undefined, null)), []);
});

test('a codec dropped or looked for at any height', () => {
  assert.equal(codecOf('hvc:1080'), 'hvc');
  assert.equal(codecOf(' AVC '), 'avc');
  assert.equal(withoutCodec('avc,hvc,aac', 'hvc'), 'avc,aac');
  assert.equal(withoutCodec('avc:2160,hvc:1080,aac,eac3', 'hvc'), 'avc:2160,aac,eac3');
  assert.equal(withoutCodec('avc,aac', 'hvc'), 'avc,aac');
  assert.equal(withoutCodec('hvc', 'hvc'), '');
  assert.equal(withoutCodec('', 'hvc'), '');
  assert.equal(hasCodec('avc,hvc:1080,aac', 'hvc'), true);
  assert.equal(hasCodec(['avc', 'hvc'], 'hvc'), true);
  assert.equal(hasCodec('avc,aac', 'hvc'), false);
  assert.equal(hasCodec('', 'hvc'), false);
});
