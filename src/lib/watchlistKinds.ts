// Movies and shows apart (docs/chino, watchlist 8.8.1, settings 16.4.7):
// the account's Separate movies and shows, and every list split into its
// movies and its shows while it is on.
//
// The choice is the account's, kept by chino-api (`GET` and `PATCH
// /api/v1/me/settings`, `watchlist_by_kind`), and offered only where the
// server says `features.watchlist_kinds` in /api/config. This browser keeps
// a copy of each account's last answer, by the account's subject, in
// localStorage `chino:watchlistByKind:<subject>`: the watchlist and settings
// are drawn with it at once, while the choice is read again and where it
// couldn't be, and follow the answer where it differs. Every tab of the
// browser shares the copy, so a save in one tab is followed by the others of
// the same account (`heard`). The copy goes when the account leaves the
// browser: at a sign-out and once it is deleted (`forget`).
//
// A tab stays with the account it was loaded for (lib/tabAccount.ts): the
// choice shown is the one of the tab's bearer's account, and a read or a
// save goes only with a bearer the tab may write with, so one person's
// choice is never read, kept or sent as another's.
//
// A list split by kind asks for its two rows one after the other, movies
// then shows (`?kind=movie`, `?kind=series`, the latter with the episodes
// and every other kind), and draws each answer as it came, never mending one
// by the other. Pure: watchlistKinds.test.ts runs it under node --test.

import { subjectOf } from './streamTokenCache.ts';

/** A stored copy's key is this and the account's subject. */
export const CHOICE_PREFIX = 'chino:watchlistByKind:';

/** A list's two kinds, in their order: what chino-api is asked for and the
 *  part's name. Shows are everything else a list holds. */
export type Kind = 'movie' | 'series';
export const KINDS: readonly { kind: Kind; label: string }[] = [
  { kind: 'movie', label: 'movies' },
  { kind: 'series', label: 'shows' },
];

/** A part's name with its count: "movies · 4". */
export function kindTitle(label: string, count: number): string {
  return `${label} · ${count}`;
}

/** The setting as the page's other settings word theirs. */
export const BY_KIND_LABEL = 'Separate movies and shows';
export const BY_KIND_HINT =
  'Every list shows its movies in one row and its shows in another. Your choice goes with your account, to every device you sign in on.';
export const BY_KIND_GROUP = 'watchlist';
export const BY_KIND_SAVE_FAILED = "Couldn't save the setting.";

type ChoiceStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** The copy kept for `subject`: its last answer, null where there is none. */
export function storedChoice(local: ChoiceStorage | null, subject: string): boolean | null {
  try {
    const raw = local?.getItem(CHOICE_PREFIX + subject);
    return raw === '1' ? true : raw === '0' ? false : null;
  } catch {
    return null;
  }
}

function keepChoice(local: ChoiceStorage | null, subject: string, on: boolean): void {
  try {
    local?.setItem(CHOICE_PREFIX + subject, on ? '1' : '0');
  } catch {
    /* storage off: the choice is this tab's until it closes */
  }
}

/** The copy of `subject`'s choice gone: the account left the browser. */
export function forgetChoice(local: ChoiceStorage | null, subject: string | null): void {
  if (!subject) return;
  try {
    local?.removeItem(CHOICE_PREFIX + subject);
  } catch {
    /* storage off */
  }
}

/**
 * The account's choice in an answer of GET or PATCH /api/v1/me/settings: its
 * `watchlist_by_kind`. An answer without a boolean there is no answer of the
 * choice, and fails as a read or a save that failed does.
 */
export function settingsChoice(body: unknown): boolean {
  const value = (body as { watchlist_by_kind?: unknown } | null)?.watchlist_by_kind;
  if (typeof value !== 'boolean') throw new SyntaxError('the settings answer has no watchlist_by_kind');
  return value;
}

/** How long a read of the choice may take before it counts as failed. */
export const READ_BOUND_MS = 10_000;

/** What the tab shows of the setting, for its account. */
export interface ByKindState {
  /** The choice: the account's answer, else the copy, else off. */
  on: boolean;
  /** It is being read again. */
  reading: boolean;
  /** A save is out, and the choice it saves. */
  saving: boolean | null;
  /** Why the last save failed, until the switch is used again. */
  saveFailed: unknown;
}

const NOBODY: ByKindState = { on: false, reading: false, saving: null, saveFailed: null };

export interface ByKindParts {
  /** The server says `features.watchlist_kinds`. */
  offered(): boolean;
  /** The tab's bearer now. */
  bearer(): string | null;
  /** Whether a request with `bearer` may go from this tab: its account. */
  mayWrite(bearer: string): boolean;
  /** GET /api/v1/me/settings: the account's `watchlist_by_kind`. */
  read(bearer: string): Promise<boolean>;
  /** PATCH /api/v1/me/settings: sets it and answers it as kept. */
  save(bearer: string, on: boolean): Promise<boolean>;
  /** localStorage, null where the browser gives none. */
  local: ChoiceStorage | null;
  /** Settles after `ms`: the bound of a read (READ_BOUND_MS). */
  wait?: (ms: number) => Promise<void>;
}

