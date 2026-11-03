// The pictures of a PGS subtitle on its plane, as libpgs draws them. libpgs
// draws a display set's pictures into a canvas the size of the plane the
// disc made them on (1920 x 1080 mostly); the player keeps that canvas off
// screen and follows what is drawn on it - each picture's place - so that
// it can draw each one over the video where it belongs (pictureFit.ts
// placePicture), not the plane as a whole. Pure: pgsPlane.test.ts runs it
// under node --test.

/** A rectangle on the plane, in its pixels. */
export interface PlaneRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The plane's size and the pictures on it now. */
export class PlaneObjects {
  width = 0;
  height = 0;
  private drawn: PlaneRect[] = [];

  /** The pictures on the plane now, in the order they were drawn. */
  get pictures(): readonly PlaneRect[] {
    return this.drawn;
  }

  /** A picture drawn at `r` on a plane `planeWidth` x `planeHeight`: a plane
   *  of another size is a new canvas, with nothing on it before. */
  put(r: PlaneRect, planeWidth: number, planeHeight: number): void {
    if (planeWidth !== this.width || planeHeight !== this.height) {
      this.drawn = [];
      this.width = planeWidth;
      this.height = planeHeight;
    }
    const x = Math.max(0, r.x);
    const y = Math.max(0, r.y);
    const right = Math.min(planeWidth, r.x + r.width);
    const bottom = Math.min(planeHeight, r.y + r.height);
    if (right <= x || bottom <= y) return;
    this.drawn.push({ x, y, width: right - x, height: bottom - y });
  }

  /** Nothing on the plane. */
  reset(): void {
    this.drawn = [];
  }
}

