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
