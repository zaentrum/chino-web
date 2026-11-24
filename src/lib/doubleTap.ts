// A double tap on the picture, on a touch screen (11.C54; docs/chino,
// playback: a double tap): two taps in the same half of the picture, the
// second within 0.3 seconds of the first, skip 10 seconds - back in the left
// half, forward in the right - and each further tap in that half within 0.6
// seconds of the last adds 10 more. As pure decisions: which taps count,
// which half a tap is in, what the taps so far add up to, where the skip
// lands, and what its mark says. Pure: doubleTap.test.ts runs it under
// node --test.

/** The second tap of a double tap comes within this (ms) of the first; a
 *  tap alone is a single tap once it has passed. */
export const SECOND_TAP_MS = 300;

/** A further tap adds up within this (ms) of the last, and the mark goes
 *  this long after the last. */
export const FURTHER_TAP_MS = 600;

/** What a double tap skips, and each further tap adds, in seconds. */
export const SKIP_SECONDS = 10;

/** How long before the end (seconds) a skip forward stops, so the skip
 *  itself never ends a title. */
export const BEFORE_END_SECONDS = 1;

/** A half of the picture: back in the left one, forward in the right. */
export type Half = 'left' | 'right';

/** The half a tap at `x` is in, of a picture that starts at `left` and is
 *  `width` wide (px): left of its middle the left half, else the right. */
export function halfAt(x: number, left: number, width: number): Half {
  return x < left + width / 2 ? 'left' : 'right';
}

/**
 * Whether a touch can be a tap of a double tap: one finger alone (the first
 * that went down), on the picture itself - not on the bars or a button -
 * with no menu open and no card over the picture, whose tap it then is.
 */
export function tapCounts({ primary, onPicture, menuOpen, cardShown }: {
  primary: boolean;
  onPicture: boolean;
  menuOpen: boolean;
  cardShown: boolean;
}): boolean {
  return primary && onPicture && !menuOpen && !cardShown;
}

/** The taps so far: the half they are in, when the last came (ms), and the
 *  seconds they add up to - 0 for one tap, which waits for a second. */
export interface Taps {
  half: Half;
  at: number;
  seconds: number;
}

export interface Tapped {
  /** The taps so far, this one counted; null when none count any more. */
  taps: Taps | null;
  /** This tap skips: to `taps.seconds` from where the first skip started. */
  skips: boolean;
  /** The tap before waited for a second one, and this is not it: it was a
   *  single tap, to be done before this one. */
  single: boolean;
}

/**
 * A tap on the picture, in `half` at `at` (ms), after the taps `before`. In
 * the half of the tap before and in time - 0.3 seconds after a first tap,
 * 0.6 after a tap that skipped - it skips, 10 seconds more than the taps
 * before. Else it is a first tap again: later, or in the other half, two
 * taps are two single taps.
 */
export function tap(before: Taps | null, half: Half, at: number): Tapped {
  if (before && before.half === half) {
    const within = before.seconds === 0 ? SECOND_TAP_MS : FURTHER_TAP_MS;
    if (at - before.at <= within) {
      return { taps: { half, at, seconds: before.seconds + SKIP_SECONDS }, skips: true, single: false };
    }
  }
  return { taps: { half, at, seconds: 0 }, skips: false, single: waits(before) };
}

/** A tap that doesn't count (tapCounts), after the taps `before`: it is no
 *  tap of a double tap and ends the taps so far. */
export function tapElsewhere(before: Taps | null): Tapped {
  return { taps: null, skips: false, single: waits(before) };
}

/** One tap, waiting for a second: a single tap if none comes. */
function waits(taps: Taps | null): boolean {
  return taps !== null && taps.seconds === 0;
}

/**
 * Where a skip lands (seconds): `seconds` back from `from` in the left
 * half, forward in the right, in a title `duration` long. Back never goes
 * before the start. Forward stops a second before the end, and never goes
 * back from a place later than that; without a known length it stays.
 */
export function skipTarget(from: number, half: Half, seconds: number, duration: number): number {
  if (half === 'left') return Math.max(0, from - seconds);
  if (!Number.isFinite(duration) || duration <= 0) return from;
  return Math.max(from, Math.min(duration - BEFORE_END_SECONDS, from + seconds));
}

/** The mark's words: the seconds so far with their sign, "−10 s" or
 *  "+30 s" - the seconds asked for, where the title's start or end cut the
 *  skip short too. Back has the minus sign (U+2212), not a hyphen. */
export function markWords(half: Half, seconds: number): string {
  return `${half === 'left' ? '−' : '+'}${seconds} s`;
}

/** The mark's look: in the middle of the half that was tapped (its place
 *  across is the half's), the icon over the words in the mono face, without
 *  a frame, the picture darkened under it alone. Taps pass through it. */
export const SKIP_MARK =
  'absolute top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none flex flex-col items-center gap-2 px-[18px] py-[14px] bg-black/60 text-chino-fg font-mono font-semibold text-[15px] leading-none whitespace-nowrap';

/** The mark's place across: the middle of its half. */
export const SKIP_MARK_PLACE: Record<Half, string> = { left: 'left-1/4', right: 'left-3/4' };
