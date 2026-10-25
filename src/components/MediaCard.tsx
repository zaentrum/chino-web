import { useEffect, useRef, useState } from 'react';
import { Check, MoreVertical, Play, X } from 'lucide-react';
import { FadeImage } from './FadeImage';
import { useWatchlist } from '../hooks/useUserFlags';
import { useWatchedToggle } from '../hooks/useWatchedToggle';
import { usePlayTitle } from '../hooks/usePlayTitle';
import { toApp } from '../lib/basepath';
import { episodeCode } from '../lib/episodeFiles';
import { StatusMark } from './TitleActions';
import { PLAY, REMOVE_FROM_CONTINUE_WATCHING, RESUME, watchedName } from '../lib/titleActions';

interface MediaCardProps {
  id?: string;
  title: string;
  image: string;
  year?: string;
  rating?: string;
  type: 'movie' | 'series' | 'music' | 'tv';
  episode?: {
    season: number;
    episode: number;
    /** The last episode number of a file that holds several: S03E18–19. */
    episodeEnd?: number;
    title: string;
  };
  progress?: number;
  watchedAt?: string | null;
  // When set, the card adds a "Remove from Continue Watching" item to
  // its menu. Only the in-progress home rail wires this — other rails
  // leave it undefined and the item is omitted. The menu itself is on
  // every card (it always carries play and the watched toggle), so this
  // prop only gates the extra item.
  onRemoveFromContinueWatching?: () => void;
  // When true, marking the card watched removes it from view
  // optimistically (collapse + unmount), the way the CW-remove action
  // does. The Home rails set this because they request `unwatched=true`
  // and hide watched titles — a freshly-watched card would otherwise
  // linger until the next refetch. Browse / Search / Watchlist leave it
  // undefined so the watched mark appears on the card instead.
  dropWhenWatched?: boolean;
  // A line under the year/rating naming someone's credit on the title —
  // the person page's filmography sets it ("Director · Writer"). Cards
  // without it look as they always have.
  credit?: string;
}

/**
 * A title's card: its poster and name, a click opens the title's page
 * (`/i/<id>`). Nothing is drawn over the artwork but its status marks
 * (docs/chino, title actions: nothing on artwork) - the Watchlist bookmark
 * dark on blue, the watched check dark on green, and the progress bar -
 * drawn as the title page's actions are when on. Its actions are on the
 * title's page, and in the card's menu, whose button sits by the name
 * under the poster: play (resume on Continue watching), mark as watched,
 * and on Continue watching its removal. A button over a picture has the
 * picture's contrast, and a smaller one reads as another button.
 */
