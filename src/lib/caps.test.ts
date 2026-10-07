// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CODEC_PROBES,
  HLS_MIME,
  capsTokens,
  codecOf,
  decoderCheck,
  deviceCapsTokens,
  hasCodec,
  playsHlsNatively,
  withoutCodec,
} from './caps.ts';

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

test('the browser plays HLS itself only where hls.js cannot and a <video> can (iPhone Safari before ManagedMediaSource)', () => {
  const video = (answer: string) => ({ canPlayType: (m: string) => (m === HLS_MIME ? answer : '') });
  assert.equal(playsHlsNatively(false, video('maybe')), true);
  assert.equal(playsHlsNatively(false, video('probably')), true);
  // hls.js plays wherever it can: desktop Safari, and Chrome, say "maybe" to HLS too.
  assert.equal(playsHlsNatively(true, video('maybe')), false);
  assert.equal(playsHlsNatively(false, video('')), false, 'no HLS at all');
  assert.equal(playsHlsNatively(false, null), false);
});

test('natively: the codecs its own player decodes, by canPlayType, then native; with hls.js MSE answers and no native', () => {
  // An MSE that says yes to everything: not what plays natively.
  const mse = { isTypeSupported: () => true };
  const video = { canPlayType: (m: string) => (['avc', 'hvc', 'aac', 'mp3', 'ac3', 'eac3'].map(mime).includes(m) ? 'probably' : '') };
  assert.deepEqual(deviceCapsTokens(decoderCheck(mse, video, true), true), ['avc', 'hvc', 'aac', 'mp3', 'ac3', 'eac3', 'native']);
  assert.deepEqual(deviceCapsTokens(decoderCheck(mse, video, false), false), capsTokens(() => true));
  // Without MSE, as iPhone Safari is: canPlayType either way.
  assert.equal(deviceCapsTokens(decoderCheck(undefined, video, true), true).at(-1), 'native');
  // Never native alone: no caps at all, and the server's default set.
  assert.deepEqual(deviceCapsTokens(() => false, true), []);
  // No codec: the codec helpers leave it be.
  assert.equal(withoutCodec('avc,hvc,aac,eac3,native', 'hvc'), 'avc,aac,eac3,native');
  assert.equal(hasCodec('avc,aac,native', 'hvc'), false);
});

test('eac3 only where what plays decodes E-AC-3: MSE\'s answer with hls.js, canPlayType natively', () => {
  const ec3 = mime('eac3');
  // Chrome: MSE says no, whatever a <video> says.
  const no = { isTypeSupported: (m: string) => m !== ec3 };
  const yes = { canPlayType: () => 'probably' };
  assert.ok(!deviceCapsTokens(decoderCheck(no, yes, false), false).includes('eac3'));
  // Safari with MSE: yes.
  assert.ok(deviceCapsTokens(decoderCheck({ isTypeSupported: () => true }, null, false), false).includes('eac3'));
  // Natively: what canPlayType says, not MSE.
  const cannot = { canPlayType: (m: string) => (m === ec3 ? '' : 'probably') };
  assert.ok(!deviceCapsTokens(decoderCheck({ isTypeSupported: () => true }, cannot, true), true).includes('eac3'));
  assert.ok(deviceCapsTokens(decoderCheck(no, yes, true), true).includes('eac3'));
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
