// Where the picture goes in the player: the title's own picture fitted to
// the screen, not its coded frame. Many files keep a whole 16:9 frame with
// a film's 2.39:1 picture letterboxed inside it, the black bars part of the
// video; on a screen of another shape the picture then floats in black on
// all four sides. /play/info's pictureArea says where the picture is in the
// frame - fractions of its width and height, the same for every rendition,
// the union of the picture over the whole title: outside it there is only
// black. Pure: pictureFit.test.ts runs it under node --test.
//
// - Fit (always, unless the viewer zooms): the picture as large as the
//   screen allows and centred. The bars are cropped where they would show;
//   the picture never is. Without a pictureArea nothing changes: the whole frame, no
//   transform, no fill - exactly as before.
// - Fill (zoom to fill): the picture covers the screen, its edges cropped.
//   Only for a title with a pictureArea, on a screen wider than tall, and
//   only where it changes something; remembered on the device.
//
// The video and every layer drawn over its frame (the held picture of a
// quality switch, a PGS subtitle's pictures) move together, by one
// transform about the middle of the player. A text subtitle is laid out on
// what shows of the frame; a picture subtitle follows the video, and where
// the transform would take it off screen - a line in a letterbox's bottom
// bar, the bar cropped - it moves just far enough to be whole on screen,
// keeping the gap the file gave it to the edge.

import type { Rect } from './subtitleLook.ts';

/** Where the picture is in the coded frame, as fractions of its width and
 *  height. */
