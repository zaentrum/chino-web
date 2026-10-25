// The words of the player's menus (docs/chino, playback: the player's
// menus). A header is chrome - lowercase, in the design system's mono face;
// a row is a name - a language, a quality, a speed - in the body face. Pure:
// playerMenus.test.ts runs it under node --test.

/** The menus' headers, as the player shows them. */
export const MENU_HEADERS = {
  subtitles: 'subtitles',
  audio: 'audio',
  quality: 'quality',
  speed: 'speed',
  timing: 'timing',
} as const;

/** The subtitles menu's first row, for none: "off", lowercase. Settings'
 *  subtitle setting says it in the same word (settingsLanguages.ts). */
export const SUBTITLES_OFF_ROW = 'off';

/** A header's look: the mono face, small, muted. */
export const MENU_HEADER = 'font-mono text-xs tracking-wide text-chino-muted';

/** The speeds the speed menu offers, slowest first. */
export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

/** A speed as its row names it: "normal" for 1, else the rate with no
 *  trailing zero ("2x", "1.5x", "0.75x" - never "2.0x"). */
export function speedName(rate: number): string {
  if (rate === 1) return 'normal';
  return `${Number(rate.toFixed(2))}x`;
}

/** A line or a chip the player puts over the picture - the quality notice,
 *  "reconnecting", "unmute": on a solid surface, never a see-through
 *  one, whatever the picture under it (docs/chino, playback: the player's
 *  menus). */
export const OVER_PICTURE = 'bg-chino-surface border border-chino-border-2 text-chino-fg shadow-lg';
/** Its hover, where it is a button. */
export const OVER_PICTURE_HOVER = 'hover:bg-chino-surface-2';

/** The player's spinner and its status line while it waits for the
 *  picture: a panel on the same solid surface, in the middle - never a
 *  see-through wash over the whole picture with the text on it. */
export const WAITING_PANEL = `${OVER_PICTURE} max-w-sm mx-4 px-5 py-4 flex flex-col items-center gap-3 text-center`;
/** Its status line. The stream's detail (codecs, the pipeline) is the
 *  playback info's, not the line's. */
export const WAITING_LINE = 'text-sm text-chino-fg';

/** The spinner alone, where there is no line to say: in a square frame on
 *  the same solid surface, as the start-up's loading screen has it. */
export const WAITING_SQUARE = `${OVER_PICTURE} w-16 h-16 flex items-center justify-center`;

/** The waiting panel for a line or for the spinner alone. */
export function waitingPanel(withLine: boolean): string {
  return withLine ? WAITING_PANEL : WAITING_SQUARE;
}

/** The subtitles menu's place: above the whole control bar - its seek bar
 *  included, which it never covers, at any width - at the bar's right end,
 *  within its 16 px sides. The bar is the menu's anchor. */
export const SUBTITLES_MENU =
  'absolute right-4 bottom-full w-96 max-w-[calc(100%-2rem)] bg-chino-surface border border-chino-border-2 shadow-xl py-1 z-50';

/** Its list, which scrolls where it is long: never taller than the screen
 *  leaves above the bar, a phone held sideways too. "off" stays outside it,
 *  with the header - "more languages" opened never scrolls it away - and
 *  takes its 2.5rem from the list's height, so the menu is never taller
 *  than its 24rem, 55vh and 100vh-18rem of list allowed before. */
export const SUBTITLES_LIST = 'max-h-[min(21.5rem,calc(55vh-2.5rem),calc(100vh-20.5rem))] overflow-y-auto';

/** The height of a row of the menus, as "off" pinned with the header takes
 *  it from the list. */
export const MENU_ROW_REM = 2.5;

/** The list's top edge under "off": a hairline once the list is scrolled,
 *  so what scrolls reads as passing under "off"; at its top, the same line
 *  unseen - the rows don't move when it shows. */
export const SUBTITLES_LIST_SCROLLED = 'border-t border-chino-border-2';
export const SUBTITLES_LIST_AT_TOP = 'border-t border-transparent';

/** A button over the picture - back, home, every button of the control bar,
 *  a card's quiet one: on the raised surface, never a see-through one,
 *  whatever the picture under it; disabled, the plain surface and a dim
 *  icon (docs/chino, playback: the player's menus; as on the TV). The bars'
 *  gradients stay a scrim behind them, not their surface. */
export const PICTURE_BUTTON =
  'bg-chino-surface-2 hover:bg-chino-border-2 text-chino-fg transition-colors disabled:bg-chino-surface disabled:text-chino-dim';
/** One that is on (subtitles on): solid blue, its icon dark, as every
 *  filled blue control. */
export const PICTURE_BUTTON_ON = 'bg-chino-accent hover:brightness-110 text-chino-bg transition-colors';
/** A card over the picture - binge mode's countdown, up next, the next
 *  episode: solid, with the heavier border. */
export const PICTURE_CARD = 'bg-chino-surface border border-chino-border-2 shadow-2xl';
