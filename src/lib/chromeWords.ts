// The words and the look of the chrome on the Settings and Watchlist pages
// and the player's start button: headings, section titles and buttons in the
// design system's mono face, lowercase in every language - names inside keep
// their case; field labels, hints and messages stay in the body face. Pure:
// chromeWords.test.ts runs it under node --test.

/** A page's heading: mono, lowercase. */
export const PAGE_HEADING = 'font-mono text-3xl md:text-4xl font-semibold text-chino-fg mb-6';

/** A section's title on a page: mono, lowercase. */
export const SECTION_HEADING = 'font-mono text-lg font-semibold text-chino-fg mb-1';

/** A quiet button on a page: the raised surface, square, its words mono. */
export const QUIET_BUTTON = 'inline-flex items-center gap-2 px-4 py-2 bg-chino-surface-2 hover:bg-chino-border-2 font-mono text-sm text-chino-text';

/** The Settings page's chrome. */
export const SETTINGS_WORDS = {
  heading: 'settings',
  binge: 'binge watching',
  audio: 'audio',
  subtitles: 'subtitles',
  feedback: 'feedback',
  reportBug: 'report a bug',
  reset: 'reset to defaults',
} as const;

/** The Watchlist page's chrome. */
export const WATCHLIST_WORDS = {
  heading: 'watchlist',
  newList: 'new list',
  createList: 'create list',
  cancel: 'cancel',
} as const;

/** The button that starts a title the browser wouldn't start by itself:
 *  "play" - never "click", which a touch screen has none of. */
export const START_PLAYBACK = 'play';

/** Its look: the one emphasized action, solid blue with its words dark, in
 *  the mono face, at the title row's height - over the picture, on no
 *  see-through wash. */
export const START_PLAYBACK_BUTTON =
  'inline-flex items-center gap-2 h-12 px-5 bg-chino-accent text-chino-bg font-mono font-medium shadow-xl';