/** What of a 2D context libpgs draws with. */
export interface PlaneContext {
  readonly canvas: { width: number; height: number };
  putImageData(data: ImageData, dx: number, dy: number): void;
  putImageData(data: ImageData, dx: number, dy: number, dirtyX: number, dirtyY: number, dirtyWidth: number, dirtyHeight: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
}

/**
 * Has `objects` follow what is drawn with `ctx` - the plane canvas's own 2D
 * context, which libpgs asks for again and draws with: each picture it puts
 * on the plane - and calls `changed` after each. What is drawn is drawn as
 * before. libpgs clears what it drew before as it draws the next display
 * set, or none: a clear is all of it gone, every picture forgotten and its
 * own place on the plane cleared too - libpgs clears a cropped picture at
 * its object's place, not where it drew the cropped part, which stayed.
 */
export function followPlane(ctx: PlaneContext, objects: PlaneObjects, changed: () => void): void {
  const put = ctx.putImageData.bind(ctx) as (...args: unknown[]) => void;
  const clear = ctx.clearRect.bind(ctx);
  ctx.putImageData = ((data: ImageData, dx: number, dy: number, dirtyX?: number, dirtyY?: number, dirtyWidth?: number, dirtyHeight?: number) => {
    if (dirtyX === undefined || dirtyY === undefined || dirtyWidth === undefined || dirtyHeight === undefined) {
      put(data, dx, dy);
      objects.put({ x: dx, y: dy, width: data.width, height: data.height }, ctx.canvas.width, ctx.canvas.height);
    } else {
      put(data, dx, dy, dirtyX, dirtyY, dirtyWidth, dirtyHeight);
      // The dirty rectangle of the image data, normalised and within it,
      // drawn at dx, dy.
      const x0 = Math.max(0, Math.min(dirtyX, dirtyX + dirtyWidth));
      const y0 = Math.max(0, Math.min(dirtyY, dirtyY + dirtyHeight));
      const x1 = Math.min(data.width, Math.max(dirtyX, dirtyX + dirtyWidth));
      const y1 = Math.min(data.height, Math.max(dirtyY, dirtyY + dirtyHeight));
      objects.put({ x: dx + x0, y: dy + y0, width: x1 - x0, height: y1 - y0 }, ctx.canvas.width, ctx.canvas.height);
    }
    changed();
  }) as PlaneContext['putImageData'];
  ctx.clearRect = (x: number, y: number, w: number, h: number) => {
    clear(x, y, w, h);
    for (const p of objects.pictures) clear(p.x, p.y, p.width, p.height);
    objects.reset();
    changed();
  };
}

/** How libpgs runs, here: it builds a track's pictures in a worker and
 *  draws them in this thread, or does all of it in this thread. Never in a
 *  canvas handed to a worker (an OffscreenCanvas), where nobody sees what
 *  it draws where. */
export type PgsMode = 'workerWithoutOffscreenCanvas' | 'mainThread';

/**
 * The mode for a browser (its user agent, whether it has workers), as
 * libpgs's own choice (its BrowserSupport) but for the OffscreenCanvas:
 * this thread for a Chrome before 36, a Firefox before 25, an older webOS
 * TV (WebKit, or Chrome 68 and before, whose workers neither load nor
 * answer) and a browser without workers; a worker for the rest.
 */
export function pgsMode(userAgent: string, hasWorker: boolean): PgsMode {
  const chrome = /Chrome\/(\d+)/.exec(userAgent);
  const chromeVersion = chrome ? parseInt(chrome[1], 10) : undefined;
  const firefox = /Firefox\/(\d+)/.exec(userAgent);
  const firefoxVersion = firefox ? parseInt(firefox[1], 10) : undefined;
  const webOS = userAgent.includes('Web0S');
  if (chromeVersion !== undefined && chromeVersion < 36) return 'mainThread';
  if (firefoxVersion !== undefined && firefoxVersion < 25) return 'mainThread';
  if (webOS && chromeVersion === undefined) return 'mainThread';
  if (webOS && chromeVersion !== undefined && chromeVersion <= 68) return 'mainThread';
  return hasWorker ? 'workerWithoutOffscreenCanvas' : 'mainThread';
}

/** A rectangle in CSS pixels of the player. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The canvas the pictures are drawn on: where it sits in the player and
 *  its size there (CSS pixels), and its own size in pixels. */
export interface DrawnCanvas extends Box {
  pixelWidth: number;
  pixelHeight: number;
  /** Pixels per CSS pixel. */
  scale: number;
}

/**
 * The canvas for pictures drawn at `rects` (where they show, risen above the
 * controls included): just round them, whole pixels and one more at each
 * edge for the smoothing, within the player `boxWidth` x `boxHeight` - not
 * the whole player at the screen's resolution, 33 MB at 4K for one line.
 * `dpr` pixels per CSS pixel, at most `maxPixels` wide or high. Nothing
 * (0 x 0) where nothing shows.
 */
export function drawnCanvas(rects: readonly Box[], boxWidth: number, boxHeight: number, dpr: number, maxPixels = 3840): DrawnCanvas {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const r of rects) {
    if (!(r.width > 0 && r.height > 0)) continue;
    left = Math.min(left, r.left);
    top = Math.min(top, r.top);
    right = Math.max(right, r.left + r.width);
    bottom = Math.max(bottom, r.top + r.height);
  }
  left = Math.max(0, Math.floor(left) - 1);
  top = Math.max(0, Math.floor(top) - 1);
  right = Math.min(boxWidth, Math.ceil(right) + 1);
  bottom = Math.min(boxHeight, Math.ceil(bottom) + 1);
  if (!(right > left && bottom > top)) return { left: 0, top: 0, width: 0, height: 0, pixelWidth: 0, pixelHeight: 0, scale: 1 };
  const width = right - left;
  const height = bottom - top;
  const scale = Math.max(0.01, Math.min(dpr > 0 ? dpr : 1, maxPixels / width, maxPixels / height));
  return { left, top, width, height, pixelWidth: Math.ceil(width * scale), pixelHeight: Math.ceil(height * scale), scale };
}
