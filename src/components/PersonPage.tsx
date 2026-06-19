import { ArrowLeft, Loader2 } from 'lucide-react';
import { MediaCard } from './MediaCard';
import { PersonAvatar } from './PersonAvatar';
import { usePerson } from '../hooks/usePeople';

interface PersonPageProps {
  personId: string;
}

/**
 * Person / Filmography surface. Top-level route (`/person/:id`), reached
 * from the search "Cast & crew" section and from tappable cast names on
 * the detail page. Header = name + initials avatar + credit count; body =
 * a grid of the person's titles, rendered with the same MediaCard / grid
 * the Browse and Watchlist surfaces use (watched / saved badges, tap →
 * detail).
 *
 * The filmography is rendered in the order katalog-api returns it — no
 * client-side re-ranking.
 */
export function PersonPage({ personId }: PersonPageProps) {
  const { data, notFound, loading } = usePerson(personId);

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-[#0d1117] text-[#8b949e] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="min-h-screen bg-[#0d1117] text-white">
        <BackButton />
        <div className="max-w-6xl mx-auto px-6 py-24 text-center text-[#8b949e]">
          <p className="text-lg">Person not found.</p>
        </div>
      </div>
    );
  }

  const items = data.items ?? [];
  const credits = items.length;

  return (
    <div className="min-h-screen bg-[#0d1117] text-white">
      <BackButton />
      <div className="max-w-6xl mx-auto px-6 pt-20 pb-16">
        {/* Header: initials avatar + name + credit count */}
        <div className="flex items-center gap-5 mb-8">
          <PersonAvatar name={data.name} size={88} className="text-3xl" />
          <div>
            <h1 className="text-3xl md:text-4xl font-bold">{data.name}</h1>
            <p className="text-[#8b949e] mt-1">
              {credits} title{credits === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        {items.length === 0 ? (
          <p className="text-[#8b949e]">No titles available for this person.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-4">
            {items.map((it) => (
              <MediaCard
                key={it.id}
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
      </div>
    </div>
  );
}

function BackButton() {
  return (
    <button
      onClick={() => {
        if (window.history.length > 1) window.history.back();
        else window.location.assign('/');
      }}
      className="absolute top-4 left-4 p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors z-10"
      title="Back"
    >
      <ArrowLeft className="w-5 h-5" />
    </button>
  );
}
