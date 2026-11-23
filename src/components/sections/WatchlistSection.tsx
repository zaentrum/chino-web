import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
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
import { CouldntLoad } from '../CouldntLoad';
import { couldntLoad } from '../../lib/loadFailure';
import { PAGE_HEADING, PART_HEADING, SEE_ALL, SEE_ALL_LOOK, WATCHLIST_WORDS } from '../../lib/chromeWords';
import {
  useWatchlists,
  getWatchlist,
  getWatchlistOfKind,
  LISTS_CHANGED,
  type Watchlist,
  type WatchlistDetail,
} from '../../hooks/useWatchlists';
import { useItemsByIds } from '../../hooks/useItemsByIds';
import { useWatchlistByKind } from '../../hooks/useWatchlistByKind';
import {
  KINDS,
  LOADING_ROWS,
  cardsDrawn,
  kindRowsLoader,
  kindTitle,
  listEmpty,
  partShown,
  type Kind,
  type KindRow,
  type KindRowsLoader,
} from '../../lib/watchlistKinds';
import type { ItemDetail } from '../../hooks/useItem';

/**
 * The Watchlist HUB — the cross-client lists surface. A vertical stack
 * of horizontal poster shelves (the home-rail idiom: MediaRow + the
 * trailing "see all" tile), one shelf per user list, default list first
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
  // Why it couldn't load, for the shelf to say (lib/loadFailure.ts).
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // No list asked for: an opened list split by kind asks by kind instead.
    if (!token || !listId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const load = () => {
      getWatchlist(token, listId)
        .then((d) => {
          if (cancelled) return;
          setDetail(d);
          setError(null);
        })
        .catch((e) => {
          if (cancelled) return;
          setDetail(null);
          setError(e);
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
  }, [token, listId, attempt]);

  const retry = () => {
    setLoading(true);
    setAttempt((a) => a + 1);
  };

  return { detail, loading, error, retry };
}

/**
 * One list split by kind (docs/chino, watchlist 8.8.1): its two parts asked
 * one after the other, movies then shows, each drawn as its answer came and
 * asked again on the lists-changed broadcast; a part that couldn't load is
 * tried again by itself (lib/watchlistKinds.ts kindRowsLoader). Every
 * request takes the bearer of its moment, a renewed one too.
 */
function useWatchlistKindRows(listId: string) {
  const auth = useAuth();
  const bearer = useRef<string | null>(null);
  bearer.current = auth.user?.access_token ?? null;
  const signedIn = !!auth.user?.access_token;

  const [loader, setLoader] = useState<KindRowsLoader | null>(null);
  useEffect(() => {
    if (!signedIn) return;
    const next = kindRowsLoader({
      fetchKind: (token, kind) => getWatchlistOfKind(token, listId, kind),
      bearer: () => bearer.current,
    });
    setLoader(next);
    void next.load();
    const onChange = () => void next.load();
    window.addEventListener(LISTS_CHANGED, onChange);
    return () => {
      next.stop();
      window.removeEventListener(LISTS_CHANGED, onChange);
    };
  }, [listId, signedIn]);

  const rows = useSyncExternalStore(
    (listener) => loader?.subscribe(listener) ?? (() => undefined),
    () => loader?.rows() ?? LOADING_ROWS,
  );
  return { rows, retry: (kind: Kind) => void loader?.retry(kind) };
}

/** The cards a part has to draw, from its titles as asked for (useItemsByIds);
 *  null while they are still being asked for. */
function cardsOf(
  row: KindRow,
  resolved: { items: ItemDetail[]; loading: boolean; forIds: string | null },
  limit?: number,
): number | null {
  return cardsDrawn(row, { loading: resolved.loading, forIds: resolved.forIds, count: resolved.items.length }, limit);
}

/** A part's name without a count, while it loads or where it couldn't: the
 *  same heading level as with its count. */
function PartName({ label, level }: { label: string; level: 2 | 3 }) {
  const Heading = level === 2 ? 'h2' : 'h3';
  return <Heading className={`${PART_HEADING} mb-3`}>{label}</Heading>;
}