export function MediaCard({ id, title, image, year, rating, type, episode, progress, watchedAt, onRemoveFromContinueWatching, dropWhenWatched, credit }: MediaCardProps) {
  const watchlist = useWatchlist();
  const inWatchlist = id ? watchlist.has(id) : false;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const { play, pending } = usePlayTitle();

  // Watched state: seed from the catalogue payload's watched_at stamp,
  // override locally on toggle so the mark + menu label reflect the
  // user's most recent click without waiting on a refetch — mirrors the
  // title page's toggle. Reuses the SAME hook the title page uses, so the
  // POST/DELETE to /me/items/{id}/watched and the chino:flag-changed
  // broadcast are not re-implemented here.
  const toggleWatched = useWatchedToggle();
  const [watchedOverride, setWatchedOverride] = useState<boolean | null>(null);
  const watched = watchedOverride ?? !!watchedAt;
  // On rails that hide watched titles (`dropWhenWatched`), a card the
  // user just marked watched is collapsed out of view immediately — the
  // optimistic equivalent of the CW-remove. The chino:flag-changed
  // broadcast lets the rail reconcile on its next refetch.
  const [dismissed, setDismissed] = useState(false);

  const onToggleWatched = () => {
    if (!id) return;
    const next = !watched;
    setWatchedOverride(next);
    void toggleWatched(id, next);
    if (next && dropWhenWatched) setDismissed(true);
  };

  // Close the menu when the user clicks anywhere outside it, or presses
  // Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);
  const openDetail = () => {
    if (id) window.location.assign(toApp(`/i/${encodeURIComponent(id)}`));
  };
  const resumes = progress !== undefined && progress > 0;
  const openPlayer = () => {
    if (!id) return;
    // Continue-watching cards carry `progress` — playing from there
    // means "resume", so the player should land mid-stream without
    // any "Resume from X?" dialog. The flag is consumed by PlayerPage
    // via the URL query.
    const resumeHint = resumes ? '?autoresume=1' : '';
    // A series card (not an episode's, which carries `episode`) plays
    // the series' next episode or S01E01 — not the series' own id.
    void play(id, type === 'series' && !episode ? 'series' : 'movie', resumeHint);
  };

  // Collapsed-out: once marked watched on a drop-when-watched rail the
  // card unmounts itself. The rail's next refetch (driven by the
  // chino:flag-changed broadcast / a navigation) drops it server-side
  // too; until then the optimistic unmount keeps it out of view.
  if (dismissed) return null;

  // An action menu's items: one action a line, in the mono face,
  // lowercase, as the account menu's.
  const menuItem = 'w-full flex items-center gap-2 text-left px-3 py-2 text-sm font-mono text-chino-text hover:bg-chino-surface-2';
  return (
    <div
      // scale-[1.03] is subtle on purpose: at 4K the overview grid is
      // dense enough that a stronger pop reads as visually disruptive.
      // The menu lifts the card over its neighbours while it is open.
      className={`group/card relative rounded-lg bg-chino-surface cursor-pointer transition-transform hover:scale-[1.03] ${menuOpen ? 'z-50' : ''}`}
      onClick={openDetail}
    >
      <div className="aspect-[2/3] relative overflow-hidden">
        {/* fallbackTitle routes a missing / 404 poster to the DS artwork
            placeholder (title initials, square corners) instead of a
            broken-image glyph or empty box. */}
        <FadeImage
          src={image}
          alt={title}
          fallbackTitle={title}
          className="w-full h-full object-cover"
          loading="lazy"
          decoding="async"
        />

        {/* The status marks, marks and not buttons: the card stays
            clickable through them. The Watchlist top-left, watched
            top-right, so the two never collide. */}
        {inWatchlist ? <StatusMark meaning="watchlist" className="absolute top-2 left-2" /> : null}
        {watched ? <StatusMark meaning="watched" className="absolute top-2 right-2" /> : null}

        {progress !== undefined && progress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-chino-border">
            <div className="h-full bg-chino-accent" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>

      {/* The caption: the name, and the card's menu beside it. The menu
          opens over the poster at the card's own width, so a rail never
          cuts it off at either end. */}
      <div ref={menuRef} className="relative p-3 flex items-start gap-1">
        <div className="flex-1 min-w-0">
          <h3 className="text-chino-text font-medium truncate">{title}</h3>

          {episode ? (
            // Episode subtitle mirrors the movie year·rating row so the
            // card stays the same height as its siblings in the Continue
            // Watching strip. SxxExx (no space) matches the standard
            // file-naming convention and is tighter than 'S1 E1'.
            <div className="flex items-center gap-2 mt-1 text-sm text-chino-muted truncate">
              <span className="text-chino-accent shrink-0">
                {episodeCode(episode.season, episode.episode, episode.episodeEnd)}
              </span>
              {episode.title ? (
                <>
                  <span className="shrink-0">·</span>
                  <span className="truncate">{episode.title}</span>
                </>
              ) : null}
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-1 text-sm text-chino-muted">
              {year && <span>{year}</span>}
              {rating && (
                <>
                  <span>•</span>
                  <span className="text-chino-accent">{rating}</span>
                </>
              )}
            </div>
          )}
          {credit ? (
            <div className="mt-1 text-xs text-chino-muted line-clamp-2" title={credit}>
              {credit}
            </div>
          ) : null}
        </div>

        {/* The card's menu, by its name and off the artwork. */}
        {id ? (
          <>
            <button
              type="button"
              className="shrink-0 -mr-2 -mt-1 w-10 h-12 flex items-center justify-center text-chino-muted hover:text-chino-fg hover:bg-chino-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-chino-cyan"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
              aria-label={`More for ${title}`}
              title="More"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <MoreVertical aria-hidden className="w-4 h-4" />
            </button>
            {menuOpen && (
              <div
                className="absolute inset-x-0 bottom-full mb-1 bg-chino-surface border border-chino-border shadow-xl py-1 z-50"
                role="menu"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  className={`${menuItem} disabled:opacity-50`}
                  disabled={pending}
                  onClick={() => {
                    setMenuOpen(false);
                    openPlayer();
                  }}
                  role="menuitem"
                >
                  <Play aria-hidden className="w-4 h-4 shrink-0" />
                  {resumes ? RESUME : PLAY}
                </button>
                <button
                  className={menuItem}
                  onClick={() => {
                    setMenuOpen(false);
                    onToggleWatched();
                  }}
                  role="menuitem"
                >
                  <Check aria-hidden className="w-4 h-4 shrink-0" />
                  {/* Its state, in the words of the title page's toggle. */}
                  {watchedName(watched)}
                </button>
                {onRemoveFromContinueWatching && (
                  <button
                    className={menuItem}
                    onClick={() => {
                      setMenuOpen(false);
                      onRemoveFromContinueWatching();
                    }}
                    role="menuitem"
                  >
                    <X aria-hidden className="w-4 h-4 shrink-0" />
                    {REMOVE_FROM_CONTINUE_WATCHING}
                  </button>
                )}
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