export interface PictureArea {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** How far past an edge a measured area may reach (rounding) and be clamped
 *  to it. */
const EDGE_SLACK = 0.001;
/** A side under this share of the frame is no picture anyone measured
 *  right: such an area is ignored. */
const SMALLEST_SIDE = 0.2;
/** An area this close to the whole frame on both sides is the whole frame. */
const WHOLE_SIDE = 0.99;

/**
 * The pictureArea /play/info gives, checked: four finite numbers inside the
 * frame (a rounding past an edge clamped to it). Null - the whole frame, as
 * before - where it is absent, malformed, implausibly small (a side under a
 * fifth of the frame) or the whole frame anyway.
 */
export function pictureAreaOf(raw: unknown): PictureArea | null {
  if (!raw || typeof raw !== 'object') return null;
  const { left, top, width, height } = raw as Record<string, unknown>;
  const values = [left, top, width, height];
  if (!values.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  const [l0, t0, w0, h0] = values as number[];
  if (l0 < -EDGE_SLACK || t0 < -EDGE_SLACK || !(w0 > 0) || !(h0 > 0)) return null;
  if (l0 + w0 > 1 + EDGE_SLACK || t0 + h0 > 1 + EDGE_SLACK) return null;
  const l = Math.min(Math.max(l0, 0), 1);
  const t = Math.min(Math.max(t0, 0), 1);
  const w = Math.min(w0, 1 - l);
  const h = Math.min(h0, 1 - t);
  if (w < SMALLEST_SIDE || h < SMALLEST_SIDE) return null;
  if (w >= WHOLE_SIDE && h >= WHOLE_SIDE) return null;
  return { left: l, top: t, width: w, height: h };
}

/** By how much fill must be larger than fit to be worth offering. */
const FILL_STEP = 1.01;

/** The picture's scale fitted and filled, relative to the frame as the
 *  player lays it out; and whether fill applies at all. */
export interface PictureScales {
  fit: number;
  /** The fit where fill does not apply. */
  fill: number;
  /** Fill changes the picture: the screen is wider than tall, and filling
   *  it is larger than fitting it. */
  fills: boolean;
}

/** Scales this close to each other are the same scale (floating point). */
const SAME_SCALE = 1e-9;

/** No scale, no fill: the frame as the player lays it out. */
const AS_LAID_OUT: PictureScales = { fit: 1, fill: 1, fills: false };

/**
 * The scales of a player `boxWidth` x `boxHeight` showing `frame` - the coded
 * frame as it lays it out, whole and centred (pictureRect) - whose picture
 * is `area`. `side` is kept clear on the left and the right (a display
 * cutout's band): the fitted picture stays inside it, the filled one covers
 * the whole box. A title without an area has neither: the frame as laid out.
 */
export function pictureScales(boxWidth: number, boxHeight: number, frame: Rect, area: PictureArea | null, side = 0): PictureScales {
  if (!area) return AS_LAID_OUT;
  const pictureWidth = area.width * frame.width;
  const pictureHeight = area.height * frame.height;
  if (!(pictureWidth > 0 && pictureHeight > 0 && boxWidth > 0 && boxHeight > 0)) return AS_LAID_OUT;
  let fit = Math.min(Math.max(0, boxWidth - 2 * Math.max(0, side)) / pictureWidth, boxHeight / pictureHeight);
  if (!(fit > 0)) return AS_LAID_OUT;
  if (Math.abs(fit - 1) < SAME_SCALE) fit = 1;
  const fill = Math.max(boxWidth / pictureWidth, boxHeight / pictureHeight);
  const fills = boxWidth > boxHeight && fill > fit * FILL_STEP;
  return { fit, fill: fills ? fill : fit, fills };
}


/** A transform of everything drawn over the frame, about the middle of the
 *  player: scaled by `scale`, then moved by `x`, `y` (CSS pixels) - CSS's
 *  `translate(x, y) scale(scale)` with the origin in the middle. */
export interface PictureTransform {
  scale: number;
  x: number;
  y: number;
}

/** No transform: the frame as the player lays it out. */
export const NO_TRANSFORM: PictureTransform = { scale: 1, x: 0, y: 0 };

/** A move this small, in CSS pixels, is none (floating point). */
const NO_MOVE = 1e-6;

/**
 * The transform that shows `area` of `frame` at `zoom`: 0 fitted, 1 filled,
 * in between the scale between them (evenly on a log scale, as a zoom
 * goes), the picture's middle on the player's middle. None for a title
 * without an area, and none where it would change nothing.
 */
export function pictureTransform(
  boxWidth: number,
  boxHeight: number,
  frame: Rect,
  area: PictureArea | null,
  zoom: number,
  side = 0,
): PictureTransform {
  if (!area) return NO_TRANSFORM;
  const { fit, fill } = pictureScales(boxWidth, boxHeight, frame, area, side);
  let scale = fit * Math.pow(fill / fit, zoom);
  if (Math.abs(scale - 1) < SAME_SCALE) scale = 1;
  // The picture's middle, from the frame's - which is the player's: the
  // frame is laid out centred.
  const cx = (area.left + area.width / 2 - 0.5) * frame.width;
  const cy = (area.top + area.height / 2 - 0.5) * frame.height;
  const x = -scale * cx;
  const y = -scale * cy;
  return { scale, x: Math.abs(x) < NO_MOVE ? 0 : x, y: Math.abs(y) < NO_MOVE ? 0 : y };
}

/** `t` as CSS: what the video's style.transform is set to - nothing at all
 *  where it changes nothing. */
export function transformCss(t: PictureTransform): string {
  return Math.abs(t.scale - 1) < SAME_SCALE && Math.abs(t.x) < NO_MOVE && Math.abs(t.y) < NO_MOVE
    ? ''
    : `translate(${t.x}px, ${t.y}px) scale(${t.scale})`;
}

/** Where `t` takes `rect` (CSS pixels of a player `boxWidth` x `boxHeight`). */
export function transformRect(boxWidth: number, boxHeight: number, t: PictureTransform, rect: Rect): Rect {
  const cx = boxWidth / 2;
  const cy = boxHeight / 2;
  return {
    left: cx + t.scale * (rect.left - cx) + t.x,
    top: cy + t.scale * (rect.top - cy) + t.y,
    width: rect.width * t.scale,
    height: rect.height * t.scale,
  };
}

/** What two rectangles have in common; empty (0 wide or high) where none. */
export function intersectRect(a: Rect, b: Rect): Rect {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.left + a.width, b.left + b.width);
  const bottom = Math.min(a.top + a.height, b.top + b.height);
  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

/**
 * What shows of `frame` under `t`: the frame moved and scaled, within the
 * player less `side` at the left and the right. A text subtitle is laid out
 * on it as on the picture (subtitlePlace): 5.33 % of its height, 8 % of it
 * above its bottom, within 80 % of its width.
 */
export function subtitleRegion(boxWidth: number, boxHeight: number, frame: Rect, t: PictureTransform, side = 0): Rect {
  return intersectRect(transformRect(boxWidth, boxHeight, t, frame), {
    left: side,
    top: 0,
    width: Math.max(0, boxWidth - 2 * side),
    height: boxHeight,
  });
}

/** The most of a gap to an edge a moved picture subtitle keeps: shares of
 *  the region's height (above and below) and width (at the sides) - a text
 *  line's 8 % above the bottom, its 80 % of the width. */
const GAP_HEIGHT = 0.08;
const GAP_WIDTH = 0.1;

/**
 * Where a picture subtitle (one of a PGS subtitle's pictures) is drawn: at
 * `r`, where the video's transform takes it, unless that is not wholly
 * inside `region` (what shows) with the gap the file gave it to its plane's
 * edge (`plane`, transformed) - at most 8 % of the region's height or 10 %
 * of its width - to the region's edge. Then it moves just far enough: up
 * from a cropped bottom bar, down from a cropped top, in from a cropped
 * side. One wider or taller than that leaves is made smaller, in its own
 * shape: about its middle across, and from the edge on its own half of the
 * plane up or down (a line at the bottom keeps its bottom). Where nothing
 * is cropped it stays exactly where it is.
 */
export function placePicture(r: Rect, plane: Rect, region: Rect): Rect {
  if (!(region.width > 0 && region.height > 0 && r.width > 0 && r.height > 0)) return r;
  const keep = (gap: number, most: number) => Math.min(Math.max(gap, 0), most);
  const mostV = GAP_HEIGHT * region.height;
  const mostH = GAP_WIDTH * region.width;
  const roomLeft = region.left + keep(r.left - plane.left, mostH);
  const roomRight = region.left + region.width - keep(plane.left + plane.width - (r.left + r.width), mostH);
  const roomTop = region.top + keep(r.top - plane.top, mostV);
  const roomBottom = region.top + region.height - keep(plane.top + plane.height - (r.top + r.height), mostV);
  let { left, top, width, height } = r;
  const shrink = Math.min(1, (roomRight - roomLeft) / width, (roomBottom - roomTop) / height);
  if (shrink > 0 && shrink < 1) {
    const lower = top + height / 2 > plane.top + plane.height / 2;
    left += (width * (1 - shrink)) / 2;
    if (lower) top += height * (1 - shrink);
    width *= shrink;
    height *= shrink;
  }
  if (top + height > roomBottom) top = roomBottom - height;
  if (top < roomTop) top = roomTop;
  if (left + width > roomRight) left = roomRight - width;
  if (left < roomLeft) left = roomLeft;
  return { left, top, width, height };
}

/** The gap a picture subtitle keeps above the controls it rises over. */
export const LIFT_GAP = 8;

/**
 * How far the picture subtitles in the lower half of `plane` (transformed)
 * rise while the controls show: so that the lowest of them ends LIFT_GAP
 * above the controls, which cover `clear` CSS pixels at the bottom of a
 * player `boxHeight` high - never so far that one of them leaves `region`
 * at its top. 0 while the controls are hidden (`clear` 0) or none is low.
 * The pictures in the upper half stay where they are.
 */
export function pictureLift(placed: readonly Rect[], plane: Rect, region: Rect, boxHeight: number, clear: number): number {
  if (!(clear > 0)) return 0;
  const middle = plane.top + plane.height / 2;
  let lowest = Number.NEGATIVE_INFINITY;
  let room = Number.POSITIVE_INFINITY;
  for (const r of placed) {
    if (!isLower(r, middle)) continue;
    lowest = Math.max(lowest, r.top + r.height);
    room = Math.min(room, r.top - region.top);
  }
  if (lowest === Number.NEGATIVE_INFINITY) return 0;
  const rise = lowest - (boxHeight - clear - LIFT_GAP);
  return Math.max(0, Math.min(rise, Math.max(0, room)));
}

/** Whether a picture lies in the lower half of its plane (whose middle is
 *  `middle`): what rises above the controls. */
export function isLower(r: Rect, middle: number): boolean {
  return r.top + r.height / 2 > middle;
}

/** The fill button's name: it zooms the picture until it fills the screen,
 *  and is pressed while it does (aria-pressed) - one name for both, as a
 *  toggle has; never "Fill the screen" beside "Fullscreen". */
export const FILL_SCREEN = 'Zoom to fill';

/** Where the device keeps the viewer's fill (zoom to fill), across titles
 *  and reloads: '1' filled; anything else fitted. */
export const FILL_KEY = 'chino:picture:fill';

/** Whether the viewer filled the screen the last time they chose. */
export function loadFill(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(FILL_KEY) === '1';
  } catch {
    return false;
  }
}

/** Keeps the viewer's choice on the device. */
export function saveFill(fill: boolean): void {
  try {
    if (typeof window === 'undefined') return;
    if (fill) window.localStorage.setItem(FILL_KEY, '1');
    else window.localStorage.removeItem(FILL_KEY);
  } catch {
    /* storage off: the choice holds for this page */
  }
}