export interface ByKind {
  /** The setting for the tab's account; the same object while unchanged. */
  state(): ByKindState;
  /** Every list is split: the server offers it and the choice is on. */
  split(): boolean;
  subscribe(listener: () => void): () => void;
  /** Reads the choice again: it may have changed on another device. */
  read(): Promise<void>;
  /** The switch pressed: saves `on` for the account whose choice it shows. */
  press(on: boolean): Promise<void>;
  /** A storage event from another tab of this browser. */
  heard(key: string | null, value: string | null): void;
  /** The copy of `subject`'s choice goes, and what this tab holds of it. */
  forget(subject: string | null): void;
}

export function byKind(parts: ByKindParts): ByKind {
  // What the server answered in this tab, per subject.
  const answered = new Map<string, boolean>();
  // Reads under way, per subject.
  const reading = new Map<string, number>();
  const saving = new Map<string, boolean>();
  const saveFailed = new Map<string, unknown>();
  // Counts the reads and saves begun; per subject, the count at the save
  // kept last, or at its leaving: a read begun before keeps nothing.
  let asks = 0;
  const readsFrom = new Map<string, number>();
  // Per subject, the count at its leaving: a save begun before keeps nothing.
  const leftAt = new Map<string, number>();
  // The accounts that left this browser, here or in another tab: nothing of
  // theirs is read, sent or kept again until another tab keeps their copy
  // anew - the same account signed in there again.
  const gone = new Set<string>();
  const wait = parts.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const listeners = new Set<() => void>();
  let snapshot: { subject: string | null; state: ByKindState } | null = null;

  /** The tab's account: the subject of a bearer it may write with. */
  function mine(): { subject: string; bearer: string } | null {
    const bearer = parts.bearer();
    if (!bearer || !parts.mayWrite(bearer)) return null;
    const subject = subjectOf(bearer);
    return subject ? { subject, bearer } : null;
  }

  function compute(subject: string | null): ByKindState {
    if (!subject) return NOBODY;
    return {
      on: answered.get(subject) ?? storedChoice(parts.local, subject) ?? false,
      reading: (reading.get(subject) ?? 0) > 0,
      saving: saving.get(subject) ?? null,
      saveFailed: saveFailed.get(subject) ?? null,
    };
  }

  function same(a: ByKindState, b: ByKindState): boolean {
    return a.on === b.on && a.reading === b.reading && a.saving === b.saving && a.saveFailed === b.saveFailed;
  }

  function state(): ByKindState {
    const subject = mine()?.subject ?? null;
    const next = compute(subject);
    if (snapshot && snapshot.subject === subject && same(snapshot.state, next)) return snapshot.state;
    snapshot = { subject, state: next };
    return next;
  }

  function changed(): void {
    listeners.forEach((listener) => listener());
  }

  function keep(subject: string, on: boolean): void {
    if (gone.has(subject)) return;
    answered.set(subject, on);
    keepChoice(parts.local, subject, on);
  }

  function left(subject: string): void {
    gone.add(subject);
    answered.delete(subject);
    saveFailed.delete(subject);
    // A read or a save still out for it keeps nothing.
    leftAt.set(subject, ++asks);
    readsFrom.set(subject, asks);
  }

  return {
    state,
    split: () => parts.offered() && state().on,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async read() {
      const who = mine();
      if (!parts.offered() || !who || gone.has(who.subject)) return;
      const ask = ++asks;
      reading.set(who.subject, (reading.get(who.subject) ?? 0) + 1);
      changed();
      try {
        // A read that takes longer than its bound has failed: its answer,
        // should it still come, keeps nothing.
        const bound = wait(READ_BOUND_MS).then((): never => {
          throw new Error('the read took too long');
        });
        // Past an answer in time, the bound's end is heard by nobody.
        bound.catch(() => undefined);
        const on = await Promise.race([parts.read(who.bearer), bound]);
        // A save begun after this read, or the account's leaving, wins.
        if ((readsFrom.get(who.subject) ?? 0) < ask) keep(who.subject, on);
      } catch {
        // Not read: the choice shown stays, and works.
      } finally {
        reading.set(who.subject, (reading.get(who.subject) ?? 1) - 1);
        changed();
      }
    },
    async press(on) {
      const who = mine();
      if (!parts.offered() || !who || saving.has(who.subject) || gone.has(who.subject)) return;
      const ask = ++asks;
      saving.set(who.subject, on);
      saveFailed.delete(who.subject);
      readsFrom.set(who.subject, ask);
      changed();
      try {
        const kept = await parts.save(who.bearer, on);
        // The save's answer is the choice from now on, unless the account
        // left meanwhile; a read out while it was saved keeps nothing.
        if ((leftAt.get(who.subject) ?? 0) < ask) {
          keep(who.subject, kept);
          readsFrom.set(who.subject, ++asks);
        }
      } catch (error) {
        if ((leftAt.get(who.subject) ?? 0) < ask) saveFailed.set(who.subject, error);
      } finally {
        saving.delete(who.subject);
        changed();
      }
    },
    heard(key, value) {
      if (!key || !key.startsWith(CHOICE_PREFIX)) return;
      const subject = key.slice(CHOICE_PREFIX.length);
      // Another tab's answer is the latest; its copy gone is the account's
      // leaving, signed out or deleted there.
      if (value === '1' || value === '0') {
        gone.delete(subject);
        answered.set(subject, value === '1');
        readsFrom.set(subject, ++asks);
      } else {
        left(subject);
      }
      changed();
    },
    forget(subject) {
      if (!subject) return;
      forgetChoice(parts.local, subject);
      left(subject);
      changed();
    },
  };
}

