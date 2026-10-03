// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  freshPaging,
  nextPageOffset,
  offsetFor,
  pageFailed,
  pageLoaded,
  pageRequested,
  pagingFor,
  type PagingState,
} from './paging.ts';

type Item = { id: string; poster_url?: string };
const items = (n: number, from = 0, token = ''): Item[] =>
  Array.from({ length: n }, (_, i) => ({ id: `m${from + i}`, poster_url: `/p/${from + i}${token}` }));
const PAGE = 48;
const ALL = '{"filter":{}}';
const ANIMATION = '{"filter":{"genre":"Animation"}}';
const NINETIES = '{"filter":{"genre":"Animation","yearMin":1990,"yearMax":1999}}';

/** One grid's life: each filter change asks for the page offsetFor says,
 *  and its answer lands — what usePagedItems does with these functions. */
function browse(answers: Record<string, number>) {
  let state: PagingState<Item> = freshPaging(ALL);
  let cursor = { key: ALL, offset: 0 };
  const asked: [string, number][] = [];
  const show = (key: string) => {
    const offset = offsetFor(cursor, key);
    asked.push([key, offset]);
    state = pageRequested(state, key);
    const count = Math.max(0, Math.min(PAGE, answers[key] - offset));
    state = pageLoaded(state, key, offset, items(count, offset), PAGE);
    return pagingFor(state, key);
  };
  const more = (key: string) => {
    const next = nextPageOffset(state, key);
    if (next !== null) cursor = { key, offset: next };
    return next;
  };
  return { show, more, asked };
}

test('every filter change fetches its first page - also right after a filter whose results fit on one page', () => {
  // The bug: a filter with a short page set "no more pages", and the next
  // filter change read that flag, fetched nothing and said "No movies match".
  const grid = browse({ [ALL]: 120, [ANIMATION]: 7, [NINETIES]: 2 });
  assert.equal(grid.show(ALL).items.length, 48);
  assert.equal(grid.show(ANIMATION).items.length, 7);
  assert.equal(grid.show(NINETIES).items.length, 2);
  assert.equal(grid.show(ANIMATION).items.length, 7);
  assert.equal(grid.show(ALL).items.length, 48);
  assert.deepEqual(grid.asked, [
    [ALL, 0],
    [ANIMATION, 0],
    [NINETIES, 0],
    [ANIMATION, 0],
    [ALL, 0],
  ]);
});

test('a filter change starts at page 0, wherever the previous filter had scrolled to', () => {
  const grid = browse({ [ALL]: 120, [ANIMATION]: 60 });
  grid.show(ALL);
  assert.equal(grid.more(ALL), 48);
  assert.equal(grid.show(ALL).items.length, 96);
  assert.equal(grid.show(ANIMATION).items.length, 48);
  assert.deepEqual(grid.asked.at(-1), [ANIMATION, 0]);
});

test('a state kept for another filter is not this one\'s: loading, more to come, nothing held', () => {
  const short = pageLoaded(freshPaging<Item>(ANIMATION), ANIMATION, 0, items(3), PAGE);
  assert.equal(short.hasMore, false);
  assert.deepEqual(pagingFor(short, ALL), { key: ALL, items: [], hasMore: true, loading: true, error: null });
  // The grid for ALL says "loading", never "No movies match", until its page lands.
  assert.equal(pagingFor(short, ALL).loading, true);
});

test('loading more: the next offset is the count held; none while loading, after a failure, or at the end', () => {
  let s = pageLoaded(freshPaging<Item>(ALL), ALL, 0, items(48), PAGE);
  assert.equal(nextPageOffset(s, ALL), 48);
  assert.equal(nextPageOffset(pageRequested(s, ALL), ALL), null);
  assert.equal(nextPageOffset(pageFailed(s, ALL, new Error('chino-api 503')), ALL), null);
  s = pageLoaded(s, ALL, 48, items(10, 48), PAGE);
  assert.equal(s.items.length, 58);
  assert.equal(s.hasMore, false);
  assert.equal(nextPageOffset(s, ALL), null);
  // Another filter's state never offers its offsets to this one.
  assert.equal(nextPageOffset(s, ANIMATION), null);
});

test('a page fetched again replaces its rows (fresh artwork URLs), it is not dropped as a duplicate', () => {
  let s = pageLoaded(freshPaging<Item>(ALL), ALL, 0, items(48), PAGE);
  s = pageLoaded(s, ALL, 48, items(48, 48), PAGE);
  s = pageLoaded(s, ALL, 0, items(48, 0, '?stream=t'), PAGE);
  assert.equal(s.items.length, 48);
  assert.equal(s.items[0].poster_url, '/p/0?stream=t');
});

test('a failure keeps what was loaded, says so, and a retry asks again', () => {
  let s = pageLoaded(freshPaging<Item>(ALL), ALL, 0, items(48), PAGE);
  s = pageFailed(pageRequested(s, ALL), ALL, new Error('chino-api 503'));
  assert.equal(s.items.length, 48);
  assert.equal(s.error?.message, 'chino-api 503');
  assert.equal(s.loading, false);
  s = pageRequested(s, ALL);
  assert.equal(s.error, null);
  assert.equal(s.loading, true);
  // A first page that failed: no items, the error, not loading.
  const first = pageFailed(freshPaging<Item>(ANIMATION), ANIMATION, new Error('chino-api 503'));
  assert.deepEqual([first.items.length, first.loading, first.error?.message], [0, false, 'chino-api 503']);
});

test('rows the server sends twice across a page boundary are kept once', () => {
  let s = pageLoaded(freshPaging<Item>(ALL), ALL, 0, items(48), PAGE);
  s = pageLoaded(s, ALL, 48, [{ id: 'm47' }, ...items(47, 48)], PAGE);
  assert.equal(s.items.length, 95);
  assert.equal(new Set(s.items.map((i) => i.id)).size, 95);
});
