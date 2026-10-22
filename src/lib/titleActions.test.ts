// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTION_GAP,
  ACTION_HEIGHT,
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
