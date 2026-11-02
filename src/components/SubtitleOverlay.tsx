import {
  SUBTITLE_COLOR,
  SUBTITLE_FONT,
  SUBTITLE_LINE_HEIGHT,
  SUBTITLE_OUTLINE,
  subtitlePlace,
  type CueLine,
  type Rect,
} from '../lib/subtitleLook';

/** The pace the player's controls fade in and out at, and the subtitle
 *  moves up above them and back down at: one pace for both. */
export const CONTROLS_PACE = 'duration-150 ease-in-out';

interface SubtitleOverlayProps {
  /** What shows of the picture, in CSS pixels of the player: the frame as
   *  the player lays it out, fitted to the title's picture or filled
   *  (lib/pictureFit.ts subtitleRegion). */
  picture: Rect;
  /** The player's height, in CSS pixels. */
  boxHeight: number;
  /** What is shown now (lib/subtitleLook.ts shownLines); none draws nothing. */
  lines: readonly CueLine[];
  /** The subtitle's language, as a BCP 47 tag: the font for its letters
   *  (Simplified or Traditional Chinese, Japanese) follows it. */
  lang?: string;
  /** What the player's controls cover at the bottom while they show, in
   *  CSS pixels; 0 while they are hidden. */
  clear: number;
}

/**
 * A text subtitle, drawn by the player in the one look (lib/subtitleLook.ts):
 * white with a black outline, no box, 5.33 % of the picture's height,
 * centred within 80 % of the picture's width, 8 % of its height above its
 * bottom edge - above the controls while they show, moving up and back
 * down at the pace they fade at (CONTROLS_PACE). Italics and ruby stay
 * as the file sets them. The picture is what shows of it: where the player
 * fits a letterboxed film's own picture to the screen, its bars cropped,
 * the line sits on the screen's bottom, never off it. It follows the
 * picture as the window, the element or the picture's size changes.
 */
export function SubtitleOverlay({ picture, boxHeight, lines, lang, clear }: SubtitleOverlayProps) {
  if (lines.length === 0) return null;
  const place = subtitlePlace(picture, boxHeight, clear);
  if (!(place.fontSize > 0)) return null;
  return (
    <div
      data-subtitle
      lang={lang || undefined}
      className={`pointer-events-none absolute text-center transition-[bottom] ${CONTROLS_PACE} motion-reduce:transition-none`}
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
          {/* The file's italics and ruby stay; nothing else of its styles. */}
          {line.map((piece, j) =>
            'text' in piece ? (
              piece.italic ? <i key={j}>{piece.text}</i> : <span key={j}>{piece.text}</span>
            ) : (
              <ruby key={j} className={piece.italic ? 'italic' : undefined}>
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
