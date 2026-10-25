// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTION_GAP,
  ACTION_HEIGHT,
  ACTION_LABEL,
  PLAY,
  REMOVE_FROM_CONTINUE_WATCHING,
  RESUME,
  SEE_DETAILS,
  START_OVER,
  TRAILER,
  clockTime,
  resumeLabel,
  seriesPlayLabel,
  CARET_PART,
  CHOOSE_LISTS,
  ICON_BUTTON,
  OFF_LOOK,
  PLAY_LOOK,
  actionLook,
  addToListName,
  dividerLook,
  iconFilled,
  likedName,
  markName,
  watchedName,
  watchlistPress,
  type ActionMeaning,
} from './titleActions.ts';

const MEANINGS: ActionMeaning[] = ['watchlist', 'watched', 'liked'];

test('the names screen readers announce say the state, in the words of docs/chino', () => {
  assert.equal(addToListName(false), 'add to Watchlist');
  assert.equal(addToListName(true), 'in your Watchlist');
  assert.equal(CHOOSE_LISTS, 'choose lists');
  assert.equal(watchedName(false), 'mark as watched');
  assert.equal(watchedName(true), 'watched');
  assert.equal(likedName(false), 'like');
  assert.equal(likedName(true), 'liked');
  // A card's marks are named as the actions are when on.
  assert.equal(markName('watchlist'), 'in your Watchlist');
  assert.equal(markName('watched'), 'watched');
});

test('the main part of add to list toggles the Watchlist only, whatever other lists hold the title', () => {
  // Not in the Watchlist (in another list, or in none): it goes in.
  assert.deepEqual(watchlistPress(false), { list: 'watchlist', present: true });
  // In the Watchlist (and maybe others): it leaves the Watchlist, and only it.
  assert.deepEqual(watchlistPress(true), { list: 'watchlist', present: false });
  // Pressed twice, back where it was: nothing else changed on the way.
  assert.equal(watchlistPress(watchlistPress(false).present).present, false);
  for (const inWatchlist of [false, true]) assert.equal(watchlistPress(inWatchlist).list, 'watchlist');
});

test('one colour per meaning: the bookmark on blue, the check on green, the heart on red - the icon dark on it', () => {
  assert.match(actionLook('watchlist', true), /\bbg-chino-accent\b/);
  assert.match(actionLook('watched', true), /\bbg-chino-green\b/);
  assert.match(actionLook('liked', true), /\bbg-chino-red\b/);
  for (const m of MEANINGS) {
    const on = actionLook(m, true);
    assert.match(on, /\btext-chino-bg\b/, `${m}: dark on its fill`);
    assert.doesNotMatch(on, /text-white/, m);
  }
  // Play and Resume: dark on the accent too.
  assert.match(PLAY_LOOK, /\bbg-chino-accent\b/);
  assert.match(PLAY_LOOK, /\btext-chino-bg\b/);
});

test('off is the plain surface with the outlined icon in fg-2, the same for every meaning', () => {
  for (const m of MEANINGS) assert.equal(actionLook(m, false), OFF_LOOK, m);
  assert.match(OFF_LOOK, /\bbg-chino-surface-2\b/);
  assert.match(OFF_LOOK, /\btext-chino-text\b/);
  for (const m of MEANINGS) assert.equal(iconFilled(m, false), false, m);
  // On, the bookmark and the heart fill; the check is a line either way.
  assert.equal(iconFilled('watchlist', true), true);
  assert.equal(iconFilled('liked', true), true);
  assert.equal(iconFilled('watched', true), false);
});

test('no fill is see-through: the row sits on solid colours', () => {
  for (const look of [...MEANINGS.flatMap((m) => [actionLook(m, true), actionLook(m, false)]), PLAY_LOOK]) {
    for (const cls of look.split(/\s+/)) {
      if (cls.startsWith('bg-') || cls.startsWith('hover:bg-')) assert.doesNotMatch(cls, /\/\d+$|white|black/, cls);
    }
  }
  // The divider of add to list is a line, not a fill.
  assert.match(dividerLook(true), /^bg-chino-bg\/\d+$/);
  assert.equal(dividerLook(false), 'bg-chino-border-2');
});

test('every control is 48 px tall, 8 px apart; the "⌄" part drawn 40 px wide with a 48 px target', () => {
  assert.equal(ACTION_HEIGHT, 'h-12');
  assert.equal(ICON_BUTTON, 'w-12 h-12');
  assert.equal(ACTION_GAP, 'gap-2');
  assert.match(CARET_PART, /\bw-10\b/);
  assert.match(CARET_PART, /\bh-12\b/);
  // Its touch target reaches 8 px over the gap on its right, none over the main part.
  assert.match(CARET_PART, /after:-right-2/);
  assert.match(CARET_PART, /after:left-0/);
});

test("the row's words as docs/chino writes them: lowercase, in the mono face", () => {
  assert.equal(PLAY, 'play');
  assert.equal(START_OVER, 'start over');
  assert.equal(TRAILER, 'trailer');
  assert.equal(SEE_DETAILS, 'see details');
  assert.equal(ACTION_LABEL, 'font-mono');
  // A movie stopped part way: resume with where it picks up.
  assert.equal(resumeLabel(103), 'resume 1:43');
  assert.equal(resumeLabel(3725), 'resume 1:02:05');
  assert.equal(resumeLabel(59.9), 'resume 0:59');
  assert.equal(clockTime(Number.NaN), '0:00');
  for (const label of [PLAY, START_OVER, TRAILER, SEE_DETAILS, resumeLabel(103)]) assert.equal(label, label.toLowerCase(), label);
});

test("a series' first button names the episode by its code, which keeps its capitals - never the position", () => {
  // docs/chino, title actions: on a series.
  assert.equal(seriesPlayLabel(false, 'S01E01'), 'play S01E01');
  assert.equal(seriesPlayLabel(true, 'S01E03'), 'resume S01E03');
  assert.equal(seriesPlayLabel(false, 'S01E02'), 'play S01E02');
  // A file of two episodes, as the TV names it.
  assert.equal(seriesPlayLabel(false, 'S03E18–19'), 'play S03E18–19');
  // The code not known: the verb alone, no clock.
  assert.equal(seriesPlayLabel(true, null), 'resume');
  assert.equal(seriesPlayLabel(false, undefined), 'play');
});

test("a card's menu says its actions as the title row does, lowercase for the mono face", () => {
  // Never "Resume", "Mark as watched" or "Remove from Continue Watching".
  assert.equal(RESUME, 'resume');
  assert.equal(PLAY, 'play');
  assert.equal(watchedName(false), 'mark as watched');
  assert.equal(watchedName(true), 'watched');
  assert.equal(REMOVE_FROM_CONTINUE_WATCHING, 'remove from continue watching');
  for (const w of [RESUME, PLAY, watchedName(false), watchedName(true), REMOVE_FROM_CONTINUE_WATCHING]) assert.equal(w, w.toLowerCase());
});
