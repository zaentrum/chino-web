// How a subtitle looks: one look for every title and every track, set here
// and nowhere else (the design system's subtitles pattern, as the TV and the
// phone draw it). Pure: subtitleLook.test.ts runs it under node --test.
//
// White text with a black outline and nothing behind it - no box, no
// window - in the system's sans-serif, which has the letters of every
// language (Chinese, Japanese and Korean included; the app's Inter has
// not). Its size follows the picture: 5.33 % of the picture's height.
// Centred at the bottom, the lines wrap within 80 % of the picture's width,
// and the last one ends 8 % of the picture's height above the picture's
// bottom edge - inside the picture, on a scope film too, never cut at an
// edge. What a file brings - its colours, boxes, fonts, sizes and places -
// is ignored, but for its italics, which mean something (a voice from off
// screen, a song, a thought), and its ruby, the readings over Japanese and
// Chinese characters.
//
// The player draws a text subtitle itself (SubtitleOverlay); where the
// browser draws it instead (picture-in-picture, a phone's own fullscreen),
// its ::cue rule gives it the same look. While the controls show, the line
// moves up above them, and back down when they hide.
//
// On the TV and the phone, caption settings made on the device (under
// accessibility: a box behind the text, say) win over this look. A web
// page cannot read the device's, so the web always shows this look, and it
// has no caption setting of its own (docs/chino, subtitles: the look).

/** The text's size, as a share of the picture's height. */
export const SUBTITLE_TEXT_SIZE = 0.0533;

/** The width the lines wrap within, as a share of the picture's width. */
export const SUBTITLE_LINE_WIDTH = 0.8;

/** How far above the picture's bottom edge the last line ends, as a share of
 *  the picture's height. */
export const SUBTITLE_BOTTOM = 0.08;

/** The text's colour. */
export const SUBTITLE_COLOR = '#FFFFFF';

/** The system's sans-serif: every language's letters. */
export const SUBTITLE_FONT = 'system-ui, sans-serif';

/** The space between two lines, as a share of the text's size. */
export const SUBTITLE_LINE_HEIGHT = 1.25;

// The outline: eight black shadows without blur, one in each direction, as
// thick as a twentieth of the text - an outline, with no shadow under it.
const EDGE = 0.05;
const DIAGONAL = +(EDGE * Math.SQRT1_2).toFixed(3);

/** The black outline, as text shadows (what ::cue can draw). */
export const SUBTITLE_OUTLINE = [
  [EDGE, 0], [-EDGE, 0], [0, EDGE], [0, -EDGE],
  [DIAGONAL, DIAGONAL], [-DIAGONAL, DIAGONAL], [DIAGONAL, -DIAGONAL], [-DIAGONAL, -DIAGONAL],
]
  .map(([x, y]) => `${x}em ${y}em 0 #000`)
  .join(', ');

/** A rectangle, in CSS pixels of the player. */
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Where the picture is inside a video element `boxWidth` by `boxHeight`,
 * which shows a `videoWidth` by `videoHeight` picture whole and centred
 * (object-fit: contain): a scope film has black bands above and below it, a
 * 4:3 one at its sides. The whole element while the picture's size is not
 * known.
 */
export function pictureRect(boxWidth: number, boxHeight: number, videoWidth: number, videoHeight: number): Rect {
  if (!(boxWidth > 0 && boxHeight > 0)) return { left: 0, top: 0, width: 0, height: 0 };
  if (!(videoWidth > 0 && videoHeight > 0)) return { left: 0, top: 0, width: boxWidth, height: boxHeight };
  const scale = Math.min(boxWidth / videoWidth, boxHeight / videoHeight);
  const width = videoWidth * scale;
  const height = videoHeight * scale;
  return { left: (boxWidth - width) / 2, top: (boxHeight - height) / 2, width, height };
}

/** Where a subtitle goes in the player: its box's left edge and width, how
 *  far its bottom is above the element's bottom edge, and its text size, in
 *  CSS pixels. */
export interface SubtitlePlace {
  left: number;
  width: number;
  bottom: number;
  fontSize: number;
}

