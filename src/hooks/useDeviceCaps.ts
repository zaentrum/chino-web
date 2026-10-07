import { useEffect, useState } from 'react';
import Hls from 'hls.js';
import { decoderCheck, deviceCapsTokens, hasCodec, playsHlsNatively, withoutCodec } from '../lib/caps';

// This device's caps (lib/caps.ts), probed once per page and shared by
// everything that asks chino-stream for a title: the player, the Zap cards,
// the Zap prefetch and prewarm, the next-episode warm. The same string on
// every request, so the server serves and warms the same thing for each.
//
// Asked of what plays: hls.js where it can (MediaSource), else the
// browser's own HLS - the choice PlayerPage and ZapCard make - whose
// decoders a <video>'s canPlayType answers for, and which the caps then
// say with `native`: chino-stream serves that player each audio group as
// Apple's spec has them, and it picks the group it decodes itself.
//
// Optimistic first, then refined. The synchronous probe includes HEVC
// whenever isTypeSupported says yes (most Android phones, Safari, recent
// Chrome), so the first /info and master.m3u8 already get the HEVC rungs.
// MediaCapabilities.decodingInfo then asks whether the MSE pipeline really
// decodes it - Chrome on Windows says yes to isTypeSupported and cannot - and
// when it says no, hvc goes: whoever holds the caps asks again with them.
// Only ever a downgrade, and not without MediaSource (iPhone Safari) nor
// where the browser plays HLS itself: that question is about MSE, and some
// Safari versions answer no there to what canPlayType just confirmed.

let probed: string | null = null;
let native = false;
let refined: string | null = null;
let refining: Promise<string> | null = null;

function probe(): string {
  if (probed == null) {
    const mse = typeof MediaSource !== 'undefined' ? MediaSource : undefined;
    const video = typeof document !== 'undefined' ? document.createElement('video') : null;
    native = playsHlsNatively(Hls.isSupported(), video);
    probed = deviceCapsTokens(decoderCheck(mse, video, native), native).join(',');
  }
  return probed;
}

/** The caps as far as they are known now: refined once decodingInfo has answered, else the synchronous probe. */
export function deviceCaps(): string {
  return refined ?? probe();
}

// How long decodingInfo may take before the probe's answer stands.
const REFINE_TIMEOUT_MS = 1000;

/**
 * The caps once decodingInfo has answered - at once where there is nothing
 * to ask, and the probe's answer should it not answer within a second (the
 * home screen's Zap warm waits for this). Never rejects.
 */
export function refinedDeviceCaps(): Promise<string> {
  if (refining) return refining;
  const caps = probe();
  const mc = typeof navigator !== 'undefined' ? navigator.mediaCapabilities : undefined;
  if (!hasCodec(caps, 'hvc') || native || typeof MediaSource === 'undefined' || !mc?.decodingInfo) {
    refined = caps;
    refining = Promise.resolve(caps);
    return refining;
  }
  const answer = Promise.resolve().then(() =>
    mc.decodingInfo({
      type: 'media-source',
      video: {
        contentType: 'video/mp4; codecs="hvc1.1.6.L120.B0"',
        width: 1920,
        height: 1080,
        bitrate: 5_000_000,
        framerate: 24,
      },
    }),
  );
  const noAnswer = new Promise<null>((resolve) => setTimeout(() => resolve(null), REFINE_TIMEOUT_MS));
  refining = Promise.race([answer, noAnswer])
    // Only an explicit no drops hvc - not `smooth`: on real devices HEVC
    // plays fine where it is marked not smooth (a conservative heuristic).
    .then((res) => (res && res.supported === false ? withoutCodec(caps, 'hvc') : caps), () => caps)
    .then((c) => {
      refined = c;
      return c;
    });
  return refining;
}

/** deviceCaps() as state: the probe's answer at once, the refined one when it comes. */
export function useDeviceCaps(): string {
  const [caps, setCaps] = useState(deviceCaps);
  useEffect(() => {
    let live = true;
    void refinedDeviceCaps().then((c) => {
      if (live) setCaps(c);
    });
    return () => {
      live = false;
    };
  }, []);
  return caps;
}