// ---------------------------------------------------------------------------
// A list split by kind
// ---------------------------------------------------------------------------

/** One part of a list split by kind, as its answer came. */
export type KindRow =
  | { state: 'loading' }
  | { state: 'loaded'; ids: string[] }
  | { state: 'failed'; error: unknown };

export type KindRows = Record<Kind, KindRow>;

export const LOADING_ROWS: KindRows = { movie: { state: 'loading' }, series: { state: 'loading' } };

export interface KindRowsParts {
  /** GET /api/v1/me/watchlists/{id}?kind=: the list's titles of `kind`,
   *  asked with `bearer`. */
  fetchKind(bearer: string, kind: Kind): Promise<string[]>;
  /** The tab's bearer at the moment a part is asked for: a renewed one
   *  replaces the one the list was opened with. */
  bearer(): string | null;
}

export interface KindRowsLoader {
  /** The two parts as shown: the same object while unchanged. */
  rows(): KindRows;
  subscribe(listener: () => void): () => void;
  /** Asks for both parts, one after the other, movies then shows; each is
   *  drawn as its answer came, and what is shown stays until it comes. */
  load(): Promise<void>;
  /** Asks for one part again, by itself: it shows as loading until then. */
  retry(kind: Kind): Promise<void>;
  /** The list is no longer shown: no answer is drawn any more. */
  stop(): void;
}

/**
 * One list split by kind: what is shown of its two parts, and asking for
 * them. Every request takes the bearer of that moment; the answer of the
 * request asked last for a part is the one drawn, whichever comes first.
 */
export function kindRowsLoader(parts: KindRowsParts): KindRowsLoader {
  let shown: KindRows = LOADING_ROWS;
  let stopped = false;
  const asked: Record<Kind, number> = { movie: 0, series: 0 };
  const listeners = new Set<() => void>();

  function set(kind: Kind, row: KindRow): void {
    if (stopped) return;
    shown = { ...shown, [kind]: row };
    listeners.forEach((listener) => listener());
  }

  async function ask(kind: Kind): Promise<void> {
    const mine = ++asked[kind];
    const bearer = parts.bearer();
    let row: KindRow;
    try {
      if (!bearer) throw new Error('not signed in');
      row = { state: 'loaded', ids: await parts.fetchKind(bearer, kind) };
    } catch (error) {
      row = { state: 'failed', error };
    }
    if (asked[kind] === mine) set(kind, row);
  }

  return {
    rows: () => shown,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async load() {
      for (const { kind } of KINDS) await ask(kind);
    },
    async retry(kind) {
      set(kind, { state: 'loading' });
      await ask(kind);
    },
    stop() {
      stopped = true;
      listeners.clear();
    },
  };
}

/**
 * How many cards a part has to draw: the titles the catalog gave for its
 * ids. Null while they are still being asked for - a part whose titles were
 * answered for other ids than its own, the ones before, among them.
 */
export function cardsDrawn(
  row: KindRow,
  titles: { loading: boolean; forIds: string | null; count: number },
  limit?: number,
): number | null {
  if (row.state !== 'loaded') return null;
  if (row.ids.length === 0) return 0;
  const ids = (limit ? row.ids.slice(0, limit) : row.ids).join(',');
  if (titles.loading || titles.forIds !== ids) return null;
  return titles.count;
}

/**
 * Whether a part is drawn: one still loading, or that couldn't load, is;
 * one with nothing in it is left out, and so is one with no card to draw -
 * `cards`, how many of its titles the catalog gave, null while they are
 * still being asked for.
 */
export function partShown(row: KindRow, cards: number | null): boolean {
  if (row.state !== 'loaded') return true;
  return row.ids.length > 0 && (cards === null || cards > 0);
}

/** Both parts came, and neither has a card to draw: the list shows what it
 *  shows with the setting off, its empty line. */
export function listEmpty(rows: KindRows, cards: Record<Kind, number | null>): boolean {
  return KINDS.every(({ kind }) => {
    const row = rows[kind];
    return row.state === 'loaded' && (row.ids.length === 0 || cards[kind] === 0);
  });
}
