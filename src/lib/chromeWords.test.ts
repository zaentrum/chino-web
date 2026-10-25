// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DETAILS_BODY,
  DETAILS_BODY_START,
  DETAILS_DISCLOSURE,
  detailsBody,
  PAGE_HEADING,
  QUIET_BUTTON,
  SECTION_HEADING,
  SETTINGS_WORDS,
  START_PLAYBACK,
  START_PLAYBACK_BUTTON,
  WATCHLIST_WORDS,
} from './chromeWords.ts';

const classes = (look: string) => look.split(/\s+/);

test("Settings' chrome in the mono face, lowercase: the heading, the sections' titles, reset to defaults, report a bug", () => {
  assert.deepEqual(SETTINGS_WORDS, {
    heading: 'settings',
    binge: 'binge watching',
    audio: 'audio',
    subtitles: 'subtitles',
    feedback: 'feedback',
    reportBug: 'report a bug',
    reset: 'reset to defaults',
  });
  for (const w of Object.values(SETTINGS_WORDS)) assert.equal(w, w.toLowerCase(), w);
  for (const look of [PAGE_HEADING, SECTION_HEADING, QUIET_BUTTON]) assert.ok(classes(look).includes('font-mono'), look);
});

test("the Watchlist page's heading and new list in the mono face, lowercase", () => {
  assert.equal(WATCHLIST_WORDS.heading, 'watchlist');
  assert.equal(WATCHLIST_WORDS.newList, 'new list');
  for (const w of Object.values(WATCHLIST_WORDS)) assert.equal(w, w.toLowerCase(), w);
});

test('the start button says "play" in the mono face, solid - never "click", on no see-through wash', () => {
  assert.equal(START_PLAYBACK, 'play');
  assert.doesNotMatch(START_PLAYBACK, /click|tap/i);
  const look = classes(START_PLAYBACK_BUTTON);
  assert.ok(look.includes('font-mono'));
  assert.ok(look.includes('bg-chino-accent'));
  // A solid fill: no opacity on it.
  for (const c of look) assert.doesNotMatch(c, /^bg-.*\/\d+$|^bg-black/, c);
});

test('square, as every frame in the design system: no rounded corners on the chrome', () => {
  for (const look of [PAGE_HEADING, SECTION_HEADING, QUIET_BUTTON, START_PLAYBACK_BUTTON]) {
    for (const c of classes(look)) assert.doesNotMatch(c, /^rounded/, c);
    // Tokens only: no see-through white washes.
    for (const c of classes(look)) assert.doesNotMatch(c, /white\/\d+/, c);
  }
});

test("the bug dialog's frame, fields and buttons are square: no rounded-xl, rounded-lg, rounded-md", () => {
  const source = readFileSync(new URL('../components/BugReportDialog.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\brounded(-[a-z0-9]+)?\b/);
});

test('opening "details" never moves the centred block: what it opens takes no room of its own', () => {
  const body = DETAILS_BODY.split(/\s+/);
  assert.ok(body.includes('absolute') && body.includes('top-full'));
  // Centred under its summary, never wider than the screen leaves.
  assert.ok(body.includes('left-1/2') && body.includes('-translate-x-1/2'));
  assert.ok(body.some((c) => c.startsWith('max-w-[')));
  // The disclosure is what it is placed against, in the muted grey.
  assert.ok(DETAILS_DISCLOSURE.split(/\s+/).includes('relative'));
  assert.ok(DETAILS_DISCLOSURE.split(/\s+/).includes('text-chino-muted'));
  assert.equal(detailsBody('center'), DETAILS_BODY);
});

test('in a column aligned at the start, "details" opens from its left edge, in the flow - never centred on the summary and cut off', () => {
  assert.equal(detailsBody('start'), DETAILS_BODY_START);
  const body = classes(DETAILS_BODY_START);
  for (const c of ['absolute', 'left-1/2', '-translate-x-1/2', 'w-max', 'text-center']) assert.ok(!body.includes(c), c);
  assert.ok(body.includes('font-mono') && body.includes('mt-1'));
  // The search page's failure is such a column: it asks for the start.
  const search = readFileSync(new URL('../components/SearchPage.tsx', import.meta.url), 'utf8');
  assert.match(search, /flex flex-col items-start/);
  assert.match(search, /<FailureDetails [^>]*align="start"/);
  // The centred screens keep the default, the body centred on its summary.
  for (const file of ['CouldntLoad.tsx', 'StatusPage.tsx']) {
    const source = readFileSync(new URL(`../components/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /<FailureDetails [^>]*align="start"/, file);
  }
});
