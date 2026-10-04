// The capability beacon: what this browser decodes, as the ?caps= that
// every playback request carries - /play/info, master.m3u8 and /prewarm,
// from the player, from Zap (its cards, their prefetch and its prewarm) and
// for the next episode - so chino-stream decides, filters a packaged
// ladder and warms the same way for each. Pure: caps.test.ts runs it; the
// browser's answers come from hooks/useDeviceCaps.ts.
//
// The vocabulary is chino-stream's ParseCaps (internal/play/ffprobe.go):
// video avc, hvc, av1, vp9, each with an optional ":<height>"; audio aac,
// mp3, opus, ac3, eac3 (ac3 and eac3 put a package's AC-3 / E-AC-3 groups in
// the master). A token that is missing means "not decoded here".
//
// `aacmc` (AAC beyond two channels) is never sent: Chrome answers yes to
// isTypeSupported('mp4a.40.2; channels="6"') and then rejects 5.1 fMP4
// segments with a bufferAppendError. A stereo downmix is the safe default.

export interface CodecProbe {
  token: string;
  /** The type the browser is asked about, with its codecs parameter. */
  mime: string;
}

/** What is asked, in the order the tokens are sent. */
export const CODEC_PROBES: readonly CodecProbe[] = [
  { token: 'avc', mime: 'video/mp4; codecs="avc1.640028"' },
  { token: 'hvc', mime: 'video/mp4; codecs="hvc1.1.6.L120.B0"' },
  { token: 'av1', mime: 'video/mp4; codecs="av01.0.05M.08"' },
  { token: 'vp9', mime: 'video/webm; codecs="vp9"' },
  { token: 'aac', mime: 'audio/mp4; codecs="mp4a.40.2"' },
  { token: 'mp3', mime: 'audio/mpeg' },
  { token: 'opus', mime: 'audio/mp4; codecs="opus"' },
  { token: 'ac3', mime: 'audio/mp4; codecs="ac-3"' },
  { token: 'eac3', mime: 'audio/mp4; codecs="ec-3"' },
];

/**
 * How a browser is asked whether it decodes a type. With MediaSource,
 * isTypeSupported: hls.js plays through it. Without - iPhone Safari, which
 * plays HLS itself (or, from iOS 17.1, hls.js through ManagedMediaSource,
 * on the same decoders) - a <video>'s canPlayType, where "maybe" counts
 * too: asking MSE there would say no to everything, send no caps, and the
 * server's default set has no HEVC.
 */
export function decoderCheck(
  mse: { isTypeSupported(type: string): boolean } | undefined,
  video: { canPlayType(type: string): string } | null,
): (mime: string) => boolean {
  if (mse && typeof mse.isTypeSupported === 'function') return (mime) => mse.isTypeSupported(mime);
  if (video) return (mime) => video.canPlayType(mime) !== '';
  return () => false;
}

/** The tokens of the codecs `decodes` says yes to, in CODEC_PROBES' order. */
export function capsTokens(decodes: (mime: string) => boolean): string[] {
  return CODEC_PROBES.filter((p) => decodes(p.mime)).map((p) => p.token);
}

/** The codec a token names: "hvc" for "hvc" and for "hvc:1080". */
export function codecOf(token: string): string {
  return token.split(':')[0].trim().toLowerCase();
}

/** Whether caps (a ?caps= value, or its tokens) carry a codec, at any height. */
export function hasCodec(caps: string | readonly string[], codec: string): boolean {
  const tokens = typeof caps === 'string' ? caps.split(',') : caps;
  return tokens.some((t) => codecOf(t) === codec);
}

/** caps without a codec, at whatever height it was sent. */
export function withoutCodec(caps: string, codec: string): string {
  return caps
    .split(',')
    .filter((t) => t.trim() !== '' && codecOf(t) !== codec)
    .join(',');
}