/**
 * Where the subtitle goes over `picture` (pictureRect) in an element
 * `boxHeight` high: centred within 80 % of the picture's width, the last
 * line 8 % of the picture's height above the picture's bottom edge, the
 * text 5.33 % of the picture's height. `clear` is what the player's
 * controls cover at the element's bottom while they show: the subtitle goes
 * up above them, and back down when they hide.
 */
export function subtitlePlace(picture: Rect, boxHeight: number, clear = 0): SubtitlePlace {
  const below = Math.max(0, boxHeight - (picture.top + picture.height));
  return {
    left: picture.left + (picture.width * (1 - SUBTITLE_LINE_WIDTH)) / 2,
    width: picture.width * SUBTITLE_LINE_WIDTH,
    bottom: Math.max(below + picture.height * SUBTITLE_BOTTOM, clear),
    fontSize: picture.height * SUBTITLE_TEXT_SIZE,
  };
}

/** The value of a video's `data-cues` while the player draws its subtitle
 *  itself (SubtitleOverlay), not the browser. */
export const CUES_DRAWN_BY_PAGE = 'page';

// The tags a WebVTT cue's text may have: class, italics, bold, underline,
// ruby and its reading, voice, language - and a span, which a converter
// may leave.
const CUE_TAGS = ['c', 'i', 'b', 'u', 'ruby', 'rt', 'v', 'lang', 'span'];

/** The ::cue rule for a video element of `className`: the look, for when
 *  the browser draws a cue itself. Its text size is relative to the
 *  browser's own, 5 % of the video's height: 5.33 % of it. A file's own
 *  styles inside a cue (bold, underline, colours, classes) go too; its
 *  italics stay, as its ruby does. While the player draws the subtitle
 *  (data-cues="page"), a cue the browser shows anyway - a track it turned
 *  on by itself, one kept showing for a picture-in-picture window - is
 *  drawn invisible: one subtitle on screen. */
export function cueCss(className: string): string {
  const video = `video.${className}`;
  return [
    `${video}[data-cues="${CUES_DRAWN_BY_PAGE}"]::cue {`,
    '  visibility: hidden;',
    '  color: transparent;',
    '  background: transparent;',
    '  text-shadow: none;',
    '}',
    `${video}::cue {`,
    `  color: ${SUBTITLE_COLOR};`,
    '  background: transparent;',
    `  font-family: ${SUBTITLE_FONT};`,
    `  font-size: ${+(SUBTITLE_TEXT_SIZE / 0.05 * 100).toFixed(1)}%;`,
    '  font-style: normal;',
    '  font-weight: 400;',
    `  line-height: ${SUBTITLE_LINE_HEIGHT};`,
    '  text-decoration: none;',
    `  text-shadow: ${SUBTITLE_OUTLINE};`,
    '}',
    // No font-style here: what is inside italics stays italic.
    `${CUE_TAGS.map((tag) => `${video}::cue(${tag})`).join(', ')} {`,
    '  color: inherit;',
    '  background: transparent;',
    '  font-weight: 400;',
    '  text-decoration: none;',
    '}',
    `${video}::cue(i) {`,
    '  font-style: italic;',
    '}',
  ].join('\n');
}

/** A piece of a subtitle's line: text, or text with its reading above it
 *  (ruby: a Japanese subtitle's furigana); `italic` where the file sets it
 *  in italics. */
export type CuePiece = { text: string; italic?: true } | { base: string; ruby: string; italic?: true };

/** One line of a subtitle, in pieces. */
export type CueLine = CuePiece[];

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', nbsp: ' ', lrm: '‎', rlm: '‏', quot: '"', apos: "'" };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === '#') {
      const n = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/**
 * A cue's text (WebVTT cue text) as the lines the player draws: its words
 * and line breaks, its italics, and its ruby - a reading is part of the
 * language - nothing else: the tags that style it otherwise (bold,
 * underline, classes and their colours, voices, karaoke times) go, and so
 * do the override blocks a converted ASS subtitle may still carry
 * ("{\an8}"), but for the italics they switch ("{\i1}", "{\i0}"). Empty
 * lines go.
 */
