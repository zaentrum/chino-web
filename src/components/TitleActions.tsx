import { useRef, useState, type ReactNode } from 'react';
import { Bookmark, Check, ChevronDown, Heart } from 'lucide-react';
import { useWatchlist } from '../hooks/useUserFlags';
import { LISTS_CHANGED, useMemberships } from '../hooks/useWatchlists';
import {
  ACTION_FOCUS as FOCUS,
  ACTION_HEIGHT,
  CARET_PART,
  CHOOSE_LISTS,
  ICON_BUTTON,
  actionLook,
  addToListName,
  dividerLook,
  iconFilled,
  likedName,
  markName,
  watchedName,
  watchlistPress,
  type ActionMeaning,
} from '../lib/titleActions';
import { AddToListPicker } from './AddToListPicker';

// The title actions (docs/chino, title actions; lib/titleActions.ts): add to
// list, watched and liked, one size and one look wherever they are - a
// title's page, an episode row's actions line - and a card's status marks.

/**
 * Add to list: one control in two parts, one frame, one fill, a 1 px
 * divider between them. The main part shows and toggles the Watchlist only
 * - an outlined bookmark, or a dark one on blue - and never touches another
 * list; "⌄" opens the list picker, with a check against each list that
 * holds the title, where it leaves them. The two never wrap apart.
 */
export function AddToListControl({
  itemId,
  align = 'down',
  alignX = 'right',
  onPickerOpenChange,
}: {
  itemId: string;
  /** Where the list picker opens (AddToListPicker). */
  align?: 'down' | 'up';
  alignX?: 'left' | 'right';
  /** Told when the picker opens and closes: a row raises itself over the next. */
  onPickerOpenChange?: (open: boolean) => void;
}) {
  const watchlist = useWatchlist();
  const inWatchlist = watchlist.has(itemId);
  // Asked ahead (one request for every control on the page), so the picker
  // opens with its checks in place.
  useMemberships([itemId]);
  const [pickerOpen, setPickerOpenState] = useState(false);
  const caretRef = useRef<HTMLButtonElement>(null);
  const setPickerOpen = (open: boolean) => {
    setPickerOpenState(open);
    onPickerOpenChange?.(open);
  };
  const look = actionLook('watchlist', inWatchlist);
  const pressMain = async () => {
    const { present } = watchlistPress(inWatchlist);
    await watchlist.toggle(itemId, present);
    // The picker's checks are the lists' memberships: the Watchlist's changed.
    window.dispatchEvent(new CustomEvent(LISTS_CHANGED));
  };
  return (
    <div className="relative inline-flex shrink-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          void pressMain();
        }}
        className={`${ICON_BUTTON} ${look} ${FOCUS} flex items-center justify-center transition-colors`}
        aria-label={addToListName(inWatchlist)}
        title={addToListName(inWatchlist)}
      >
        <Bookmark aria-hidden className={`w-5 h-5 ${iconFilled('watchlist', inWatchlist) ? 'fill-current' : ''}`} />
      </button>
      <span aria-hidden className={`w-px ${ACTION_HEIGHT} ${dividerLook(inWatchlist)}`} />
      <button
        ref={caretRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setPickerOpen(!pickerOpen);
        }}
        className={`${CARET_PART} ${look} ${FOCUS} flex items-center justify-center transition-colors`}
        aria-label={CHOOSE_LISTS}
        title={CHOOSE_LISTS}
        aria-haspopup="menu"
        aria-expanded={pickerOpen}
      >
        <ChevronDown aria-hidden className="w-4 h-4" />
      </button>
      {pickerOpen ? (
        <AddToListPicker itemId={itemId} align={align} alignX={alignX} ignoreRef={caretRef} onClose={() => setPickerOpen(false)} />
      ) : null}
    </div>
  );
}

/** An icon toggle of the title actions: off, the outlined icon on the plain
 *  surface; on, the icon dark on the meaning's colour. Its name says its
 *  state ("mark as watched", "watched"). */
function ActionToggle({
  meaning,
  on,
  name,
  onToggle,
  children,
}: {
  meaning: ActionMeaning;
  on: boolean;
  name: string;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={`${ICON_BUTTON} shrink-0 ${actionLook(meaning, on)} ${FOCUS} flex items-center justify-center transition-colors`}
      aria-label={name}
      title={name}
    >
      {children}
    </button>
  );
}

/** Watched: a check, outlined, or dark on green. */
export function WatchedToggle({ watched, onToggle }: { watched: boolean; onToggle: () => void }) {
  return (
    <ActionToggle meaning="watched" on={watched} name={watchedName(watched)} onToggle={onToggle}>
      <Check aria-hidden className={`w-5 h-5 ${watched ? 'stroke-[3]' : ''}`} />
    </ActionToggle>
  );
}

/** Liked: a heart, outlined, or dark on the design system's red. */
export function LikedToggle({ liked, onToggle }: { liked: boolean; onToggle: () => void }) {
  return (
    <ActionToggle meaning="liked" on={liked} name={likedName(liked)} onToggle={onToggle}>
      <Heart aria-hidden className={`w-5 h-5 ${iconFilled('liked', liked) ? 'fill-current' : ''}`} />
    </ActionToggle>
  );
}

/** A card's status mark: the action's icon and colour in its on state - the
 *  bookmark dark on blue, the check dark on green. A mark, not a button. */
export function StatusMark({ meaning, className = '' }: { meaning: 'watchlist' | 'watched'; className?: string }) {
  return (
    <span
      role="img"
      aria-label={markName(meaning)}
      title={markName(meaning)}
      className={`flex items-center justify-center w-7 h-7 pointer-events-none ${actionLook(meaning, true)} ${className}`}
    >
      {meaning === 'watchlist' ? (
        <Bookmark aria-hidden className="w-4 h-4 fill-current" />
      ) : (
        <Check aria-hidden className="w-4 h-4 stroke-[3]" />
      )}
    </span>
  );
}
