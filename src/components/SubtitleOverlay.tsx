import { useEffect, useState, type RefObject } from 'react';
import {
  SUBTITLE_COLOR,
  SUBTITLE_FONT,
  SUBTITLE_LINE_HEIGHT,
  SUBTITLE_OUTLINE,
  pictureRect,
  subtitlePlace,
  type CueLine,
} from '../lib/subtitleLook';

interface SubtitleOverlayProps {
  /** The video the subtitle is drawn over. */
  videoRef: RefObject<HTMLVideoElement | null>;
  /** What is shown now (lib/subtitleLook.ts shownLines); none draws nothing. */
  lines: readonly CueLine[];
  /** The subtitle's language, as a BCP 47 tag: the font for its letters
   *  (Simplified or Traditional Chinese, Japanese) follows it. */
  lang?: string;
  /** What the player's controls cover at the bottom while they show, in
   *  CSS pixels; 0 while they are hidden. */
  clear: number;
}

interface Sizes {
  boxWidth: number;
  boxHeight: number;
  videoWidth: number;
  videoHeight: number;
}

/**
 * A text subtitle, drawn by the player in the one look (lib/subtitleLook.ts):
 * white with a black outline, no box, 5.33 % of the picture's height,
 * centred within 80 % of the picture's width, 8 % of its height above its
 * bottom edge - above the controls while they show. It follows the picture
 * as the window, the element or the picture's size changes.
 */
export function SubtitleOverlay({ videoRef, lines, lang, clear }: SubtitleOverlayProps) {
  const [sizes, setSizes] = useState<Sizes>({ boxWidth: 0, boxHeight: 0, videoWidth: 0, videoHeight: 0 });

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const measure = () =>
      setSizes((prev) => {
        const next = { boxWidth: v.clientWidth, boxHeight: v.clientHeight, videoWidth: v.videoWidth, videoHeight: v.videoHeight };
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
  }, [videoRef]);

  if (lines.length === 0) return null;
  const picture = pictureRect(sizes.boxWidth, sizes.boxHeight, sizes.videoWidth, sizes.videoHeight);
  const place = subtitlePlace(picture, sizes.boxHeight, clear);
  if (!(place.fontSize > 0)) return null;
  return (
    <div
      data-subtitle
      lang={lang || undefined}
      className="pointer-events-none absolute text-center transition-[bottom] duration-150 ease-out motion-reduce:transition-none"
      style={{
        left: place.left,
        width: place.width,
        bottom: place.bottom,
        fontSize: place.fontSize,
        lineHeight: SUBTITLE_LINE_HEIGHT,
        fontFamily: SUBTITLE_FONT,
        fontWeight: 400,
        color: SUBTITLE_COLOR,
        textShadow: SUBTITLE_OUTLINE,
        overflowWrap: 'break-word',
      }}
    >
      {lines.map((line, i) => (
        <span key={i} dir="auto" className="block [text-wrap:balance]">
          {line.map((piece, j) =>
            'text' in piece ? (
              <span key={j}>{piece.text}</span>
            ) : (
              <ruby key={j}>
                {piece.base}
                <rt>{piece.ruby}</rt>
              </ruby>
            ),
          )}
        </span>
      ))}
    </div>
  );
}
