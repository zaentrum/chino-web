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
