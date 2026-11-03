import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { PgsRenderer } from 'libpgs';
// Vite resolves this to an emitted asset URL; the worker file is already an
// IIFE so it loads via `new Worker(url)` with no extra glue. Keeps libpgs's
// worker out of the main bundle.
import libpgsWorkerUrl from 'libpgs/dist/libpgs.worker.js?url';
import { pictureRect, type Rect } from '../lib/subtitleLook';
import {
  NO_TRANSFORM,
  fillShown,
  intersectRect,
  isLower,
  loadFill,
  pictureLift,
  pictureScales,
  pictureTransform,
  placePicture,
  rememberedFillApplies,
  safeBox,
  safeSide,
  saveFill,
  subtitleRegion,
  toggledFill,
  transformCss,
  transformRect,
  type FillChoice,
  type PictureArea,
  type PictureTransform,
} from '../lib/pictureFit';
import { PlaneObjects, drawnCanvas, followPlane, pgsMode, type PlaneContext } from '../lib/pgsPlane';

/** How long the picture takes to zoom to fill or back (the fill button). */
const ZOOM_MS = 250;
/** How long a picture subtitle takes to rise above the controls and come
 *  back down: the controls' own pace (SubtitleOverlay's CONTROLS_PACE). */
const LIFT_MS = 150;

type PgsOptions = ConstructorParameters<typeof PgsRenderer>[0];

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
  /** The band kept clear at the sides (the safe area), where it applies. */
  side: number;
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

/**
 * The safe area's band at the sides, in CSS pixels: a notch held sideways
 * (index.html asks for viewport-fit=cover). Read off an element whose
 * padding is env(safe-area-inset-left) and -right, again as the window
 * turns or resizes.
 */
function useSafeSide(): number {
  const [side, setSide] = useState(0);
  useEffect(() => {
    if (typeof document === 'undefined' || typeof getComputedStyle === 'undefined') return;
    const probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText =
      'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
      'padding-left:env(safe-area-inset-left,0px);padding-right:env(safe-area-inset-right,0px)';
    document.body.appendChild(probe);
    const read = () => {
      const style = getComputedStyle(probe);
      setSide(safeSide(style.paddingLeft, style.paddingRight));
    };
    read();
    window.addEventListener('resize', read);
    window.addEventListener('orientationchange', read);
    return () => {
      window.removeEventListener('resize', read);
      window.removeEventListener('orientationchange', read);
      probe.remove();
    };
  }, []);
  return side;
}

export interface PictureLayersInput {
  /** The <video> is in the page. */
  mounted: boolean;
  /** The title playing: a fill chosen for it alone goes with it. */
  itemId: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  /** The held picture of a quality switch: moved with the video. */
  heldFrameRef: RefObject<HTMLCanvasElement | null>;
  /** The canvas a PGS subtitle's pictures are drawn on, over the player. */
  pgsCanvasRef: RefObject<HTMLCanvasElement | null>;
  /** Where the picture is in the frame (/play/info, pictureFit.ts); null where
   *  the title has none: then nothing changes, as before. */
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
  /** Fill changes the picture here: the fill button shows. Only for a title
   *  with a pictureArea. */
  fills: boolean;
  /** The picture is filled (the button pressed). */
  fill: boolean;
  /** Fill, or fit again: on a title the device's fill applies to, for every
   *  such title; on another, for this title alone. */
  toggleFill: () => void;
}

/**
 * The picture and what is drawn over it, as pictureFit.ts places them: the
 * video and the held picture moved and scaled together - fitted, or filled
 * where the viewer chose it - clear of a notch's band at the sides, the
 * region a text subtitle is laid out on, and a PGS subtitle's pictures each
 * drawn where it belongs, whole on screen and above the controls while they
 * show. Follows the player's size, the picture's own (a rendition of
 * another shape) and the viewer's fill; zooms to fill and back in a quarter
 * of a second. A title without a pictureArea is left exactly as before.
 */