/** What "see all" says to a screen reader: the list it opens, and the part. */
function seeAllOf(list: string, part?: string): string {
  return part ? `see all ${part} of ${list}` : `see all of ${list}`;
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
    // Episodes saved to a list carry their SxxEyy coordinates — pass
    // them through MediaCard's `episode` prop (the same shape the CW
    // rail wires) so the entry reads "S01E05 · Title" instead of a
    // bare-title pseudo-movie card. Unlike the CW feed, /items/{id}
    // has no series_title, so the card title stays the episode title.
    episode:
      it.type === 'episode' && it.season_number != null && it.episode_number != null
        ? {
            season: it.season_number,
            episode: it.episode_number,
            episodeEnd: it.episodeEnd,
            title: it.title,
          }
        : undefined,
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
 * + horizontal cards + trailing "see all" tile); empty lists keep their
 * header + an empty-state hint so the MORE view (rename/delete) stays
 * reachable. Each shelf fetches its own list detail, so the hub fans
 * out the per-list requests in parallel like the home rails do.
 */
function WatchlistShelf({ list, onOpen }: ShelfProps) {
  const { detail, loading, error, retry } = useWatchlistDetail(list.id);
  const shelfIds = (detail?.items ?? []).slice(0, SHELF_CAP);
  const { items, loading: itemsLoading } = useItemsByIds(shelfIds);

  const title = `${list.name} · ${list.itemCount}`;

  if (items.length > 0) {
    return (
      <MediaRow
        title={title}
        onTitleClick={onOpen}
        onSeeAll={onOpen}
        seeAllLabel={seeAllOf(list.name)}
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
          className="text-2xl font-semibold text-white hover:text-chino-accent transition-colors text-left"
        >
          {title}
        </button>
        <button
          onClick={onOpen}
          aria-label={seeAllOf(list.name)}
          className="flex items-center gap-1 text-chino-accent hover:text-chino-accent/80 transition-colors"
        >
          <span className={SEE_ALL_LOOK}>{SEE_ALL}</span>
          <ChevronRight aria-hidden className="w-4 h-4" />
        </button>
      </div>
      {loading || itemsLoading ? (
        <LoadingState />
      ) : error ? (
        <CouldntLoad title={couldntLoad('this list')} error={error} onRetry={retry} />
      ) : (
        <p className="text-sm text-chino-muted">
          Save titles with the + button on any movie or show.
        </p>
      )}
    </div>
  );
}

/**
 * One hub shelf split by kind: the list's name and its own count as the
 * heading, then its movies and its shows, a row each with see all; a row with
 * nothing in it is left out, a list with nothing in it shows its empty line
 * as without the setting.
 */
function WatchlistKindShelf({ list, onOpen }: ShelfProps) {
  const { rows, retry } = useWatchlistKindRows(list.id);
  const idsOf = (kind: Kind) => {
    const row = rows[kind];
    return row.state === 'loaded' ? row.ids.slice(0, SHELF_CAP) : [];
  };
  const movies = useItemsByIds(idsOf('movie'));
  const shows = useItemsByIds(idsOf('series'));
  const resolved = { movie: movies, series: shows };
  const cards = { movie: cardsOf(rows.movie, movies, SHELF_CAP), series: cardsOf(rows.series, shows, SHELF_CAP) };
  const empty = listEmpty(rows, cards);

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={onOpen}
          className="text-2xl font-semibold text-white hover:text-chino-accent transition-colors text-left"
        >
          {`${list.name} · ${list.itemCount}`}
        </button>
        <button
          onClick={onOpen}
          aria-label={seeAllOf(list.name)}
          className="flex items-center gap-1 text-chino-accent hover:text-chino-accent/80 transition-colors"
        >
          <span className={SEE_ALL_LOOK}>{SEE_ALL}</span>
          <ChevronRight aria-hidden className="w-4 h-4" />
        </button>
      </div>
      {empty ? (
        <p className="text-sm text-chino-muted">Save titles with the + button on any movie or show.</p>
      ) : (
        KINDS.map(({ kind, label }) => {
          const row = rows[kind];
          if (!partShown(row, cards[kind])) return null;
          if (row.state === 'failed') {
            return (
              <div key={kind} className="mb-6">
                <PartName label={label} level={3} />
                <CouldntLoad title={couldntLoad('this list')} error={row.error} onRetry={() => retry(kind)} level={3} />
              </div>
            );
          }
          if (row.state === 'loading' || cards[kind] === null) {
            return (
              <div key={kind} className="mb-6">
                <PartName label={label} level={3} />
                <LoadingState />
              </div>
            );
          }
          return (
            <MediaRow
              key={kind}
              part
              title={kindTitle(label, row.ids.length)}
              onSeeAll={onOpen}
              seeAllLabel={seeAllOf(list.name, label)}
              noLoop
              items={resolved[kind].items.map(toCard)}
            />
          );
        })
      )}
    </div>
  );
}

