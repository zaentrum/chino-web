import { useEffect, useState } from 'react';
import { useAuth } from 'react-oidc-context';

export interface BrowseQuery {
  genre?: string;
  yearMin?: number;
  yearMax?: number;
  ratingMin?: number;
  sort?: 'rating' | 'year' | 'title' | 'newest';
}

interface BrowseFiltersProps {
  value: BrowseQuery;
  onChange: (q: BrowseQuery) => void;
}

const DECADES: { label: string; min: number; max: number }[] = [
  { label: '2020s', min: 2020, max: 2099 },
  { label: '2010s', min: 2010, max: 2019 },
  { label: '2000s', min: 2000, max: 2009 },
  { label: '1990s', min: 1990, max: 1999 },
  { label: '1980s', min: 1980, max: 1989 },
  { label: 'Older', min: 1900, max: 1979 },
];

const RATINGS: { label: string; min: number }[] = [
  { label: '8.0+', min: 8.0 },
  { label: '7.0+', min: 7.0 },
  { label: '6.0+', min: 6.0 },
];

const SORTS: { label: string; value: NonNullable<BrowseQuery['sort']> }[] = [
  { label: 'Title', value: 'title' },
  { label: 'Newest added', value: 'newest' },
  { label: 'Rating', value: 'rating' },
  { label: 'Year (newest)', value: 'year' },
];

/**
 * Lightweight filter chip strip rendered above the Movies / Shows grids.
 * Loads genres from chino-api so the chip set reflects the actual library.
 * Genre, decade, and rating are independent filters — apply them all in
 * the URL state via onChange.
 */
export function BrowseFilters({ value, onChange }: BrowseFiltersProps) {
  const auth = useAuth();
  const [genres, setGenres] = useState<string[]>([]);

  useEffect(() => {
    if (auth.isLoading || !auth.isAuthenticated) return;
    fetch('/api/v1/genres', {
      headers: { Authorization: `Bearer ${auth.user?.access_token ?? ''}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setGenres(Array.isArray(j?.genres) ? j.genres : []))
      .catch(() => setGenres([]));
  }, [auth.isAuthenticated, auth.isLoading, auth.user?.access_token]);

  const activeDecade = DECADES.find((d) => d.min === value.yearMin && d.max === value.yearMax);
  const activeRating = RATINGS.find((r) => r.min === value.ratingMin);

  return (
    <div className="mb-6 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[#8b949e] text-sm mr-1 w-16 shrink-0">Genre</span>
        <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Chip
            active={!value.genre}
            onClick={() => onChange({ ...value, genre: undefined })}
          >
            All
          </Chip>
          {genres.map((g) => {
            const isActive = value.genre === g;
            return (
              <Chip
                key={g}
                active={isActive}
                onClick={() =>
                  onChange({ ...value, genre: isActive ? undefined : g })
                }
              >
                {g}
              </Chip>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[#8b949e] text-sm mr-1 w-16">Decade</span>
        {DECADES.map((d) => {
          const isActive = activeDecade?.label === d.label;
          return (
            <Chip
              key={d.label}
              active={isActive}
              onClick={() =>
                onChange({
                  ...value,
                  yearMin: isActive ? undefined : d.min,
                  yearMax: isActive ? undefined : d.max,
                })
              }
            >
              {d.label}
            </Chip>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[#8b949e] text-sm mr-1 w-16">Rating</span>
        {RATINGS.map((r) => {
          const isActive = activeRating?.label === r.label;
          return (
            <Chip
              key={r.label}
              active={isActive}
              onClick={() =>
                onChange({ ...value, ratingMin: isActive ? undefined : r.min })
              }
            >
              {r.label}
            </Chip>
          );
        })}
        <span className="text-[#8b949e] text-sm ml-4 mr-1 w-16">Sort</span>
        {SORTS.map((s) => {
          // Default (undefined sort) and explicit 'title' both render the
          // catalogue's natural alphabetical order (katalog-api falls
          // through to ORDER BY sorttitle ASC when sort is empty), so the
          // Title chip is the active default when no sort is set.
          const isActive = (value.sort ?? 'title') === s.value;
          return (
            <Chip
              key={s.value}
              active={isActive}
              onClick={() => onChange({ ...value, sort: s.value })}
            >
              {s.label}
            </Chip>
          );
        })}
        {hasAnyFilter(value) ? (
          <button
            onClick={() => onChange({})}
            className="ml-auto text-sm text-[#8b949e] hover:text-white underline-offset-2 hover:underline"
          >
            Clear filters
          </button>
        ) : null}
      </div>
    </div>
  );
}

function hasAnyFilter(q: BrowseQuery): boolean {
  return !!(q.genre || q.yearMin || q.yearMax || q.ratingMin || q.sort);
}

function Chip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-3 py-1 rounded-full text-xs border transition-colors ${
        active
          ? 'bg-[#58a6ff] border-[#58a6ff] text-white'
          : 'bg-[#161b22] border-[#30363d] text-[#c9d1d9] hover:bg-[#21262d]'
      }`}
    >
      {children}
    </button>
  );
}
