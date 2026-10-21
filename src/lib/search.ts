// The search: one ranked search of the catalog, and the search page's
// headline. Pure: search.test.ts runs it under node --test.

/**
 * The types of title the search asks the server for. The server ranks films,
 * series and episodes together; episodes are left out here until there is an
 * episode result card (the later UI rework):
 *
 * To show episodes, add 'episode' here. Each episode hit carries its `series`
 * (id, title, poster_url, matched) and its season_number/episode_number. The
 * agreed card shows it as its series' poster card with one line under the
 * title, e.g. "S05E14 · Ozymandias", read from the data, and opens the series
 * on that episode; when the series matched by its own title too
 * (`series.matched`), the two are one card.
 */
export const SEARCH_TYPES: readonly string[] = ['movie', 'series'];

/** How a title or a person matched the query, best first; `plot` only when
 *  no title matched. */
export type SearchMatch = 'exact' | 'prefix' | 'words' | 'alternative' | 'similar' | 'plot';

/** An episode hit's series, as chino-api sends it. */
export interface SearchSeries {
  id: string;
  title: string;
  /** The series matched the query by its own title in the same search. */
  matched: boolean;
  poster_url?: string;
}

/** What one search asks for: how many titles and people, and of which types. */
export interface SearchRequest {
  limit: number;
  people: number;
  types?: readonly string[];
}

/** The URL of one search of the catalog: chino-api's /api/v1/search. */
export function searchUrl(query: string, { limit, people, types = SEARCH_TYPES }: SearchRequest): string {
  const params = new URLSearchParams({ q: query, types: types.join(','), limit: String(limit), people: String(people) });
  return `/api/v1/search?${params}`;
}

/** A server older than the search answers it 404: it is then searched as
 *  before (searchAsBefore). */
export function searchIsMissing(status: number): boolean {
  return status === 404;
}

/** The URLs a server without the search is searched by, as before: the films
 *  of the query, its series, and its people. */
export function searchAsBeforeUrls(query: string, { limit, people }: SearchRequest): {
  movies: string;
  series: string;
  people: string;
} {
  const list = (type: string) => `/api/v1/items?${new URLSearchParams({ q: query, limit: String(limit), type })}`;
  return {
    movies: list('movie'),
    series: list('series'),
    people: `/api/v1/people?${new URLSearchParams({ q: query, limit: String(people) })}`,
  };
}

/** The titles of a search as before: the films, then the series, each in the
 *  server's order, at most limit of them. */
export function mergeAsBefore<T>(movies: T[], series: T[], limit: number): T[] {
  return [...movies, ...series].slice(0, limit);
}

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
