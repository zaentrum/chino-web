// The search page's headline. Pure: search.test.ts runs it under node --test.

export interface SearchState {
  query: string;
  /** Titles found (movies and series). */
  titles: number;
  /** People found ("Cast & crew"). */
  people: number;
  /** A search still under way: titles or people. */
  loading: boolean;
  /** The title search failed: the catalog is unreachable. */
  failed: boolean;
}

/**
 * What the search page says over its results. Titles and people both count:
 * a query that matches only an actor found something, and saying "No
 * results" over that actor's card was simply wrong. A catalog that could not
 * be searched is not a catalog without a match.
 */
export function searchHeadline({ query, titles, people, loading, failed }: SearchState): string {
  if (!query) return 'Search the library';
  if (loading) return `Searching for "${query}"…`;
  if (failed) return `Couldn't search for "${query}"`;
  const found = titles + people;
  return found > 0 ? `${found} result${found === 1 ? '' : 's'} for "${query}"` : `No results for "${query}"`;
}
