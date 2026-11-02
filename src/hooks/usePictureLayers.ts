import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { PgsRenderer } from 'libpgs';
// Vite resolves this to an emitted asset URL; the worker file is already an
// IIFE so it loads via `new Worker(url)` with no extra glue. Keeps libpgs's
// worker out of the main bundle.
import libpgsWorkerUrl from 'libpgs/dist/libpgs.worker.js?url';
import { pictureRect, type Rect } from '../lib/subtitleLook';
import {
  NO_TRANSFORM,
  intersectRect,
  isLower,
  loadFill,
  pictureLift,
  pictureScales,
  pictureTransform,
  placePicture,
  saveFill,
  subtitleRegion,
  transformCss,
  transformRect,
  type PictureArea,
  type PictureTransform,
} from '../lib/pictureFit';
import { PlaneObjects, followPlane, type PlaneContext } from '../lib/pgsPlane';

/** How long the picture takes to zoom to fill or back (the fill button). */
const ZOOM_MS = 250;
/** How long a picture subtitle takes to rise above the controls and come
 *  back down: the controls' own pace (SubtitleOverlay's CONTROLS_PACE). */
const LIFT_MS = 150;
/** The widest the canvas of a PGS subtitle's pictures gets, in pixels. */
const MAX_CANVAS_WIDTH = 3840;

/** libpgs builds the subtitle's pictures in its worker and draws them in
 *  this thread, onto the plane canvas the player follows (lib/pgsPlane.ts) -
 *  never into a canvas handed to the worker, where nobody sees what it draws
 *  where. */
const DRAWN_HERE = 'workerWithoutOffscreenCanvas' as unknown as NonNullable<ConstructorParameters<typeof PgsRenderer>[0]['mode']>;

interface Sizes {
  boxWidth: number;
  boxHeight: number;
  videoWidth: number;
  videoHeight: number;
}

interface Geometry {
  boxWidth: number;
  boxHeight: number;
  frame: Rect;
  area: PictureArea | null;
  /** The picture's size is known: the transform applies. */
  known: boolean;
}

const easeInOut = (p: number) => p * p * (3 - 2 * p);

const reducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** A value moved to `to` over `ms`, `onFrame` on each step; at once where
 *  motion is reduced. Returns how to stop it. */
