import { useEffect, useRef, useState } from 'react';
import { Play, Info, Plus, Check, MoreVertical, Bookmark, ChevronDown, Eye, EyeOff } from 'lucide-react';
import { FadeImage } from './FadeImage';
import { useWatchlist } from '../hooks/useUserFlags';
import { useWatchedToggle } from '../hooks/useWatchedToggle';
import { useMemberships } from '../hooks/useWatchlists';
import { AddToListPicker } from './AddToListPicker';

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
    title: string;
  };
  progress?: number;
  watchedAt?: string | null;
  // When set, the card adds a "Remove from Continue Watching" item to
  // the hover-only 3-dot menu. Only the in-progress home rail wires
  // this — other rails leave it undefined and the item is omitted. The
  // menu itself now renders on EVERY card (it always carries the
  // Mark-watched toggle), so this prop only gates the extra item.
  onRemoveFromContinueWatching?: () => void;
  // When true, marking the card watched removes it from view
  // optimistically (collapse + unmount), the way the CW-remove action
  // does. The Home rails set this because they request `unwatched=true`
  // and hide watched titles — a freshly-watched card would otherwise
  // linger until the next refetch. Browse / Search / Watchlist leave it
  // undefined so the green watched ✓ badge appears on the card instead.
  dropWhenWatched?: boolean;
}

/**
 * Default click target is the detail page (`/i/<id>`). The hover overlay
 * surfaces:
 *   - Play  → straight to /player/<id>
 *   - Plus  → watchlist (placeholder, disabled for now)
 *   - Info  → detail page (same as body click)
 *
 * The overlay shows via `group-hover` (pure CSS) so it ONLY appears on
 * devices with a real pointer. Touch devices get no overlay — a tap
 * just opens the detail page (no double-tap-then-pick-button dance).
 * Each button uses stopPropagation so a click on it doesn't also fall
 * through to the body's openDetail handler.
 */