export function cueLines(text: string): CueLine[] {
  const lines: CueLine[] = [[]];
  let ruby: { base: string; ruby: string; italic?: true } | null = null;
  let inRt = false;
  // Open <i> tags, and an ASS block's italics.
  let italics = 0;
  let assItalic = false;
  const italic = () => italics > 0 || assItalic;
  const addText = (s: string, slanted: boolean) => {
    if (!s) return;
    const line = lines[lines.length - 1];
    const last = line[line.length - 1];
    if (last && 'text' in last && !!last.italic === slanted) last.text += s;
    else line.push(slanted ? { text: s, italic: true } : { text: s });
  };
  const add = (s: string) => {
    if (!s) return;
    if (!ruby) return addText(s, italic());
    if (inRt) ruby.ruby += s;
    else {
      ruby.base += s;
      if (italic()) ruby.italic = true;
    }
  };
  const source = text.replace(/\r\n?/g, '\n');
  const tokens = source.match(/<[^>]*>|\{\\[^}]*\}|[^<{]+|[<{]/g) ?? [];
  for (const token of tokens) {
    if (token.startsWith('{\\')) {
      // An ASS override block: the last \i in it says it, \i1 on, \i0 off.
      const switches = [...token.matchAll(/\\i([01])(?![0-9])/g)];
      if (switches.length) assItalic = switches[switches.length - 1][1] === '1';
      continue;
    }
    if (token.startsWith('<') && token.length > 1) {
      const tag = /^<\s*(\/?)\s*([a-z]+)/i.exec(token);
      if (!tag) continue;
      const [, close, name] = tag;
      const n = name.toLowerCase();
      if (n === 'ruby') {
        if (!close) ruby = italic() ? { base: '', ruby: '', italic: true } : { base: '', ruby: '' };
        else if (ruby) {
          const r: { base: string; ruby: string; italic?: true } = ruby;
          ruby = null;
          inRt = false;
          if (r.ruby.trim()) lines[lines.length - 1].push(r);
          else addText(r.base, !!r.italic);
        }
      } else if (n === 'rt') {
        inRt = !close && !!ruby;
      } else if (n === 'i') {
        italics = close ? Math.max(0, italics - 1) : italics + 1;
      }
      continue;
    }
    const parts = decodeEntities(token).split('\n');
    parts.forEach((p, i) => {
      // A line break inside a ruby is no new line: the reading stays on it.
      if (i > 0 && !ruby) lines.push([]);
      add(p);
    });
  }
  return lines
    .map((line) =>
      line
        .map((p) => ('text' in p ? { ...p, text: p.text.replace(/[ \t]+/g, ' ') } : p))
        .filter((p) => ('text' in p ? p.text !== '' : true)),
    )
    .map((line) => {
      const first = line[0];
      const last = line[line.length - 1];
      if (first && 'text' in first) first.text = first.text.trimStart();
      if (last && 'text' in last) last.text = last.text.trimEnd();
      return line.filter((p) => ('text' in p ? p.text !== '' : true));
    })
    .filter((line) => line.length > 0);
}

/** What the player knows of a cue on screen: its text, and where its file
 *  placed it - only to keep two shown at once in the file's order. */
export interface ShownCue {
  text: string;
  /** VTTCue.line: 'auto', a line number (negative from the bottom), or a
   *  percentage of the height. */
  line?: number | 'auto' | null;
  snapToLines?: boolean;
  startTime?: number;
}

/** How high a file placed a cue, from 0 (the top) to 1 (the bottom); one
 *  with no line is at the bottom. */
function heightOnScreen(cue: ShownCue): number {
  const line = cue.line;
  if (typeof line !== 'number' || !Number.isFinite(line)) return 1;
  if (cue.snapToLines === false) return Math.min(1, Math.max(0, line / 100));
  return line >= 0 ? Math.min(1, line / 15) : Math.min(1, Math.max(0, 1 + (line + 1) / 15));
}

/** The cues on screen as one subtitle: each cue on lines of its own, top to
 *  bottom as the file placed them, else in the order they began. */
export function shownLines(cues: readonly ShownCue[]): CueLine[] {
  return cues
    .map((cue, i) => ({ cue, i }))
    .sort((a, b) => heightOnScreen(a.cue) - heightOnScreen(b.cue) || (a.cue.startTime ?? 0) - (b.cue.startTime ?? 0) || a.i - b.i)
    .flatMap(({ cue }) => cueLines(cue.text));
}
