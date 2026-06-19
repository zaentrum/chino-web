import { useMemo } from 'react';
import { MediaCard } from './MediaCard';
import { PersonAvatar } from './PersonAvatar';
import { useItems } from '../hooks/useItems';
import { usePeople, type PersonSummary } from '../hooks/usePeople';

interface SearchPageProps {
  query: string;
}

/**
 * Search results. Hits `/api/v1/items?q=…` for both movies and series in
 * parallel and renders the results in the order katalog-api returns
 * them — the backend now ranks `q=…` queries by relevance (exact >
 * prefix > FTS rank > alpha), so the client renders the server order
 * as-is and does NOT re-rank. Movies and series are kept as one merged
 * list so the strongest hits land at the top regardless of type.
 *
 * Above the title results sits a "Cast & crew" section driven by
 * `/api/v1/people?q=…` (same debounced query as the titles): matching
 * people with an initials-avatar placeholder, their name and a "· N
 * titles" credit count. Tapping a person opens the Person surface.
 */
export function SearchPage({ query }: SearchPageProps) {
  const movies = useItems(query, 30, 'movie');
  const series = useItems(query, 30, 'series');
  const people = usePeople(query, 12);

  const movieItems = movies.data?.source === 'katalog' ? movies.data.items : [];
  const seriesItems = series.data?.source === 'katalog' ? series.data.items : [];
  const loading = movies.loading || series.loading;

  // Merge movies + series, preserving the server's per-type relevance
  // order via a stable interleave-free concat. Each type already arrives
  // ranked; we keep movies first then series rather than re-sorting by a
  // local relevance score.
  const items = useMemo(
    () => [
      ...movieItems.map((it) => ({ ...it, _kind: 'movie' as const })),
      ...seriesItems.map((it) => ({ ...it, _kind: 'series' as const })),
    ],
    [movieItems, seriesItems],
  );

  const peopleList: PersonSummary[] = people.data?.people ?? [];
  const total = items.length;

  const headline = useMemo(() => {
    if (!query) return 'Search the library';
    if (loading) return `Searching for "${query}"…`;
    return total > 0 ? `${total} result${total === 1 ? '' : 's'} for "${query}"` : `No results for "${query}"`;
  }, [query, total, loading]);

  const openPerson = (id: string) => {
    window.location.assign(`/person/${encodeURIComponent(id)}`);
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">{headline}</h1>

      {!query ? (
        <p className="text-[#8b949e]">Type a movie or show title in the search bar to look it up.</p>
      ) : (
        <>
          {/* Cast & crew — people matching the query, above the titles. */}
          {peopleList.length > 0 ? (
            <section className="mb-8">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[#8b949e] mb-3">
                Cast &amp; crew
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {peopleList.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => openPerson(p.id)}
                    className="flex items-center gap-3 p-3 rounded-lg bg-[#161b22] hover:bg-[#21262d] transition-colors text-left"
                  >
                    <PersonAvatar name={p.name} size={48} />
                    <div className="min-w-0">
                      <div className="text-[#c9d1d9] font-medium truncate">{p.name}</div>
                      <div className="text-sm text-[#8b949e]">
                        · {p.credits} title{p.credits === 1 ? '' : 's'}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {/* Titles — rendered in server order. */}
          {items.length === 0 ? null : (
            <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-4">
              {items.map((it) => (
                <MediaCard
                  key={`${it._kind}-${it.id}`}
                  id={it.id}
                  title={it.title}
                  image={it.poster_url || ''}
                  year={it.year ? String(it.year) : undefined}
                  rating={it.rating ? it.rating.toFixed(1) : undefined}
                  type={it._kind}
                  watchedAt={it.watched_at}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