export function MediaCard({ id, title, image, year, rating, type, episode, progress, watchedAt, onRemoveFromContinueWatching, dropWhenWatched }: MediaCardProps) {
  const watchlist = useWatchlist();
  // "in >=1 list" drives the saved badge + filled icon; the legacy
  // default-list flag drives the single-tap add.
  const { savedSet } = useMemberships(id ? [id] : []);
  const inAnyList = id ? savedSet.has(id) || watchlist.has(id) : false;
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Watched state: seed from the catalogue payload's watched_at stamp,
  // override locally on toggle so the badge + menu label reflect the
  // user's most recent click without waiting on a refetch — mirrors the
  // DetailPage eye. Reuses the SAME hook the detail page uses, so the
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

  // Close the dropdown when the user clicks anywhere outside it.
  // Without this, the menu can linger after a click that landed
  // somewhere else on the row (e.g. on a neighbouring card's body).
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);
  const openDetail = () => {
    if (id) window.location.assign(`/i/${encodeURIComponent(id)}`);
  };
  const openPlayer = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!id) return;
    // Continue-watching cards carry `progress` — clicking from there
    // means "resume", so the player should land mid-stream without
    // any "Resume from X?" dialog. The flag is consumed by PlayerPage
    // via the URL query.
    const resumeHint = progress !== undefined && progress > 0 ? '?autoresume=1' : '';
    window.location.assign(`/player/${encodeURIComponent(id)}${resumeHint}`);
  };
  // Plain tap on the bookmark: drop into the default list when the item
  // is in no list (casual fast-path, fills the icon); open the picker
  // when it's already saved so the user can choose what to add/remove.
  const onBookmark = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!id) return;
    if (inAnyList) setPickerOpen(true);
    else void watchlist.toggle(id, true);
  };

  // Collapsed-out: once marked watched on a drop-when-watched rail the
  // card unmounts itself. The rail's next refetch (driven by the
  // chino:flag-changed broadcast / a navigation) drops it server-side
  // too; until then the optimistic unmount keeps it out of view.
  if (dismissed) return null;

  return (
    <div
      // Named group (`group/card`) so the overlay's group-hover/card
      // only fires when THIS card is hovered. MediaRow uses an
      // unnamed `group` to drive chevron visibility — without the
      // namespace, hovering anywhere in the row would light up every
      // card's overlay simultaneously.
      // scale-[1.03] is subtle on purpose: at 4K the overview grid is
      // dense enough that a stronger pop (scale-105 was prior) reads
      // as visually disruptive — the hovered card felt "too big" next
      // to its neighbours. 3% still gives the user a clear "this is
      // the active card" cue without making the row jump.
      // overflow lifts to visible while the add-to-list picker is open so
      // the popover isn't clipped by the card's rounded mask; otherwise
      // the poster stays clipped to its rounded corners as before.
      className={`group/card relative rounded-lg bg-[#161b22] cursor-pointer transition-transform hover:scale-[1.03] ${pickerOpen ? 'overflow-visible z-50' : 'overflow-hidden'}`}
      onClick={openDetail}
    >
      <div className={`aspect-[2/3] relative ${pickerOpen ? 'overflow-visible' : 'overflow-hidden'}`}>
        {image ? (
          <FadeImage
            src={image}
            alt={title}
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[#30363d]">
            <Info className="w-8 h-8" />
          </div>
        )}

        {/* Watched badge — top-right corner. Pure visual; the card stays
            clickable through it. Sits above the hover overlay so it
            remains visible while the overlay fades in. Reads the local
            (optimistic) watched state so a Mark-as-watched toggle from
            the card menu lights the badge immediately on Browse/Search. */}
        {watched && (
          <div
            className="absolute top-2 right-2 z-40 flex items-center justify-center w-7 h-7 rounded-full bg-emerald-500 shadow-lg pointer-events-none"
            title="Watched"
          >
            <Check className="w-4 h-4 text-white stroke-[3]" />
          </div>
        )}

        {/* Saved badge — top-left corner, shown when the item is in >=1
            list. Offset from the watched badge (top-right) so the two
            never collide. Pure visual; stays clickable through it. */}
        {inAnyList && (
          <div
            className="absolute top-2 left-2 z-40 flex items-center justify-center w-7 h-7 rounded-full bg-[#58a6ff] shadow-lg pointer-events-none"
            title="In your lists"
          >
            <Bookmark className="w-4 h-4 text-white fill-white" />
          </div>
        )}

        {/* Hover overlay — opacity-gated so touch devices (no :hover)
            never see it. Higher z-index than the MediaRow chevron
            buttons (z-10) so the play button wins clicks on the
            leftmost / rightmost card. */}
        <div className={`absolute inset-0 z-30 bg-gradient-to-t from-black via-black/60 to-transparent flex flex-col justify-end p-4 transition-opacity duration-200 pointer-events-none ${pickerOpen ? 'opacity-100' : 'opacity-0 group-hover/card:opacity-100'}`}>
          <div className="flex gap-2 mb-2 pointer-events-auto items-center">
            <button
              className="p-2 bg-[#58a6ff] hover:bg-[#58a6ff]/80 rounded-full transition-colors disabled:opacity-50"
              disabled={!id}
              onClick={openPlayer}
              title="Play"
            >
              <Play className="w-4 h-4 text-white fill-white" />
            </button>
            {/* Add-to-list cluster: icon (single-tap default-list add /
                open picker when already saved) + caret (always opens the
                picker). Mirrors the DetailPage control, compact. */}
            <div className="relative inline-flex items-center">
              <button
                className={`p-2 rounded-l-full transition-colors ${inAnyList ? 'bg-emerald-500 hover:bg-emerald-500/80' : 'bg-white/20 hover:bg-white/30'}`}
                title={inAnyList ? 'In your lists' : 'Add to watchlist'}
                onClick={onBookmark}
                disabled={!id}
              >
                {inAnyList ? (
                  <Check className="w-4 h-4 text-white stroke-[3]" />
                ) : (
                  <Plus className="w-4 h-4 text-white" />
                )}
              </button>
              <button
                className={`px-1 py-2 rounded-r-full border-l border-black/20 transition-colors ${inAnyList ? 'bg-emerald-500 hover:bg-emerald-500/80' : 'bg-white/20 hover:bg-white/30'}`}
                title="Add to list…"
                onClick={(e) => {
                  e.stopPropagation();
                  setPickerOpen((v) => !v);
                }}
                disabled={!id}
                aria-haspopup="menu"
                aria-expanded={pickerOpen}
              >
                <ChevronDown className="w-3.5 h-3.5 text-white" />
              </button>
              {pickerOpen && id ? (
                // Opens upward so the popover clears the bottom-anchored
                // action row and reads over the poster rather than the
                // row below.
                <AddToListPicker itemId={id} align="up" onClose={() => setPickerOpen(false)} />
              ) : null}
            </div>
            <button
              className="p-2 bg-white/20 hover:bg-white/30 rounded-full transition-colors"
              onClick={(e) => { e.stopPropagation(); openDetail(); }}
              title="Details"
            >
              <Info className="w-4 h-4 text-white" />
            </button>

            {/* Card actions menu — joined into the same action row as
                the other buttons so the alignment reads as one cluster.
                Renders on EVERY card now: it always carries the
                Mark-watched toggle, and adds "Remove from Continue
                Watching" only when that prop is wired. Dropdown opens
                upward (bottom-full) so it doesn't get clipped by the
                row below. */}
            <div ref={menuRef} className="relative">
              <button
                className="p-2 bg-white/20 hover:bg-white/30 rounded-full transition-colors disabled:opacity-50"
                disabled={!id}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen((v) => !v);
                }}
                title="More options"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <MoreVertical className="w-4 h-4 text-white" />
              </button>
              {menuOpen && (
                <div
                  className="absolute left-0 bottom-full mb-1 min-w-[220px] bg-[#161b22] border border-[#30363d] rounded-md shadow-xl py-1 z-50"
                  role="menu"
                >
                  <button
                    className="w-full flex items-center gap-2 text-left px-3 py-2 text-sm text-[#c9d1d9] hover:bg-[#21262d]"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      onToggleWatched();
                    }}
                    role="menuitem"
                  >
                    {watched ? (
                      <EyeOff className="w-4 h-4 shrink-0" />
                    ) : (
                      <Eye className="w-4 h-4 shrink-0" />
                    )}
                    {watched ? 'Mark as unwatched' : 'Mark as watched'}
                  </button>
                  {onRemoveFromContinueWatching && (
                    <button
                      className="w-full text-left px-3 py-2 text-sm text-[#c9d1d9] hover:bg-[#21262d]"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpen(false);
                        onRemoveFromContinueWatching();
                      }}
                      role="menuitem"
                    >
                      Remove from Continue Watching
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {progress !== undefined && progress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#30363d] z-30">
            <div className="h-full bg-[#58a6ff]" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>

      <div className="p-3">
        <h3 className="text-[#c9d1d9] font-medium truncate">{title}</h3>

        {episode ? (
          // Episode subtitle mirrors the movie year·rating row so the
          // card stays the same height as its siblings in the Continue
          // Watching strip. SxxExx (no space) matches the standard
          // file-naming convention and is tighter than 'S1 E1'.
          <div className="flex items-center gap-2 mt-1 text-sm text-[#8b949e] truncate">
            <span className="text-[#58a6ff] shrink-0">
              S{String(episode.season).padStart(2, '0')}E{String(episode.episode).padStart(2, '0')}
            </span>
            {episode.title ? (
              <>
                <span className="shrink-0">·</span>
                <span className="truncate">{episode.title}</span>
              </>
            ) : null}
          </div>
        ) : (
          <div className="flex items-center gap-2 mt-1 text-sm text-[#8b949e]">
            {year && <span>{year}</span>}
            {rating && (
              <>
                <span>•</span>
                <span className="text-[#58a6ff]">{rating}</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