export function usePictureLayers({ mounted, itemId, videoRef, heldFrameRef, pgsCanvasRef, area, pgs, clear }: PictureLayersInput): PictureLayers {
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
  const safe = useSafeSide();

  const { boxWidth, boxHeight, videoWidth, videoHeight } = sizes;
  const known = boxWidth > 0 && boxHeight > 0 && videoWidth > 0 && videoHeight > 0;
  const frame = useMemo(() => pictureRect(boxWidth, boxHeight, videoWidth, videoHeight), [boxWidth, boxHeight, videoWidth, videoHeight]);
  // Without an area, nothing of this: no transform, no fill, no band.
  const usedArea = known ? area : null;
  const side = usedArea ? safe : 0;
  const scales = pictureScales(boxWidth, boxHeight, frame, usedArea, side);
  const applies = rememberedFillApplies(boxWidth, boxHeight, frame, usedArea, side);

  // The device's fill, and the one chosen for this title alone.
  const [choice, setChoice] = useState<FillChoice>(() => ({ remembered: loadFill(), title: null }));
  const choiceRef = useRef(choice);
  choiceRef.current = choice;
  const now = useRef({ itemId, applies, fills: false });
  now.current = { itemId, applies, fills: known && scales.fills };
  // The next change of the picture comes from the fill button: it zooms.
  // Any other - a resize, a rendition, another title - is made at once.
  const zoomNext = useRef(false);
  const toggleFill = useCallback(() => {
    const { itemId: id, applies: a, fills } = now.current;
    const next = toggledFill(choiceRef.current, id, a);
    if (next.remembered !== choiceRef.current.remembered) saveFill(next.remembered);
    zoomNext.current = fills;
    choiceRef.current = next;
    setChoice(next);
  }, []);
  const fill = fillShown(choice, itemId, applies);
  const zoom = fill && scales.fills ? 1 : 0;
  const target = usedArea ? pictureTransform(boxWidth, boxHeight, frame, usedArea, zoom, side) : NO_TRANSFORM;
  const region = usedArea ? subtitleRegion(boxWidth, boxHeight, frame, target, side) : frame;

  // What the layers are drawn with: the latest geometry, the zoom on screen
  // (0 fitted, 1 filled, between while it zooms) and what the controls
  // cover as the subtitle rises.
  const geometry = useRef<Geometry>({ boxWidth: 0, boxHeight: 0, frame, area: null, side: 0, known: false });
  const zoomShown = useRef(zoom);
  const clearShown = useRef(clear);
  const planeRef = useRef<{ objects: PlaneObjects; canvas: HTMLCanvasElement } | null>(null);

  const transformNow = (): PictureTransform => {
    const g = geometry.current;
    return g.known && g.area ? pictureTransform(g.boxWidth, g.boxHeight, g.frame, g.area, zoomShown.current, g.side) : NO_TRANSFORM;
  };

  // A PGS subtitle's pictures, each where it belongs: the plane fitted into
  // the player as libpgs fits it (contain), moved with the video, each
  // picture kept whole on screen and clear of the bands (placePicture), the
  // low ones above the controls while they show (pictureLift) - on a canvas
  // just round them, never the whole player at the screen's resolution.
  const composite = useCallback(() => {
    const canvas = pgsCanvasRef.current;
    if (!canvas) return;
    const g = geometry.current;
    const { boxWidth: w, boxHeight: h } = g;
    const plane = planeRef.current;
    const drawn: { src: { x: number; y: number; width: number; height: number }; at: Rect }[] = [];
    if (plane && plane.objects.pictures.length > 0 && w > 0 && h > 0 && plane.objects.width > 0 && plane.objects.height > 0) {
      const { objects } = plane;
      const t = transformNow();
      const planeBox = pictureRect(w, h, objects.width, objects.height);
      const s = planeBox.width / objects.width;
      const planeOnScreen = transformRect(w, h, t, planeBox);
      const shows = intersectRect(planeOnScreen, safeBox(w, h, g.side));
      const placed = objects.pictures.map((p) =>
        placePicture(
          transformRect(w, h, t, { left: planeBox.left + p.x * s, top: planeBox.top + p.y * s, width: p.width * s, height: p.height * s }),
          planeOnScreen,
          shows,
        ),
      );
      const lift = pictureLift(placed, planeOnScreen, shows, h, clearShown.current);
      const middle = planeOnScreen.top + planeOnScreen.height / 2;
      objects.pictures.forEach((p, i) => {
        const r = placed[i];
        drawn.push({ src: p, at: { ...r, top: r.top - (isLower(r, middle) ? lift : 0) } });
      });
    }
    const dpr = typeof window !== 'undefined' && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
    const box = drawnCanvas(drawn.map((d) => d.at), w, h, dpr);
    const style = canvas.style;
    style.left = `${box.left}px`;
    style.top = `${box.top}px`;
    style.width = `${box.width}px`;
    style.height = `${box.height}px`;
    if (canvas.width !== box.pixelWidth || canvas.height !== box.pixelHeight) {
      canvas.width = box.pixelWidth;
      canvas.height = box.pixelHeight;
    }
    if (!plane || drawn.length === 0 || box.pixelWidth === 0) return;
    const c = canvas.getContext('2d');
    if (!c) return;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.setTransform(box.scale, 0, 0, box.scale, -box.left * box.scale, -box.top * box.scale);
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    for (const { src, at } of drawn) {
      c.drawImage(plane.canvas, src.x, src.y, src.width, src.height, at.left, at.top, at.width, at.height);
    }
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
    geometry.current = { boxWidth, boxHeight, frame, area: usedArea, side, known };
    const zooms = zoomNext.current;
    zoomNext.current = false;
    if (!zooms) {
      zoomShown.current = zoom;
      draw();
      return;
    }
    return animate(zoomShown, zoom, ZOOM_MS, draw);
    // usedArea is area while the size is known.
  }, [mounted, boxWidth, boxHeight, frame, area, side, known, zoom, draw]); // eslint-disable-line react-hooks/exhaustive-deps

  // The low pictures rise while the controls show, and come back down as
  // they hide, at their pace.
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
      // libpgs's own choice for this browser, but the canvas stays here.
      mode: pgsMode(navigator.userAgent, typeof Worker !== 'undefined') as unknown as PgsOptions['mode'],
    });
    // libpgs 0.8.1 starts as if its first picture were drawn already (its
    // previous index is 0, not -1): a track turned on, or a title started,
    // within the first picture's time never showed it. Before any picture,
    // so the first one is drawn when its time comes.
    renderer.renderAtTimestamp(-1);
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