function animate(value: { current: number }, to: number, ms: number, onFrame: () => void): () => void {
  const from = value.current;
  if (from === to || reducedMotion() || typeof requestAnimationFrame === 'undefined') {
    value.current = to;
    onFrame();
    return () => undefined;
  }
  const start = performance.now();
  let frame = 0;
  const step = (now: number) => {
    const p = Math.min(1, (now - start) / ms);
    value.current = from + (to - from) * easeInOut(p);
    onFrame();
    if (p < 1) frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
  return () => cancelAnimationFrame(frame);
}

export interface PictureLayersInput {
  /** The <video> is in the page. */
  mounted: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  /** The held picture of a quality switch: moved with the video. */
  heldFrameRef: RefObject<HTMLCanvasElement | null>;
  /** The canvas a PGS subtitle's pictures are drawn on, over the player. */
  pgsCanvasRef: RefObject<HTMLCanvasElement | null>;
  /** Where the picture is in the frame (/play/info, pictureFit.ts); null for
   *  the whole frame. */
  area: PictureArea | null;
  /** The PGS subtitle on, by its id and URL; null where none is. */
  pgs: { id: string; url: string } | null;
  /** What the controls cover at the player's bottom, in CSS pixels, while
   *  they show; 0 while they are hidden. */
  clear: number;
}

export interface PictureLayers {
  /** What shows of the frame: where a text subtitle is laid out. */
  region: Rect;
  /** The player's height. */
  boxHeight: number;
  /** Fill changes the picture here: the fill button shows. */
  fills: boolean;
  /** The viewer's choice: fill the screen, where fill changes the picture. */
  fill: boolean;
  /** Fill, or fit again: remembered on the device. */
  toggleFill: () => void;
}

/**
 * The picture and what is drawn over it, as pictureFit.ts places them: the
 * video and the held picture moved and scaled together - fitted, or filled
 * where the viewer chose it - the region a text subtitle is laid out on,
 * and a PGS subtitle's pictures each drawn where it belongs, whole on
 * screen and above the controls while they show. Follows the player's
 * size, the picture's own (a rendition of another shape) and the viewer's
 * fill; zooms to fill and back in a quarter of a second.
 */
export function usePictureLayers({ mounted, videoRef, heldFrameRef, pgsCanvasRef, area, pgs, clear }: PictureLayersInput): PictureLayers {
  const [sizes, setSizes] = useState<Sizes>({ boxWidth: 0, boxHeight: 0, videoWidth: 0, videoHeight: 0 });
  useEffect(() => {
    const v = videoRef.current;
    if (!mounted || !v) return;
    const measure = () =>
      setSizes((prev) => {
        // A source being built again (a quality pick) has no size for a
        // moment: the picture keeps the last one, so neither it nor the
        // picture held over it moves.
        const shown = v.videoWidth > 0 && v.videoHeight > 0;
        const next = {
          boxWidth: v.clientWidth,
          boxHeight: v.clientHeight,
          videoWidth: shown ? v.videoWidth : prev.videoWidth,
          videoHeight: shown ? v.videoHeight : prev.videoHeight,
        };
        return prev.boxWidth === next.boxWidth &&
          prev.boxHeight === next.boxHeight &&
          prev.videoWidth === next.videoWidth &&
          prev.videoHeight === next.videoHeight
          ? prev
          : next;
      });
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(v);
    // The picture's own size: known with the metadata, and changes with a
    // rendition of another shape.
    v.addEventListener('loadedmetadata', measure);
    v.addEventListener('resize', measure);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      v.removeEventListener('loadedmetadata', measure);
      v.removeEventListener('resize', measure);
      window.removeEventListener('resize', measure);
    };
  }, [mounted, videoRef]);

  const [fill, setFill] = useState(loadFill);
  const fillRef = useRef(fill);
  // Whether fill changes the picture now, for the button's press.
  const fillsRef = useRef(false);
  // The next change of the picture comes from the fill button: it zooms.
  // Any other - a resize, a rendition - is made at once.
  const zoomNext = useRef(false);
  const toggleFill = useCallback(() => {
    const next = !fillRef.current;
    fillRef.current = next;
    saveFill(next);
    zoomNext.current = fillsRef.current;
    setFill(next);
  }, []);

  const { boxWidth, boxHeight, videoWidth, videoHeight } = sizes;
  const known = boxWidth > 0 && boxHeight > 0 && videoWidth > 0 && videoHeight > 0;
  const frame = useMemo(() => pictureRect(boxWidth, boxHeight, videoWidth, videoHeight), [boxWidth, boxHeight, videoWidth, videoHeight]);
  const usedArea = known ? area : null;
  const scales = pictureScales(boxWidth, boxHeight, frame, usedArea);
  fillsRef.current = known && scales.fills;
  const zoom = fill && scales.fills ? 1 : 0;
  const target = known ? pictureTransform(boxWidth, boxHeight, frame, usedArea, zoom) : NO_TRANSFORM;
  const region = subtitleRegion(boxWidth, boxHeight, frame, target);

  // What the layers are drawn with: the latest geometry, the zoom on screen
  // (0 fitted, 1 filled, between while it zooms) and what the controls
  // cover as the subtitle rises.
  const geometry = useRef<Geometry>({ boxWidth: 0, boxHeight: 0, frame, area: null, known: false });
  const zoomShown = useRef(zoom);
  const clearShown = useRef(clear);
  const planeRef = useRef<{ objects: PlaneObjects; canvas: HTMLCanvasElement } | null>(null);

  const transformNow = (): PictureTransform => {
    const g = geometry.current;
    return g.known ? pictureTransform(g.boxWidth, g.boxHeight, g.frame, g.area, zoomShown.current) : NO_TRANSFORM;
  };

  // A PGS subtitle's pictures, each where it belongs: the plane fitted into
  // the player as libpgs fits it (contain), moved with the video, each
  // picture kept whole on screen (placePicture), the low ones above the
  // controls while they show (pictureLift).
  const composite = useCallback(() => {
    const canvas = pgsCanvasRef.current;
    if (!canvas) return;
    const { boxWidth: w, boxHeight: h } = geometry.current;
    // At the screen's own resolution, but never wider than 3840 pixels: the
    // pictures are made on a plane of at most that, mostly 1920.
    const dpr = Math.min(typeof window !== 'undefined' && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1, MAX_CANVAS_WIDTH / Math.max(1, w));
    const width = Math.max(1, Math.round(w * dpr));
    const height = Math.max(1, Math.round(h * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const c = canvas.getContext('2d');
    if (!c) return;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, width, height);
    const plane = planeRef.current;
    if (!plane || plane.objects.pictures.length === 0 || !(w > 0 && h > 0) || !(plane.objects.width > 0 && plane.objects.height > 0)) return;
    const { objects } = plane;
    const t = transformNow();
    const planeBox = pictureRect(w, h, objects.width, objects.height);
    const s = planeBox.width / objects.width;
    const planeOnScreen = transformRect(w, h, t, planeBox);
    const shows = intersectRect(planeOnScreen, { left: 0, top: 0, width: w, height: h });
    const placed = objects.pictures.map((p) =>
      placePicture(
        transformRect(w, h, t, { left: planeBox.left + p.x * s, top: planeBox.top + p.y * s, width: p.width * s, height: p.height * s }),
        planeOnScreen,
        shows,
      ),
    );
    const lift = pictureLift(placed, planeOnScreen, shows, h, clearShown.current);
    const middle = planeOnScreen.top + planeOnScreen.height / 2;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    objects.pictures.forEach((p, i) => {
      const r = placed[i];
      const rise = isLower(r, middle) ? lift : 0;
      c.drawImage(plane.canvas, p.x, p.y, p.width, p.height, r.left, r.top - rise, r.width, r.height);
    });
    // transformNow reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pgsCanvasRef]);

  const compositeQueued = useRef<number | null>(null);
  const queueComposite = useCallback(() => {
    if (compositeQueued.current !== null || typeof requestAnimationFrame === 'undefined') return;
    compositeQueued.current = requestAnimationFrame(() => {
      compositeQueued.current = null;
      composite();
    });
  }, [composite]);
  useEffect(
    () => () => {
      if (compositeQueued.current !== null) cancelAnimationFrame(compositeQueued.current);
    },
    [],
  );

  // The video and the held picture, moved and scaled; the subtitle's
  // pictures with them.
  const draw = useCallback(() => {
    const css = transformCss(transformNow());
    const v = videoRef.current;
    if (v && v.style.transform !== css) v.style.transform = css;
    const held = heldFrameRef.current;
    if (held && held.style.transform !== css) held.style.transform = css;
    composite();
    // transformNow reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoRef, heldFrameRef, composite]);

  useEffect(() => {
    geometry.current = { boxWidth, boxHeight, frame, area: usedArea, known };
    const zooms = zoomNext.current;
    zoomNext.current = false;
    if (!zooms) {
      zoomShown.current = zoom;
      draw();
      return;
    }
    return animate(zoomShown, zoom, ZOOM_MS, draw);
    // usedArea is area while the size is known.
  }, [mounted, boxWidth, boxHeight, frame, area, known, zoom, draw]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => animate(clearShown, clear, LIFT_MS, composite), [clear, composite]);

  // The PGS subtitle on: libpgs reads it, and draws its pictures onto a plane
  // canvas kept off screen, which the player follows (lib/pgsPlane.ts) and
  // draws from. One renderer at a time, made again for another track only.
  const pgsId = pgs?.id;
  const pgsUrl = pgs?.url;
  useEffect(() => {
    const v = videoRef.current;
    if (!mounted || !v || !pgsUrl) return;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const objects = new PlaneObjects();
    followPlane(ctx as unknown as PlaneContext, objects, queueComposite);
    const plane = { objects, canvas };
    planeRef.current = plane;
    const renderer = new PgsRenderer({
      video: v,
      canvas,
      subUrl: pgsUrl,
      workerUrl: libpgsWorkerUrl,
      // The plane fitted into the player whole, as the video is (contain).
      aspectRatio: 'contain',
      mode: DRAWN_HERE,
    });
    queueComposite();
    return () => {
      renderer.dispose();
      if (planeRef.current === plane) planeRef.current = null;
      objects.reset();
      queueComposite();
    };
    // A new renderer only for another track: the URL carries the stable
    // ?stream= token, so a sign-in renewal does not change it.
  }, [mounted, pgsId, pgsUrl, videoRef, queueComposite]);

  // A canvas mounted for another track starts empty: drawn at once.
  useEffect(() => {
    queueComposite();
  }, [pgsId, queueComposite]);

  return { region, boxHeight, fills: known && scales.fills, fill, toggleFill };
}
