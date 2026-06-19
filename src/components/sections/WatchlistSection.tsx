import { useEffect, useRef, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import {
  ArrowLeft,
  Bookmark,
  Check,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { MediaCard } from '../MediaCard';
import { MediaRow } from '../MediaRow';
import { LoadingState } from '../LoadingState';
import {
  useWatchlists,
  getWatchlist,
  LISTS_CHANGED,
  type Watchlist,
  type WatchlistDetail,
} from '../../hooks/useWatchlists';
import { useItemsByIds } from '../../hooks/useItemsByIds';
import type { ItemDetail } from '../../hooks/useItem';

/**
 * The Watchlist HUB — the cross-client lists surface. A vertical stack
 * of horizontal poster shelves (the home-rail idiom: MediaRow + the
 * trailing "See all" tile), one shelf per user list, default list first
 * (GET /me/watchlists returns that order). Each shelf shows the list's
 * newest dozen items; the shelf header and the See-All affordances open
 * the per-list MORE view — the full grid with rename/delete actions
 * (delete hidden for the default list, the contract forbids deleting
 * it). "+ New list" trails the shelves.
 */

/** Items per hub shelf — matches the other clients' hub cap. */
const SHELF_CAP = 12;

/**
 * One list's contents, refreshed on the lists-changed broadcast (an item
 * added/removed elsewhere — the picker, a card's remove affordance).
 */
function useWatchlistDetail(listId: string) {
  const auth = useAuth();
  const token = auth.user?.access_token;
  const [detail, setDetail] = useState<WatchlistDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const load = () => {
      getWatchlist(token, listId)
        .then((d) => {
          if (!cancelled) setDetail(d);
        })
        .catch(() => {
          if (!cancelled) setDetail(null);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };
    load();
    const onChange = () => load();
    window.addEventListener(LISTS_CHANGED, onChange);
    return () => {
      cancelled = true;
      window.removeEventListener(LISTS_CHANGED, onChange);
    };
  }, [token, listId]);

  return { detail, loading };
}

// Same ItemDetail → MediaCard mapping the grids use; shelves and the
// MORE view share it so a card looks identical in both.
function toCard(it: ItemDetail) {
  return {
    id: it.id,
    title: it.title,
    image: it.poster_url || '',
    year: it.year ? String(it.year) : undefined,
    rating: it.rating ? it.rating.toFixed(1) : undefined,
    type: (it.type === 'series' ? 'series' : 'movie') as 'series' | 'movie',
    watchedAt: it.watched_at,
  };
}

interface ShelfProps {
  list: Watchlist;
  /** Opens the MORE view for this list. */
  onOpen: () => void;
}

/**
 * One hub shelf. Non-empty lists render the home-rail MediaRow (header
 * + horizontal cards + trailing "See all" tile); empty lists keep their
 * header + an empty-state hint so the MORE view (rename/delete) stays
 * reachable. Each shelf fetches its own list detail, so the hub fans
 * out the per-list requests in parallel like the home rails do.
 */
function WatchlistShelf({ list, onOpen }: ShelfProps) {
  const { detail, loading } = useWatchlistDetail(list.id);
  const shelfIds = (detail?.items ?? []).slice(0, SHELF_CAP);
  const { items, loading: itemsLoading } = useItemsByIds(shelfIds);

  const title = `${list.name} · ${list.itemCount}`;

  if (items.length > 0) {
    return (
      <MediaRow
        title={title}
        onTitleClick={onOpen}
        onSeeAll={onOpen}
        noLoop
        items={items.map(toCard)}
      />
    );
  }

  // Empty (or still-loading) shelf — header mirrors MediaRow's so the
  // hub reads as one continuous stack of rails.
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={onOpen}
          className="text-2xl font-semibold text-white hover:text-[#58a6ff] transition-colors text-left"
        >
          {title}
        </button>
        <button
          onClick={onOpen}
          className="flex items-center gap-1 text-[#58a6ff] hover:text-[#58a6ff]/80 transition-colors"
        >
          <span className="text-sm">See All</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      {loading || itemsLoading ? (
        <LoadingState />
      ) : (
        <p className="text-sm text-[#8b949e]">
          Save titles with the + button on any movie or show.
        </p>
      )}
    </div>
  );
}

interface MoreViewProps {
  list: Watchlist;
  onBack: () => void;
  rename: (listId: string, name: string) => Promise<Watchlist>;
  remove: (listId: string) => Promise<void>;
}

/**
 * The per-list MORE view: the full grid of the list's items plus the
 * list-management actions (rename always; delete hidden for the default
 * list). Back returns to the hub.
 */
function WatchlistMoreView({ list, onBack, rename, remove }: MoreViewProps) {
  const { detail, loading } = useWatchlistDetail(list.id);
  const { items, loading: itemsLoading } = useItemsByIds(detail?.items ?? []);

  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  // Rename inline form.
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const renameRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (renaming) {
      setRenameValue(list.name);
      // focus after the value is set
      setTimeout(() => renameRef.current?.focus(), 0);
    }
  }, [renaming, list.name]);

  const submitRename = async () => {
    const name = renameValue.trim();
    if (!name) {
      setFormErr('Enter a name');
      return;
    }
    setBusy(true);
    setFormErr(null);
    try {
      await rename(list.id, name);
      setRenaming(false);
    } catch (e) {
      setFormErr((e as Error).message || 'Could not rename list');
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (list.isDefault) return;
    if (!window.confirm(`Delete "${list.name}"? Its items will be removed from the list.`)) return;
    setBusy(true);
    try {
      await remove(list.id);
      onBack();
    } catch (e) {
      setFormErr((e as Error).message || 'Could not delete list');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {/* Header row: Back to hub, list name + count, rename/delete. */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="p-2 rounded-full text-[#8b949e] hover:bg-[#161b22] hover:text-white"
          title="Back to Watchlist"
          aria-label="Back to Watchlist"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        {renaming ? (
          <div className="flex items-center gap-2">
            <input
              ref={renameRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitRename();
                if (e.key === 'Escape') setRenaming(false);
              }}
              maxLength={60}
              className="bg-[#0d1117] border border-[#30363d] rounded px-3 py-1.5 text-lg text-white focus:outline-none focus:border-[#58a6ff]"
            />
            <button
              onClick={() => void submitRename()}
              disabled={busy}
              className="p-2 rounded-full bg-[#58a6ff] hover:bg-[#58a6ff]/80 text-white disabled:opacity-50"
              title="Save name"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setRenaming(false)}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
              title="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            <h1 className="text-3xl font-bold text-white">{list.name}</h1>
            <span className="text-lg text-[#8b949e]">{list.itemCount}</span>
            <button
              onClick={() => setRenaming(true)}
              className="p-1.5 rounded-full text-[#8b949e] hover:bg-[#161b22] hover:text-white"
              title="Rename list"
            >
              <Pencil className="w-4 h-4" />
            </button>
            {!list.isDefault ? (
              <button
                onClick={() => void onDelete()}
                className="p-1.5 rounded-full text-[#8b949e] hover:bg-[#161b22] hover:text-rose-400"
                title="Delete list"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            ) : null}
          </>
        )}
      </div>

      {formErr ? <p className="text-rose-400 text-sm mb-4">{formErr}</p> : null}

      {/* Grid — reuses the Movies/Series grid shape + MediaCard. */}
      {loading || itemsLoading ? (
        <LoadingState variant="full" />
      ) : items.length === 0 ? (
        <div className="text-[#8b949e] py-12 text-center">
          <Bookmark className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>This list is empty.</p>
          <p className="text-sm mt-1">Add titles from a movie or show page to see them here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-4">
          {items.map((it) => (
            <MediaCard key={it.id} {...toCard(it)} />
          ))}
        </div>
      )}
    </div>
  );
}

