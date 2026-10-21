import { MediaCard } from './MediaCard';
import { PersonAvatar } from './PersonAvatar';
import { useSearch } from '../hooks/useSearch';
import { toApp } from '../lib/basepath';
import { searchHeadline } from '../lib/search';
import { ExtensionSlot } from './ExtensionSlot';

interface SearchPageProps {
  query: string;
}

/**
 * Search results: one search of the catalog, `/api/v1/search?q=…`
 * (useSearch). The server ranks films and series together by how they match
 * the query (the title is the query, begins with it, holds its words, then
 * typos; a plot only when no title matched), and the page renders its order
 * as-is, in one grid: no re-ranking, no films-then-series.
 *
 * Above the titles sits a "Cast & crew" section from the same search:
 * matching people with their portrait (initials without one), their name and
 * a "· N titles" credit count. Tapping a person opens the Person surface.
 */
export function SearchPage({ query }: SearchPageProps) {
  // Sixty titles ranked together; a server without the search is asked its
  // thirty films and thirty series of the query, as before.
  const search = useSearch(query, { limit: 60, people: 12, perType: 30 });

  const items = search.data?.items ?? [];
  const loading = search.loading;
  // A catalog that is DOWN and a catalog with no match are not the same thing,
  // and rendering them identically is how a total search outage looked like a
  // library that simply did not have the film — for weeks.
  const catalogError = search.error;

  const peopleList = search.data?.people ?? [];
  const total = items.length;

  // People count as results too, so the headline does not say "No results"
  // above a "Cast & crew" card.
  const headline = searchHeadline({
    query,
    titles: total,
    people: peopleList.length,
    loading,
    failed: !!catalogError,
  });

  const openPerson = (id: string) => {
    window.location.assign(toApp(`/person/${encodeURIComponent(id)}`));
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">{headline}</h1>

      {!query ? (
        <p className="text-chino-muted">Type a movie or show title in the search bar to look it up.</p>
      ) : (
        <>
          {/* Cast & crew — people matching the query, above the titles. */}
          {peopleList.length > 0 ? (
            <section className="mb-8">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-chino-muted mb-3">
                Cast &amp; crew
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {peopleList.map((p) => {
                  const credits = p.credits ?? 0;
                  const count = `· ${credits} title${credits === 1 ? '' : 's'}`;
                  return (
                    <button
                      key={p.id}
                      onClick={() => openPerson(p.id)}
                      // One name for the card: the portrait's alt text is the
                      // name too, and would otherwise be read twice.
                      aria-label={`${p.name} ${count}`}
                      className="flex items-center gap-3 p-3 rounded-lg bg-chino-surface hover:bg-chino-surface-2 transition-colors text-left"
                    >
                      <PersonAvatar name={p.name} src={p.profile_url} size={48} />
                      <div className="min-w-0">
                        <div className="text-chino-text font-medium truncate">{p.name}</div>
                        <div className="text-sm text-chino-muted">{count}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          {/* Titles — rendered in server order. */}
          {items.length === 0 ? null : (
            <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-4">
              {items.map((it) => (
                <MediaCard
                  key={`${it.type}-${it.id}`}
                  id={it.id}
                  title={it.title}
                  image={it.poster_url || ''}
                  year={it.year ? String(it.year) : undefined}
                  rating={it.rating ? it.rating.toFixed(1) : undefined}
                  type={it.type === 'series' ? 'series' : 'movie'}
                  watchedAt={it.watched_at}
                />
              ))}
            </div>
          )}

          {/* No titles matched: offer any addon-contributed actions (e.g. a
              "request" button from the acquisition addon). Empty in core. */}
          {/* Say the catalog is unreachable rather than implying the title
              does not exist — and do NOT offer to acquire something we simply
              could not look up. */}
          {!loading && catalogError ? (
            <p className="search__error">
              The catalog is unavailable right now, so we couldn't check whether
              this title is in your library. Try again in a moment.
            </p>
          ) : !loading && total === 0 && peopleList.length === 0 ? (
            <ExtensionSlot slot="search.empty" vars={{ q: query }} />
          ) : null}
        </>
      )}
    </div>
  );
}
