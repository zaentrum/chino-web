// The home hero's swipe, as pure decisions: which way a touch is going, how
// fast it left the glass, whether its release brings the next title, the
// previous one, or none - and which slides the hero keeps mounted, where.
// Pure: heroSwipe.test.ts runs it under node --test.

/** How far (px) a touch moves before it is a gesture: within it, a tap. */
export const SWIPE_SLOP_PX = 10;

/** The share of the hero's width a drag has to cover to change the title
 *  without a flick. */
export const SWIPE_DISTANCE_RATIO = 0.25;

/** A release at least this fast across (px/ms) - 400 px/s, the app's pager's
 *  snap velocity - changes the title after a short drag. */
export const SWIPE_FLICK_PX_PER_MS = 0.4;

/** The least drag (px) that changes the title, flicked or not. */
export const SWIPE_MIN_PX = 24;

/** The time (ms) before the release the velocity is measured over. */
export const VELOCITY_WINDOW_MS = 100;

export type GestureAxis = 'x' | 'y';

/**
 * Which way a touch is going, from how far it moved (dx, dy, px) since it
 * went down: null while it is within the slop - a tap still - then 'x' when
 * it went more across than down, else 'y': the page's own scroll, which the
 * browser does (touch-action: pan-y) and the hero leaves alone. Decided once,
 * on the first move past the slop; a tie goes to the page.
 */
export function gestureAxis(dx: number, dy: number, slop: number = SWIPE_SLOP_PX): GestureAxis | null {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < slop && ay < slop) return null;
  return ax > ay ? 'x' : 'y';
}

/** Where a dragging finger was across (x, px) at a time (t, ms). */
export interface Sample {
  t: number;
  x: number;
}

/**
 * The velocity across (px/ms, negative to the left) a finger left the glass
 * with: its travel over the samples of the last `windowMs` before `now`.
 * 0 when it stood still that long, or the window holds fewer than two.
 */
export function releaseVelocity(samples: readonly Sample[], now: number, windowMs: number = VELOCITY_WINDOW_MS): number {
  const recent = samples.filter((s) => now - s.t <= windowMs);
  if (recent.length < 2) return 0;
  const first = recent[0];
  const last = recent[recent.length - 1];
  const dt = last.t - first.t;
  return dt > 0 ? (last.x - first.x) / dt : 0;
}

export type SwipeOutcome = 'next' | 'prev' | 'none';

/** A drag across the hero as it ends: how far it went (px), its velocity
 *  across (px/ms), and the hero's width (px). */
export interface SwipeRelease {
  dx: number;
  dy: number;
  vx: number;
  width: number;
}

/**
 * What the release of a drag across the hero does: 'next' for one to the
 * left (the next title comes in from the right), 'prev' for one to the right,
 * 'none' to settle back on the title it started on. A drag changes the title
 * when it covered a quarter of the hero, or was flicked its way; never when
 * it ended up more down than across, went under SWIPE_MIN_PX, or was flung
 * back against itself - the viewer changed their mind.
 */
export function swipeDecision({ dx, dy, vx, width }: SwipeRelease): SwipeOutcome {
  const ax = Math.abs(dx);
  if (ax < SWIPE_MIN_PX || ax <= Math.abs(dy)) return 'none';
  const way: SwipeOutcome = dx < 0 ? 'next' : 'prev';
  if (Math.abs(vx) >= SWIPE_FLICK_PX_PER_MS) return Math.sign(vx) === Math.sign(dx) ? way : 'none';
  return ax >= Math.max(0, width) * SWIPE_DISTANCE_RATIO ? way : 'none';
}

/** `i` brought into 0..n-1, the pool going round. */
export function wrapIndex(i: number, n: number): number {
  return n > 0 ? ((i % n) + n) % n : 0;
}

/** A slide the hero keeps mounted: the pool index of its title, and where it
 *  sits in hero widths from the one on show (-1 left, 0 on show, 1 right). */
export interface SlidePlace {
  index: number;
  pos: number;
}

/** The title leaving the hero while another settles in, and the side it
 *  leaves by. */
export interface Leaving {
  index: number;
  pos: -1 | 1;
}

/**
 * The slides the hero keeps for a pool of `n` titles showing `idx`: that one
 * at 0, and the two a swipe brings in - the next at 1, the previous at -1 -
 * loaded before the finger drags them in. With two titles the other one is
 * both, and waits at `side`: the side the finger drags it in from. While a
 * title is leaving, the one on show and it, at the side it leaves by.
 */
export function heroSlides(n: number, idx: number, side: -1 | 1 = 1, leaving: Leaving | null = null): SlidePlace[] {
  if (n <= 0) return [];
  const cur = wrapIndex(idx, n);
  const shown: SlidePlace = { index: cur, pos: 0 };
  if (n === 1) return [shown];
  if (leaving && leaving.index !== cur && leaving.index >= 0 && leaving.index < n) {
    return [shown, { index: leaving.index, pos: leaving.pos }];
  }
  const next = wrapIndex(cur + 1, n);
  if (n === 2) return [shown, { index: next, pos: side }];
  return [shown, { index: next, pos: 1 }, { index: wrapIndex(cur - 1, n), pos: -1 }];
}