/**
 * An opened list split by kind: its movies, then its shows, each under its
 * name and its own count; a part with nothing in it is left out, and a list
 * with nothing in it shows its empty view as without the setting.
 */
function KindParts({ listId, empty }: { listId: string; empty: React.ReactNode }) {
  const { rows, retry } = useWatchlistKindRows(listId);
  const movies = useItemsByIds(rows.movie.state === 'loaded' ? rows.movie.ids : []);
  const shows = useItemsByIds(rows.series.state === 'loaded' ? rows.series.ids : []);
  const resolved = { movie: movies, series: shows };
  const cards = { movie: cardsOf(rows.movie, movies), series: cardsOf(rows.series, shows) };

  // Still coming: asked, or its titles asked for.
  const pending = (kind: Kind) => rows[kind].state === 'loading' || (rows[kind].state === 'loaded' && cards[kind] === null);
  if (KINDS.every(({ kind }) => pending(kind))) return <LoadingState variant="full" />;
  if (listEmpty(rows, cards)) return <>{empty}</>;
  return (
    <>
      {KINDS.map(({ kind, label }) => {
        const row = rows[kind];
        if (!partShown(row, cards[kind])) return null;
        return (
          <section key={kind} className="mb-10">
            {/* One heading, at one level, loaded or not: with its count once
                its answer came. */}
            <PartName label={row.state === 'loaded' ? kindTitle(label, row.ids.length) : label} level={2} />
            {row.state === 'failed' ? (
              <CouldntLoad title={couldntLoad('this list')} error={row.error} onRetry={() => retry(kind)} level={3} />
            ) : pending(kind) ? (
              <LoadingState />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-4">
                {resolved[kind].items.map((it) => (
                  <MediaCard key={it.id} {...toCard(it)} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}

interface MoreViewProps {
  list: Watchlist;
  /** Split into its movies and its shows (Separate movies and shows). */
  split: boolean;
  onBack: () => void;
  rename: (listId: string, name: string) => Promise<Watchlist>;
  remove: (listId: string) => Promise<void>;
}

/**
 * The per-list MORE view: the full grid of the list's items plus the
 * list-management actions (rename always; delete hidden for the default
 * list). Back returns to the hub.
 */
function WatchlistMoreView({ list, split, onBack, rename, remove }: MoreViewProps) {
  // Split, the parts ask for the list by kind instead (KindParts).
  const { detail, loading, error, retry } = useWatchlistDetail(split ? '' : list.id);
  const { items, loading: itemsLoading } = useItemsByIds(split ? [] : detail?.items ?? []);

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

  const emptyList = (
    <div className="text-chino-muted py-12 text-center">
      <Bookmark className="w-10 h-10 mx-auto mb-3 opacity-40" />
      <p>This list is empty.</p>
      <p className="text-sm mt-1">Add titles from a movie or show page to see them here.</p>
    </div>
  );

  return (
    <div>
      {/* Header row: Back to hub, list name + count, rename/delete. */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="p-2 text-chino-muted hover:bg-chino-surface hover:text-white"
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
              className="bg-chino-bg border border-chino-border rounded px-3 py-1.5 text-lg text-white focus:outline-none focus:border-chino-accent"
            />
            <button
              onClick={() => void submitRename()}
              disabled={busy}
              className="p-2 bg-chino-accent hover:bg-chino-accent/80 text-chino-bg disabled:opacity-50"
              title="Save name"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setRenaming(false)}
              className="p-2 bg-white/10 hover:bg-white/20 text-white"
              title="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            <h1 className="text-3xl font-bold text-white">{list.name}</h1>
            <span className="text-lg text-chino-muted">{list.itemCount}</span>
            <button
              onClick={() => setRenaming(true)}
              className="p-1.5 text-chino-muted hover:bg-chino-surface hover:text-white"
              title="Rename list"
            >
              <Pencil className="w-4 h-4" />
            </button>
            {!list.isDefault ? (
              <button
                onClick={() => void onDelete()}
                className="p-1.5 text-chino-muted hover:bg-chino-surface hover:text-chino-red"
                title="Delete list"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            ) : null}
          </>
        )}
      </div>

      {formErr ? <p className="text-chino-red text-sm mb-4">{formErr}</p> : null}

      {/* Grid — reuses the Movies/Series grid shape + MediaCard; split, a
          grid for each kind. */}
      {split ? (
        <KindParts listId={list.id} empty={emptyList} />
      ) : loading || itemsLoading ? (
        <LoadingState variant="full" />
      ) : error ? (
        <CouldntLoad title={couldntLoad('this list')} error={error} onRetry={retry} />
      ) : items.length === 0 ? (
        emptyList
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
  const { lists, loading: listsLoading, error: listsError, reload, create, rename, remove } = useWatchlists();
  // Separate movies and shows: drawn at once with the choice as last known,
  // read again as the watchlist opens, and followed where it differs.
  const { split } = useWatchlistByKind(true);

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
        <h1 className={PAGE_HEADING}>{WATCHLIST_WORDS.heading}</h1>
        <LoadingState variant="full" />
      </div>
    );
  }

  // The lists couldn't load, and there are none from before to show: say
  // why, with try again (docs/chino, playback: when a page couldn't load).
  if (listsError && lists.length === 0) {
    return (
      <div>
        <h1 className={PAGE_HEADING}>{WATCHLIST_WORDS.heading}</h1>
        <CouldntLoad title={couldntLoad('your watchlists')} error={listsError} onRetry={() => void reload()} />
      </div>
    );
  }

  if (openList) {
    return (
      <WatchlistMoreView
        list={openList}
        split={split}
        onBack={() => setOpenListId(null)}
        rename={rename}
        remove={remove}
      />
    );
  }

  return (
    <div>
      <h1 className={PAGE_HEADING}>{WATCHLIST_WORDS.heading}</h1>

      {/* One shelf per list — default first, then by createdAt (the
          server's GET /me/watchlists order). */}
      {lists.map((list) => (
        split ? (
          <WatchlistKindShelf key={list.id} list={list} onOpen={() => setOpenListId(list.id)} />
        ) : (
          <WatchlistShelf key={list.id} list={list} onOpen={() => setOpenListId(list.id)} />
        )
      ))}

      {/* Trailing "+ new list" affordance, in the mono face. */}
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
              className="bg-chino-bg border border-chino-border px-3 py-1.5 text-sm text-white placeholder-chino-muted focus:outline-none focus:border-chino-accent"
            />
            <button
              onClick={() => void submitCreate()}
              disabled={busy}
              className="p-1.5 bg-chino-accent hover:bg-chino-accent/80 text-chino-bg disabled:opacity-50"
              title={WATCHLIST_WORDS.createList}
              aria-label={WATCHLIST_WORDS.createList}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            </button>
            <button
              onClick={() => {
                setCreating(false);
                setNewName('');
                setFormErr(null);
              }}
              className="p-1.5 bg-white/10 hover:bg-white/20 text-white"
              title={WATCHLIST_WORDS.cancel}
              aria-label={WATCHLIST_WORDS.cancel}
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
            className="px-4 py-1.5 font-mono text-sm border border-dashed border-chino-border text-chino-accent hover:bg-chino-surface flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" aria-hidden />
            {WATCHLIST_WORDS.newList}
          </button>
        )}
      </div>

      {formErr ? <p className="text-chino-red text-sm mb-4">{formErr}</p> : null}
    </div>
  );
}
