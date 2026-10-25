// The title actions every chino app has (docs/chino, title actions): add to
// list, watched and liked - one size and one look on a title's page, on its
// episode rows and in Zap; on a card, the same marks, never a button over
// its artwork. Pure: titleActions.test.ts runs it.
//
// Each meaning has one icon and one colour: the bookmark on blue for the
// Watchlist, the check on green for watched, the heart on the design
// system's red for liked. Off, the icon is outlined in fg-2 on the plain
// surface (surface-2); on, it is dark on the meaning's colour, as a label
// or an icon on a filled colour always is. Every control is 48 px tall,
// 8 px apart.

/** What a title action means, and so its icon and its colour. */
export type ActionMeaning = 'watchlist' | 'watched' | 'liked';

/** The one height of every control in the row (48 px), and an icon
 *  button's square. */
export const ACTION_HEIGHT = 'h-12';
export const ICON_BUTTON = 'w-12 h-12';
/** The "⌄" part of add to list: drawn 40 px wide at the full height, its
 *  touch target 48 x 48 - 8 px more on its right, over the gap to the next
 *  control, none over the main part. */
export const CARET_PART = 'w-10 h-12 relative after:absolute after:inset-y-0 after:left-0 after:-right-2';
/** The room between two controls of the row (8 px). */
export const ACTION_GAP = 'gap-2';
/** The keyboard's focus ring, clear of the control's own fill. */
export const ACTION_FOCUS =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-chino-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-chino-bg';

const ON_FILL: Readonly<Record<ActionMeaning, string>> = {
  watchlist: 'bg-chino-accent',
  watched: 'bg-chino-green',
  liked: 'bg-chino-red',
};

/** Off: the plain surface, the outlined icon (or the label) in fg-2. */
export const OFF_LOOK = 'bg-chino-surface-2 text-chino-text hover:bg-chino-border-2';
/** A label or an icon on a filled colour: dark. */
const ON_CONTENT = 'text-chino-bg hover:brightness-110';

/** The fill and the content's colour of an action of that meaning, off or
 *  on - never see-through: the row's fills are solid. */
export function actionLook(meaning: ActionMeaning, on: boolean): string {
  return on ? `${ON_FILL[meaning]} ${ON_CONTENT}` : OFF_LOOK;
}

/** Play and Resume: the accent's fill, its label and icon dark. */
export const PLAY_LOOK = `bg-chino-accent ${ON_CONTENT}`;

// The row's words (docs/chino, title actions), as a button of the design
// system writes them: lowercase, in its mono face. The words are written in
// lowercase rather than lowercased by CSS, so an episode's code keeps its
// capitals ("resume S01E03") and a screen reader reads what is shown.

/** The face of a button's label in the row, and of the hero's buttons. */
export const ACTION_LABEL = 'font-mono';
export const PLAY = 'play';
export const START_OVER = 'start over';
export const TRAILER = 'trailer';
/** The hero's way to a title's page. */
export const SEE_DETAILS = 'see details';

/** A position as a clock shows it: "1:43", "1:02:05". */
export function clockTime(sec: number): string {
  const s = Number.isFinite(sec) && sec > 0 ? Math.floor(sec) : 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${rest}` : `${m}:${rest}`;
}

/** A movie's resume, with where it picks up: "resume 1:43". */
export function resumeLabel(positionSec: number): string {
  return `resume ${clockTime(positionSec)}`;
}

/**
 * A series' first button, which names the episode it plays by its code, as
 * the TV's title page does: "play S01E01", "resume S01E03", "play S01E02",
 * a file of two episodes "play S03E18–19". The position is in the episode's
 * row below, never in the button; without a code, "play" or "resume".
 */
export function seriesPlayLabel(resumes: boolean, code: string | null | undefined): string {
  const verb = resumes ? 'resume' : PLAY;
  return code ? `${verb} ${code}` : verb;
}

/** The 1 px divider between the two parts of add to list: on blue a dark
 *  line, on the plain surface the border's. */
export function dividerLook(inWatchlist: boolean): string {
  return inWatchlist ? 'bg-chino-bg/40' : 'bg-chino-border-2';
}

/** Whether an icon is drawn filled: the bookmark and the heart when on (a
 *  check is a line either way). */
export function iconFilled(meaning: ActionMeaning, on: boolean): boolean {
  return on && meaning !== 'watched';
}

// What screen readers call each control: its state, in the spec's words.

/** The main part of add to list: whether the title is in the Watchlist. */
export function addToListName(inWatchlist: boolean): string {
  return inWatchlist ? 'in your Watchlist' : 'add to Watchlist';
}

/** The "⌄" part of add to list, which opens the list picker. */
export const CHOOSE_LISTS = 'choose lists';

export function watchedName(watched: boolean): string {
  return watched ? 'watched' : 'mark as watched';
}

export function likedName(liked: boolean): string {
  return liked ? 'liked' : 'like';
}

/** A card's status mark of that meaning: what it says to a screen reader. */
export function markName(meaning: 'watchlist' | 'watched'): string {
  return meaning === 'watchlist' ? addToListName(true) : watchedName(true);
}

/**
 * What a press of add to list's main part does: the Watchlist, flipped -
 * in it or out of it - whatever other lists hold the title. It never
 * touches another list: a title leaves those in the list picker ("⌄"),
 * which shows a check against each list that holds it; one press taking a
 * title out of every list would be a loss no one asked for.
 */
export function watchlistPress(inWatchlist: boolean): { list: 'watchlist'; present: boolean } {
  return { list: 'watchlist', present: !inWatchlist };
}
