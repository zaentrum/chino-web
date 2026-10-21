// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeAsBefore, SEARCH_TYPES, searchAsBeforeUrls, searchHeadline, searchIsMissing, searchUrl, type SearchState } from './search.ts';

const state = (s: Partial<SearchState>): SearchState => ({
  query: 'hoffman',
  titles: 0,
  people: 0,
  loading: false,
  failed: false,
  ...s,
});

test('people count: a query only an actor matches has results', () => {
  assert.equal(searchHeadline(state({ people: 1 })), '1 result for "hoffman"');
  assert.equal(searchHeadline(state({ people: 3 })), '3 results for "hoffman"');
});

test('titles and people add up', () => {
  assert.equal(searchHeadline(state({ titles: 2, people: 1 })), '3 results for "hoffman"');
  assert.equal(searchHeadline(state({ titles: 1 })), '1 result for "hoffman"');
});

test('“No results” only when nothing matched at all', () => {
  assert.equal(searchHeadline(state({})), 'No results for "hoffman"');
});

test('a search under way, a failed search, no query', () => {
  assert.equal(searchHeadline(state({ loading: true, people: 1 })), 'Searching for "hoffman"…');
  assert.equal(searchHeadline(state({ failed: true, people: 1 })), 'Couldn\'t search for "hoffman"');
  assert.equal(searchHeadline(state({ query: '' })), 'Search the library');
});

test('one search of films and series, the types the page shows', () => {
  const url = new URL(searchUrl('widow’s bay', { limit: 60, people: 12 }), 'https://chino.example');
  assert.equal(url.pathname, '/api/v1/search');
  assert.equal(url.searchParams.get('q'), 'widow’s bay');
  assert.equal(url.searchParams.get('types'), 'movie,series');
  assert.equal(url.searchParams.get('limit'), '60');
  assert.equal(url.searchParams.get('people'), '12');
  assert.deepEqual(SEARCH_TYPES, ['movie', 'series'], 'episodes wait for their result card');
  const all = new URL(searchUrl('x', { limit: 8, people: 0, types: ['movie', 'series', 'episode'] }), 'https://chino.example');
  assert.equal(all.searchParams.get('types'), 'movie,series,episode');
  assert.equal(all.searchParams.get('people'), '0');
});

test('a server without the search is searched as before', () => {
  assert.equal(searchIsMissing(404), true);
  for (const status of [200, 401, 500, 502, 503]) assert.equal(searchIsMissing(status), false);
  const urls = searchAsBeforeUrls('a & b', { limit: 60, people: 12, perType: 30 });
  assert.equal(urls.movies, '/api/v1/items?q=a+%26+b&limit=30&type=movie');
  assert.equal(urls.series, '/api/v1/items?q=a+%26+b&limit=30&type=series');
  assert.equal(urls.people, '/api/v1/people?q=a+%26+b&limit=12');
  assert.equal(searchAsBeforeUrls('x', { limit: 8, people: 0 }).movies, '/api/v1/items?q=x&limit=8&type=movie');
  // Each list whole: many films never push the series out.
  assert.deepEqual(mergeAsBefore(['m1', 'm2'], ['s1']), ['m1', 'm2', 's1']);
});
