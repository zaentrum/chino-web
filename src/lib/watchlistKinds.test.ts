import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHOICE_PREFIX,
  KINDS,
  LOADING_ROWS,
  READ_BOUND_MS,
  byKind,
  cardsDrawn,
  forgetChoice,
  kindRowsLoader,
  kindTitle,
  listEmpty,
  partShown,
  settingsChoice,
  storedChoice,
  type ByKindParts,
  type Kind,
  type KindRows,
} from './watchlistKinds.ts';
import { featuresFrom } from './runtimeConfig.ts';

// Movies and shows apart (docs/chino, watchlist 8.8.1, settings 16.4.7).

/** A bearer of `sub`, as subjectOf reads it. */
function bearer(sub: string): string {
  const payload = Buffer.from(JSON.stringify({ sub })).toString('base64url');
  return `h.${payload}.s`;
}

class Local {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

/** A promise and its settling, for answers the test gives when it wants. */
function later<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(over: Partial<ByKindParts> = {}) {
  const local = new Local();
  const sent: { what: string; bearer: string; on?: boolean }[] = [];
  let current: string | null = bearer('parent');
  let tabSub: string | null = 'parent';
  let reads: ReturnType<typeof later<boolean>>[] = [];
  let saves: ReturnType<typeof later<boolean>>[] = [];
  // The read's bound: ended by the test (`bound()`), never by the clock.
  const bounds: { ms: number; end: () => void }[] = [];
  const parts: ByKindParts = {
    offered: () => true,
    bearer: () => current,
    mayWrite: (b) => tabSub === null || b === bearer(tabSub),
    read: (b) => {
      sent.push({ what: 'read', bearer: b });
      const l = later<boolean>();
      reads.push(l);
      return l.promise;
    },
    save: (b, on) => {
      sent.push({ what: 'save', bearer: b, on });
      const l = later<boolean>();
      saves.push(l);
      return l.promise;
    },
    local,
    wait: (ms) => {
      const l = later<void>();
      bounds.push({ ms, end: () => l.resolve() });
      return l.promise;
    },
    ...over,
  };
  const s = byKind(parts);
  return {
    s,
    local,
    sent,
    get reads() {
      return reads;
    },
    get saves() {
      return saves;
    },
    signIn(sub: string | null) {
      current = sub ? bearer(sub) : null;
    },
    tabIs(sub: string | null) {
      tabSub = sub;
    },
    reset() {
      reads = [];
      saves = [];
    },
    /** The bound of the read asked last runs out. */
    bound() {
      const b = bounds.at(-1);
      assert.equal(b?.ms, READ_BOUND_MS);
      b?.end();
    },
  };
}

const tick = () => new Promise((r) => setImmediate(r));

test('the server offers it only with an explicit true', () => {
  assert.equal(featuresFrom({ features: { watchlist_kinds: true } }).watchlistKinds, true);
  for (const raw of [{}, { features: {} }, { features: { watchlist_kinds: 'true' } }, { features: { watchlist_kinds: 1 } }, null]) {
    assert.equal(featuresFrom(raw).watchlistKinds, false, JSON.stringify(raw));
  }
});

test('the words: a part is its name and its own count', () => {
  assert.deepEqual(
    KINDS.map((k) => k.label),
    ['movies', 'shows'],
  );
  assert.equal(kindTitle('movies', 4), 'movies · 4');
  assert.equal(kindTitle('shows', 0), 'shows · 0');
});

test('drawn at once with the copy kept for the account, off where there is none', () => {
  const t = setup();
  assert.equal(t.s.state().on, false);
  t.local.setItem(CHOICE_PREFIX + 'parent', '1');
  assert.equal(t.s.state().on, true);
  assert.equal(t.s.split(), true);
  // Another account's copy is never this one's.
  t.local.setItem(CHOICE_PREFIX + 'child', '0');
  assert.equal(t.s.state().on, true);
});

test('the same state object while nothing changed, for useSyncExternalStore', () => {
  const t = setup();
  assert.equal(t.s.state(), t.s.state());
});

test('a read keeps the answer for the account and follows it; being read, the choice shown stays and is busy', async () => {
  const t = setup();
  t.local.setItem(CHOICE_PREFIX + 'parent', '0');
  const read = t.s.read();
  assert.deepEqual(t.s.state(), { on: false, reading: true, saving: null, saveFailed: null });
  t.reads[0].resolve(true);
  await read;
  assert.deepEqual(t.s.state(), { on: true, reading: false, saving: null, saveFailed: null });
  assert.equal(storedChoice(t.local, 'parent'), true);
  assert.deepEqual(t.sent, [{ what: 'read', bearer: bearer('parent') }]);
});

test('a read that failed leaves the choice shown, and it works', async () => {
  const t = setup();
  t.local.setItem(CHOICE_PREFIX + 'parent', '1');
  const read = t.s.read();
  t.reads[0].reject(new Error('offline'));
  await read;
  assert.deepEqual(t.s.state(), { on: true, reading: false, saving: null, saveFailed: null });
  assert.equal(t.s.split(), true);
});

test('a save is the choice from its answer on; a read out meanwhile keeps nothing', async () => {
  const t = setup();
  const read = t.s.read();
  const save = t.s.press(true);
  assert.equal(t.s.state().saving, true);
  t.saves[0].resolve(true);
  await save;
  // The read answers with the choice before the save.
  t.reads[0].resolve(false);
  await read;
  assert.equal(t.s.state().on, true);
  assert.equal(storedChoice(t.local, 'parent'), true);
  assert.deepEqual(t.sent.at(-1), { what: 'save', bearer: bearer('parent'), on: true });
});

test('a save that failed: the switch goes back, and why stays until it is used again', async () => {
  const t = setup();
  t.local.setItem(CHOICE_PREFIX + 'parent', '0');
  const why = Object.assign(new Error('refused'), { status: 500 });
  const save = t.s.press(true);
  t.saves[0].reject(why);
  await save;
  assert.equal(t.s.state().on, false);
  assert.equal(t.s.state().saving, null);
  assert.equal(t.s.state().saveFailed, why);
  const again = t.s.press(true);
  assert.equal(t.s.state().saveFailed, null);
  t.saves[1].resolve(true);
  await again;
  assert.equal(t.s.state().on, true);
});

test('one save at a time: a press while one is out sends nothing', async () => {
  const t = setup();
  const one = t.s.press(true);
  const two = t.s.press(false);
  assert.equal(t.saves.length, 1);
  t.saves[0].resolve(true);
  // Settled either way, so the test ends whatever was sent.
  t.saves[1]?.resolve(false);
  await Promise.all([one, two]);
  assert.equal(t.s.state().on, true);
});

test("nothing goes with another account's bearer: no read, no save, nothing shown of it", async () => {
  const t = setup();
  t.local.setItem(CHOICE_PREFIX + 'child', '1');
  // The browser's sign-in is another account's; the tab stays with the parent's.
  t.signIn('child');
  assert.equal(t.s.state().on, false);
  await t.s.read();
  await t.s.press(true);
  assert.deepEqual(t.sent, []);
});

test('nobody signed in, or not offered: nothing is read or sent, and lists are not split', async () => {
  const t = setup();
  t.signIn(null);
  await t.s.read();
  await t.s.press(true);
  assert.deepEqual(t.sent, []);
  const off = setup({ offered: () => false });
  off.local.setItem(CHOICE_PREFIX + 'parent', '1');
  await off.s.read();
  await off.s.press(false);
  assert.deepEqual(off.sent, []);
  assert.equal(off.s.split(), false);
});

test('another tab of the account: its answer is followed, and a read out here keeps nothing', async () => {
  const t = setup();
  const read = t.s.read();
  t.s.heard(CHOICE_PREFIX + 'parent', '1');
  assert.equal(t.s.state().on, true);
  t.reads[0].resolve(false);
  await read;
  assert.equal(t.s.state().on, true);
  // Another key, or another account's: nothing changes here.
  t.s.heard('chino:settings:v1', '{}');
  t.s.heard(CHOICE_PREFIX + 'child', '0');
  assert.equal(t.s.state().on, true);
});

test("the account leaves: its copy goes, and a read or a save still out for it keeps nothing", async () => {
  const t = setup();
  t.local.setItem(CHOICE_PREFIX + 'parent', '1');
  t.local.setItem(CHOICE_PREFIX + 'child', '1');
  const read = t.s.read();
  const save = t.s.press(true);
  t.s.forget('parent');
  t.reads[0].resolve(true);
  t.saves[0].resolve(true);
  await read;
  await save;
  assert.equal(storedChoice(t.local, 'parent'), null);
  assert.equal(t.s.state().on, false);
  // Only that account's.
  assert.equal(storedChoice(t.local, 'child'), true);
  forgetChoice(t.local, null);
  assert.equal(storedChoice(t.local, 'child'), true);
});

test('another tab saw the account leave: the copy shown goes here too', () => {
  const t = setup();
  t.local.setItem(CHOICE_PREFIX + 'parent', '1');
  t.s.heard(CHOICE_PREFIX + 'parent', '1');
  t.local.removeItem(CHOICE_PREFIX + 'parent');
  t.s.heard(CHOICE_PREFIX + 'parent', null);
  assert.equal(t.s.state().on, false);
});

test('listeners hear every change', async () => {
  const t = setup();
  let heard = 0;
  const stop = t.s.subscribe(() => heard++);
  const read = t.s.read();
  t.reads[0].resolve(true);
  await read;
  assert.ok(heard >= 2);
  stop();
  const before = heard;
  t.s.heard(CHOICE_PREFIX + 'parent', '0');
  assert.equal(heard, before);
});

/** A loader over answers the test gives when it wants, noting each request's
 *  bearer and kind. */
function loaderSetup() {
  let current: string | null = 'bearer-1';
  const asked: { bearer: string; kind: Kind; answer: ReturnType<typeof later<string[]>> }[] = [];
  const loader = kindRowsLoader({
    bearer: () => current,
    fetchKind: (bearer, kind) => {
      const answer = later<string[]>();
      asked.push({ bearer, kind, answer });
      return answer.promise;
    },
  });
  const drawn: KindRows[] = [];
  loader.subscribe(() => drawn.push(loader.rows()));
  return {
    loader,
    asked,
    drawn,
    renew(bearer: string) {
      current = bearer;
    },
  };
}

test('the two parts are asked one after the other, movies first, each drawn as it came', async () => {
  const t = loaderSetup();
  assert.deepEqual(t.loader.rows(), LOADING_ROWS);
  const done = t.loader.load();
  await tick();
  assert.deepEqual(t.asked.map((a) => a.kind), ['movie']);
  t.asked[0].answer.resolve(['m1', 'm2']);
  await tick();
  assert.deepEqual(t.asked.map((a) => a.kind), ['movie', 'series']);
  assert.deepEqual(t.drawn[0], { movie: { state: 'loaded', ids: ['m1', 'm2'] }, series: { state: 'loading' } });
  const why = new Error('no');
  t.asked[1].answer.reject(why);
  await done;
  assert.deepEqual(t.loader.rows(), { movie: { state: 'loaded', ids: ['m1', 'm2'] }, series: { state: 'failed', error: why } });
  assert.equal(t.drawn.length, 2);
  // The same object while unchanged, for useSyncExternalStore.
  assert.equal(t.loader.rows(), t.loader.rows());
});

test('loaded again, what is shown stays until each answer comes', async () => {
  const t = loaderSetup();
  const first = t.loader.load();
  await tick();
  t.asked[0].answer.resolve(['a']);
  await tick();
  t.asked[1].answer.resolve(['b']);
  await first;
  const again = t.loader.load();
  await tick();
  assert.deepEqual(t.loader.rows(), { movie: { state: 'loaded', ids: ['a'] }, series: { state: 'loaded', ids: ['b'] } });
  t.asked[2].answer.resolve(['a', 'c']);
  await tick();
  assert.deepEqual(t.loader.rows().series, { state: 'loaded', ids: ['b'] });
  t.asked[3].answer.resolve(['b']);
  await again;
});

test('a reload after the bearer was renewed asks with the new one', async () => {
  const t = loaderSetup();
  const first = t.loader.load();
  await tick();
  t.asked[0].answer.resolve([]);
  await tick();
  t.asked[1].answer.resolve([]);
  await first;
  // The sign-in renewed; the list was opened with the bearer before.
  t.renew('bearer-2');
  const again = t.loader.load();
  await tick();
  t.asked[2].answer.resolve([]);
  await tick();
  t.asked[3].answer.resolve([]);
  await again;
  assert.deepEqual(t.asked.map((a) => a.bearer), ['bearer-1', 'bearer-1', 'bearer-2', 'bearer-2']);
  // A part tried again takes the bearer of its moment too.
  t.renew('bearer-3');
  const retried = t.loader.retry('series');
  t.asked[4].answer.resolve([]);
  await retried;
  assert.equal(t.asked[4].bearer, 'bearer-3');
});

test('a part tried again is not drawn as failed at the next reload', async () => {
  const t = loaderSetup();
  const first = t.loader.load();
  await tick();
  t.asked[0].answer.resolve(['m']);
  await tick();
  t.asked[1].answer.reject(new Error('busy'));
  await first;
  assert.equal(t.loader.rows().series.state, 'failed');
  const retried = t.loader.retry('series');
  assert.equal(t.loader.rows().series.state, 'loading');
  t.asked[2].answer.resolve(['s']);
  await retried;
  // The next reload starts from what is shown now: the part tried again.
  const again = t.loader.load();
  await tick();
  assert.deepEqual(t.loader.rows().series, { state: 'loaded', ids: ['s'] });
  t.asked[3].answer.resolve(['m']);
  await tick();
  assert.deepEqual(t.loader.rows().series, { state: 'loaded', ids: ['s'] });
  t.asked[4].answer.resolve(['s']);
  await again;
});

test("the answer of the request asked last for a part is the one drawn, whichever comes first", async () => {
  const t = loaderSetup();
  const first = t.loader.load();
  await tick();
  // Tried again while the load's request for movies is still out.
  const retried = t.loader.retry('movie');
  t.asked[1].answer.resolve(['new']);
  await retried;
  t.asked[0].answer.resolve(['old']);
  await tick();
  assert.deepEqual(t.loader.rows().movie, { state: 'loaded', ids: ['new'] });
  t.asked[2].answer.resolve([]);
  await first;
});

test('a list no longer shown draws nothing more; without a bearer a part fails', async () => {
  const t = loaderSetup();
  const first = t.loader.load();
  await tick();
  t.loader.stop();
  t.asked[0].answer.resolve(['m']);
  await tick();
  assert.deepEqual(t.loader.rows(), LOADING_ROWS);
  t.asked[1]?.answer.resolve([]);
  await first;
  const signedOut = loaderSetup();
  signedOut.renew(null as unknown as string);
  await signedOut.loader.retry('movie');
  assert.equal(signedOut.loader.rows().movie.state, 'failed');
  assert.equal(signedOut.asked.length, 0);
});

test('a part has cards to draw only once its titles were answered for its own ids', () => {
  const row = { state: 'loaded', ids: ['a', 'b'] } as const;
  // The answer before, for no ids, seen a render before the hook says loading.
  assert.equal(cardsDrawn(row, { loading: false, forIds: '', count: 0 }), null);
  assert.equal(cardsDrawn(row, { loading: true, forIds: 'a,b', count: 2 }), null);
  assert.equal(cardsDrawn(row, { loading: false, forIds: 'a,b', count: 2 }), 2);
  assert.equal(cardsDrawn(row, { loading: false, forIds: 'a,b', count: 0 }), 0);
  assert.equal(cardsDrawn({ state: 'loaded', ids: [] }, { loading: true, forIds: null, count: 0 }), 0);
  assert.equal(cardsDrawn({ state: 'loading' }, { loading: false, forIds: '', count: 0 }), null);
  // A shelf asks for its first titles only.
  assert.equal(cardsDrawn({ state: 'loaded', ids: ['a', 'b', 'c'] }, { loading: false, forIds: 'a,b', count: 2 }, 2), 2);
  // A list of shows only never reads as empty before its titles came.
  const showsOnly: KindRows = { movie: { state: 'loaded', ids: [] }, series: row };
  assert.equal(listEmpty(showsOnly, { movie: 0, series: cardsDrawn(row, { loading: false, forIds: '', count: 0 }) }), false);
});

test('an answer of the settings without a boolean is no answer of the choice', () => {
  assert.equal(settingsChoice({ watchlist_by_kind: true }), true);
  assert.equal(settingsChoice({ watchlist_by_kind: false, language: null }), false);
  for (const body of [{}, { watchlist_by_kind: 'true' }, { watchlist_by_kind: 1 }, { watchlist_by_kind: null }, null, []]) {
    assert.throws(() => settingsChoice(body), SyntaxError, JSON.stringify(body));
  }
});

test('a read that takes longer than its bound has failed: the switch is no longer busy, and its late answer keeps nothing', async () => {
  const t = setup();
  t.local.setItem(CHOICE_PREFIX + 'parent', '0');
  const read = t.s.read();
  assert.equal(t.s.state().reading, true);
  t.bound();
  await read;
  assert.deepEqual(t.s.state(), { on: false, reading: false, saving: null, saveFailed: null });
  t.reads[0].resolve(true);
  await tick();
  assert.equal(t.s.state().on, false);
  assert.equal(storedChoice(t.local, 'parent'), false);
});

test('an account that left in another tab: nothing of it is read, sent or kept here again', async () => {
  const t = setup();
  t.local.setItem(CHOICE_PREFIX + 'parent', '1');
  const read = t.s.read();
  // Signed out, or deleted, in another tab: its copy went there.
  t.local.removeItem(CHOICE_PREFIX + 'parent');
  t.s.heard(CHOICE_PREFIX + 'parent', null);
  t.reads[0].resolve(true);
  await read;
  assert.equal(storedChoice(t.local, 'parent'), null);
  await t.s.read();
  await t.s.press(true);
  assert.equal(t.sent.length, 1);
  assert.equal(storedChoice(t.local, 'parent'), null);
  assert.equal(t.s.state().on, false);
  // The same account signed in there again, its copy kept anew: followed.
  t.local.setItem(CHOICE_PREFIX + 'parent', '1');
  t.s.heard(CHOICE_PREFIX + 'parent', '1');
  assert.equal(t.s.state().on, true);
  const again = t.s.read();
  t.reads[1].resolve(false);
  await again;
  assert.equal(storedChoice(t.local, 'parent'), false);
});

test('an account that left here: nothing of it is read or sent again from this tab', async () => {
  const t = setup();
  t.s.forget('parent');
  await t.s.read();
  await t.s.press(true);
  assert.deepEqual(t.sent, []);
  assert.equal(storedChoice(t.local, 'parent'), null);
});

test('a part with nothing in it, or no card to draw, is left out; loading and failed parts show', () => {
  assert.equal(partShown({ state: 'loaded', ids: [] }, 0), false);
  assert.equal(partShown({ state: 'loaded', ids: ['x'] }, 0), false);
  assert.equal(partShown({ state: 'loaded', ids: ['x'] }, null), true);
  assert.equal(partShown({ state: 'loaded', ids: ['x'] }, 1), true);
  assert.equal(partShown({ state: 'loading' }, null), true);
  assert.equal(partShown({ state: 'failed', error: null }, null), true);
});

test('a list is empty only where both parts came with no card to draw', () => {
  const empty: KindRows = { movie: { state: 'loaded', ids: [] }, series: { state: 'loaded', ids: [] } };
  assert.equal(listEmpty(empty, { movie: 0, series: 0 }), true);
  // Titles the catalog has none of.
  assert.equal(listEmpty({ movie: { state: 'loaded', ids: ['gone'] }, series: { state: 'loaded', ids: [] } }, { movie: 0, series: 0 }), true);
  assert.equal(listEmpty({ movie: { state: 'loaded', ids: ['m'] }, series: { state: 'loaded', ids: [] } }, { movie: 1, series: 0 }), false);
  assert.equal(listEmpty(LOADING_ROWS, { movie: null, series: null }), false);
  assert.equal(listEmpty({ movie: { state: 'failed', error: null }, series: { state: 'loaded', ids: [] } }, { movie: null, series: 0 }), false);
});
