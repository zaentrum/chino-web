// node --test (type stripping, Node >= 22.18). Excluded from the app's tsc program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchHeadline, type SearchState } from './search.ts';

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