export function WatchlistSection() {
  const { lists, loading: listsLoading, create, rename, remove } = useWatchlists();

  // null → the hub; a list id → that list's MORE view. The id is
  // resolved against the live lists array so a deletion (here or in
  // another tab) drops the user back on the hub instead of stranding
  // them on a dead list.
  const [openListId, setOpenListId] = useState<string | null>(null);
  useEffect(() => {
    if (openListId && !listsLoading && !lists.some((l) => l.id === openListId)) {
      setOpenListId(null);
    }
  }, [openListId, lists, listsLoading]);

  const openList = lists.find((l) => l.id === openListId) ?? null;

  // Create-list inline form state (the trailing "+ New list" affordance).
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [formErr, setFormErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const createRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (creating) createRef.current?.focus();
  }, [creating]);

  const submitCreate = async () => {
    const name = newName.trim();
    if (!name) {
      setFormErr('Enter a name');
      return;
    }
    setBusy(true);
    setFormErr(null);
    try {
      await create(name);
      // Stay on the hub — the new (empty) shelf appears at the end.
      setNewName('');
      setCreating(false);
    } catch (e) {
      setFormErr((e as Error).message || 'Could not create list');
    } finally {
      setBusy(false);
    }
  };

  if (listsLoading && lists.length === 0) {
    return (
      <div>
        <h1 className="text-4xl font-bold text-white mb-6">Watchlist</h1>
        <LoadingState variant="full" />
      </div>
    );
  }

  if (openList) {
    return (
      <WatchlistMoreView
        list={openList}
        onBack={() => setOpenListId(null)}
        rename={rename}
        remove={remove}
      />
    );
  }

  return (
    <div>
      <h1 className="text-4xl font-bold text-white mb-6">Watchlist</h1>

      {/* One shelf per list — default first, then by createdAt (the
          server's GET /me/watchlists order). */}
      {lists.map((list) => (
        <WatchlistShelf key={list.id} list={list} onOpen={() => setOpenListId(list.id)} />
      ))}

      {/* Trailing "+ New list" affordance. */}
      <div className="flex items-center gap-2 mb-8">
        {creating ? (
          <>
            <input
              ref={createRef}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitCreate();
                if (e.key === 'Escape') {
                  setCreating(false);
                  setNewName('');
                  setFormErr(null);
                }
              }}
              maxLength={60}
              placeholder="List name"
              className="bg-[#0d1117] border border-[#30363d] rounded-full px-3 py-1.5 text-sm text-white placeholder-[#8b949e] focus:outline-none focus:border-[#58a6ff]"
            />
            <button
              onClick={() => void submitCreate()}
              disabled={busy}
              className="p-1.5 rounded-full bg-[#58a6ff] hover:bg-[#58a6ff]/80 text-white disabled:opacity-50"
              title="Create list"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            </button>
            <button
              onClick={() => {
                setCreating(false);
                setNewName('');
                setFormErr(null);
              }}
              className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white"
              title="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
          </>
        ) : (
          <button
            onClick={() => {
              setCreating(true);
              setFormErr(null);
            }}
            className="px-4 py-1.5 rounded-full text-sm border border-dashed border-[#30363d] text-[#58a6ff] hover:bg-[#161b22] flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            New list
          </button>
        )}
      </div>

      {formErr ? <p className="text-rose-400 text-sm mb-4">{formErr}</p> : null}
    </div>
  );
}
