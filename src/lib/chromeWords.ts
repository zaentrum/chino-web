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

/** Settings' hints under a field, in the body face: sentence case - the
 *  player's cards named as they read, never capitalised as names - and in
 *  words for every device, nothing to "click". */
export const SETTINGS_HINTS = {
  /** Under "Auto-skip intros": the intro the player's "Skip Intro" skips,
   *  on another episode of the same show started within hours of the last
   *  (settings.ts, isBingeContinuation) - the first one still shows it. */
  autoSkipIntro: 'Skips the intro on every episode after the first one you watch in a row.',
  /** Under "Auto-play next episode". Off, the credits' "Up next" card
   *  stays, its "Play now" without a countdown. */
  autoPlayNext: 'Starts the next episode when the credits roll. Off, the up next card waits until you play it.',
} as const;

/** The Watchlist page's chrome. */
export const WATCHLIST_WORDS = {
  heading: 'watchlist',
  newList: 'new list',
  createList: 'create list',
  cancel: 'cancel',
} as const;

/** A title's kind as a viewer reads it - the grid's and the nav's word: a
 *  "show" where the catalogue says series, a "movie"; another kind as the
 *  catalogue names it. Lowercase, for the badge's mono face. */
export function kindWord(type: string): string {
  const kind = type.trim().toLowerCase();
  return kind === 'series' ? 'show' : kind;
}

/** The kind's badge on a title's page, beside its year and rating: one
 *  word, chrome - small, in the mono face, written lowercase rather than
 *  capitalised by CSS - in a thin square frame on a slightly lighter
 *  panel, never a see-through one over the backdrop; it never wraps. */
export const KIND_BADGE =
  'px-1.5 py-0.5 border border-chino-border-2 bg-chino-surface-2 text-chino-muted font-mono text-xs tracking-wide whitespace-nowrap';

/** A row's way to all of it - the Home rails', the Watchlist's shelves'
 *  "see all" beside the title and as the tile at the row's end: one word,
 *  chrome, lowercase in the mono face, never "See All" beside "See all". */
export const SEE_ALL = 'see all';

/** Its words' look. */
export const SEE_ALL_LOOK = 'font-mono text-sm';

/** A part of a list split by kind, "movies · 4", under the list's own
 *  heading (docs/chino, watchlist 8.8.1): mono, lowercase, quieter. */
export const PART_HEADING = 'font-mono text-lg text-chino-text';

/** The button that starts a title the browser wouldn't start by itself:
 *  "play" - never "click", which a touch screen has none of. */
export const START_PLAYBACK = 'play';

/** Its look: the one emphasized action, solid blue with its words dark, in
 *  the mono face, at the title row's height - over the picture, on no
 *  see-through wash. */
export const START_PLAYBACK_BUTTON =
  'inline-flex items-center gap-2 h-12 px-5 bg-chino-accent text-chino-bg font-mono font-medium shadow-xl';

/** The button that brings the sound back where the browser started a
 *  title muted (the player, a Zap card): "unmute" - a word for a mouse, a
 *  touch and a key alike, never "tap" or "click". */
export const UNMUTE = 'unmute';

/** Its words: chrome, in the mono face. */
export const UNMUTE_LOOK = 'font-mono text-sm';

/** A "details" disclosure under a couldn't-load screen's reason: in the
 *  muted grey of labels and details (at least 4.5:1 on the canvas and on
 *  every surface, at 12 px). */
export const DETAILS_DISCLOSURE = 'relative text-xs text-chino-muted';

/** What it opens in a centred block: under its summary, centred on it,
 *  taking no room of its own - so opening it never moves the block. */
export const DETAILS_BODY =
  'absolute top-full left-1/2 -translate-x-1/2 mt-1 w-max max-w-[min(28rem,calc(100vw-2rem))] font-mono text-center';

/** What it opens in a block aligned at the start (the search page's): under
 *  its summary, in the flow, from the same left edge - centred on a summary
 *  as narrow as "details", it would start left of the page and be cut off. */
export const DETAILS_BODY_START = 'mt-1 font-mono text-left';

/** Where a "details" disclosure sits: in a centred block, or at the start
 *  of one aligned left. */
export type DetailsAlign = 'center' | 'start';

/** What a "details" disclosure opens, for the block it sits in. */
export function detailsBody(align: DetailsAlign): string {
  return align === 'start' ? DETAILS_BODY_START : DETAILS_BODY;
}
