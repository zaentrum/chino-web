import { useEffect, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { ArrowLeft, EyeOff, LogOut } from 'lucide-react';
import { Avatar } from './Avatar';
import { FadeImage } from './FadeImage';
import { LoadingState } from './LoadingState';
import { useWatchHistory, type WatchHistoryEntry } from '../hooks/useWatchHistory';

/**
 * Profile page at /me. Shows the signed-in user's name + email (from
 * the OIDC userinfo claims), a sign-out button, and a compact row list
 * of items they've watched, newest first — the detail page's
 * EpisodeRow idiom, denser (mobile ProfileScreen parity).
 *
 * The watch history is everything in watched_history — both auto-
 * stamped rows (player crossing 95 % of duration) and manual rows
 * from the watched-toggle button on DetailPage / EpisodesList.
 *
 * Episode rows lead with the SERIES title; the episode itself moves to
 * the `SxxExx · episode title` meta line. /me/watched embeds plain
 * catalogue items (no series_title field), so parent titles are
 * resolved with follow-up GET /api/v1/items/{parent_id} calls, deduped
 * per series, after the list first paints — rows upgrade in place as
 * titles land, falling back to the episode's own title meanwhile.
 */
export function ProfilePage() {
  const auth = useAuth();
  const history = useWatchHistory(60);

  // parent_id -> series title, resolved after the history paints so
  // episode rows can show the series as the row title.
  const [seriesTitles, setSeriesTitles] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!history?.length) return;
    const parentIds = [
      ...new Set(
        history
          .filter((it) => it.type === 'episode' && it.parent_id)
          .map((it) => it.parent_id as string),
      ),
    ];
    if (!parentIds.length) return;
    const ctrl = new AbortController();
    const token = auth.user?.access_token ?? '';
    void Promise.all(
      parentIds.map((pid) =>
        fetch(`/api/v1/items/${encodeURIComponent(pid)}`, {
          signal: ctrl.signal,
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((r) => (r.ok ? (r.json() as Promise<{ title?: string }>) : null))
          .then((j) => (j?.title ? ([pid, j.title] as const) : null))
          .catch(() => null),
      ),
    ).then((pairs) => {
      const map: Record<string, string> = {};
      for (const p of pairs) if (p) map[p[0]] = p[1];
      setSeriesTitles((prev) => ({ ...prev, ...map }));
    });
    return () => ctrl.abort();
    // Bearer read once at fetch time — a silent token renewal doesn't
    // need a re-resolve of titles that already landed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history]);

  // Optimistic unwatch: hide the row immediately, restore it (in its
  // original position) if the DELETE fails. Tracking removed ids
  // instead of snapshotting the list keeps ordering trivially intact
  // on restore.
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const unwatch = (id: string) => {
    setRemovedIds((prev) => new Set(prev).add(id));
    fetch(`/api/v1/me/items/${encodeURIComponent(id)}/watched`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${auth.user?.access_token ?? ''}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`unwatch ${r.status}`);
        // Same broadcast as useWatchedToggle so other surfaces
        // (Continue Watching, detail pages) can refetch if they care.
        window.dispatchEvent(new CustomEvent('chino:flag-changed', { detail: { kind: 'watched' } }));
      })
      .catch(() => {
        setRemovedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      });
  };

  const profile = auth.user?.profile;
  const name = (profile?.name as string | undefined)
    || (profile?.preferred_username as string | undefined)
    || (profile?.email as string | undefined)
    || 'Account';
  const email = profile?.email as string | undefined;

  const signOut = () => {
    void auth.signoutRedirect();
  };

  const visible = (history ?? []).filter((it) => !removedIds.has(it.id));

  return (
    <div className="min-h-screen bg-[#0d1117] text-white">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => { if (window.history.length > 1) window.history.back(); else window.location.assign('/'); }}
            className="p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors"
            title="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-3xl font-bold">Profile</h1>
        </div>

        {/* Identity card. Keycloak gives us name / email / preferred_username;
            we render whatever's available so the page is meaningful even on
            minimal claim sets. */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 mb-10 flex items-center gap-4">
          <Avatar size={64} className="shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xl font-medium truncate">{name}</div>
            {email && email !== name ? (
              <div className="text-sm text-[#8b949e] truncate">{email}</div>
            ) : null}
          </div>
          <button
            onClick={signOut}
            className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors flex items-center gap-2"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
            <span className="text-sm">Sign out</span>
          </button>
        </div>

        <h2 className="text-2xl font-semibold mb-4">Watch history</h2>
        {history === null ? (
          <LoadingState />
        ) : visible.length === 0 ? (
          <p className="text-[#8b949e]">
            Nothing watched yet. Watched items will appear here once you finish a movie
            or episode (or mark one watched via the eye-button on a detail page).
          </p>
        ) : (
          <div className="bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden divide-y divide-[#21262d]">
            {visible.map((it) => (
              <HistoryRow
                key={it.id}
                entry={it}
                seriesTitle={it.parent_id ? seriesTitles[it.parent_id] : undefined}
                onUnwatch={() => unwatch(it.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * One watch-history row: 56px thumbnail (16:9 still for episodes, 2:3
 * poster otherwise), title + meta line, right-aligned watched date and
 * the unwatch (EyeOff) action. The whole row clicks through to the
 * detail page; the EyeOff click is swallowed so it doesn't also open
 * the row. div + role=button (not <button>) so the real unwatch
 * <button> can nest inside without invalid-HTML warnings — same idiom
 * as EpisodesList's EpisodeRow.
 */
function HistoryRow({
  entry,
  seriesTitle,
  onUnwatch,
}: {
  entry: WatchHistoryEntry;
  seriesTitle?: string;
  onUnwatch: () => void;
}) {
  const isEpisode = entry.type === 'episode';

  const epLabel = isEpisode
    ? [
        entry.season_number != null ? `S${String(entry.season_number).padStart(2, '0')}` : '',
        entry.episode_number != null ? `E${String(entry.episode_number).padStart(2, '0')}` : '',
      ].join('')
    : '';
  const dateLabel = watchedDateLabel(entry.watched_at);
  // Episodes use the landscape still (backdrop) like EpisodesList rows;
  // everything else keeps its 2:3 poster.
  const thumb = isEpisode
    ? entry.backdrop_url || entry.poster_url
    : entry.poster_url || entry.backdrop_url;

  const open = () => window.location.assign(`/i/${encodeURIComponent(entry.id)}`);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
      className="flex items-center gap-3 px-3 py-1 hover:bg-[#1c2128] transition-colors cursor-pointer focus:outline-none focus:bg-[#1c2128]"
    >
      <div
        className={`relative h-14 ${isEpisode ? 'aspect-video' : 'aspect-[2/3]'} rounded overflow-hidden bg-[#0d1117] shrink-0`}
      >
        {thumb ? (
          <FadeImage
            src={thumb}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
            // If the backdrop endpoint 404s (artwork stored only as
            // poster from older enrichment runs), retry with poster_url
            // so the row still gets an image instead of a broken icon.
            onError={(e) => {
              const img = e.currentTarget;
              if (isEpisode && entry.poster_url && img.src !== entry.poster_url) {
                img.src = entry.poster_url;
              }
            }}
          />
        ) : (
          <div className="w-full h-full bg-[#21262d]" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-white truncate">
          {isEpisode ? seriesTitle || entry.title : entry.title}
        </div>
        {isEpisode ? (
          <div className="text-xs truncate mt-0.5">
            {epLabel ? (
              <>
                <span className="text-[#58a6ff]">{epLabel}</span>
                <span className="text-[#8b949e]"> · </span>
              </>
            ) : null}
            <span className="text-[#8b949e]">{entry.title}</span>
          </div>
        ) : entry.year || entry.rating ? (
          <div className="text-xs truncate mt-0.5">
            {entry.year ? <span className="text-[#8b949e]">{entry.year}</span> : null}
            {entry.year && entry.rating ? <span className="text-[#8b949e]"> • </span> : null}
            {entry.rating ? <span className="text-[#58a6ff]">{entry.rating.toFixed(1)}</span> : null}
          </div>
        ) : null}
      </div>

      {dateLabel ? (
        <span className="text-xs text-[#8b949e] shrink-0">{dateLabel}</span>
      ) : null}

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onUnwatch();
        }}
        className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors shrink-0"
        title="Mark as unwatched"
        aria-label="Mark as unwatched"
      >
        <EyeOff className="w-4 h-4 text-[#8b949e]" />
      </button>
    </div>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * RFC3339 "2026-06-12T18:23:45Z" -> "Jun 12". Substring parse on
 * purpose (no Date round-trip): the stamp's calendar date is all the
 * row needs, and timezone conversion could shift the day.
 */
function watchedDateLabel(iso?: string | null): string | null {
  if (!iso || iso.length < 10) return null;
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1) {
    return null;
  }
  return `${MONTHS[month - 1]} ${day}`;
}
