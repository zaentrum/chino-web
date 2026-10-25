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
 *  "reconnecting", "tap to unmute": on a solid surface, never a see-through
 *  one, whatever the picture under it (docs/chino, playback: the player's
 *  menus). */
export const OVER_PICTURE = 'bg-chino-surface border border-chino-border-2 text-chino-fg shadow-lg';
/** Its hover, where it is a button. */
export const OVER_PICTURE_HOVER = 'hover:bg-chino-surface-2';

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
