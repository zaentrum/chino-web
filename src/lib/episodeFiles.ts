// One file can hold several episodes (a double-length finale listed as two):
// it is listed once, watched as one, and stepping on from it goes to the
// episode after the last it holds. Pure: episodeFiles.test.ts runs it under
// node --test.

/** An episode as chino-api sends it (the fields used here). */
export interface FileEpisode {
  id: string;
  episode_number?: number;
  /** On the other episodes of a file that holds several: the holder's id. */
  coveredBy?: string;
  /** On the holder, the first episode of such a file: the others, in order. */
  covers?: string[];
  /** On the holder: the last episode number the file holds. */
  episodeEnd?: number;
}

/** One file's entry: the episode it is listed and played under, with the
 *  other episodes it holds. */
export interface FileEntry<E extends FileEpisode> {
  /** The holder: the episode whose file this is. */
  episode: E;
  /** The other episodes the file holds, in order; empty for most files. */
  covered: E[];
  /** The first and the last episode number the file holds. */
  first: number;
  last: number;
}

/**
 * The entries of a list of episodes in order, one per file: the episodes a
 * file holds besides its holder fold into the holder's entry. An episode
 * whose holder is not in the list keeps an entry of its own (it still plays
 * its holder's file).
 */
export function fileEntries<E extends FileEpisode>(episodes: readonly E[]): FileEntry<E>[] {
  const here = new Set(episodes.map((e) => e.id));
  const holderOf = new Map<string, string>();
  for (const e of episodes) {
    for (const c of e.covers ?? []) if (c !== e.id) holderOf.set(c, e.id);
  }
  for (const e of episodes) {
    if (e.coveredBy && e.coveredBy !== e.id && here.has(e.coveredBy)) holderOf.set(e.id, e.coveredBy);
  }
  const entries: FileEntry<E>[] = [];
  const byHolder = new Map<string, FileEntry<E>>();
  for (const e of episodes) {
    if (holderOf.has(e.id)) continue;
    const n = e.episode_number ?? 0;
    const entry: FileEntry<E> = { episode: e, covered: [], first: n, last: Math.max(n, e.episodeEnd ?? n) };
    entries.push(entry);
    byHolder.set(e.id, entry);
  }
  for (const e of episodes) {
    const entry = byHolder.get(holderOf.get(e.id) ?? '');
    if (!entry) continue;
    entry.covered.push(e);
    entry.last = Math.max(entry.last, e.episode_number ?? 0);
  }
  return entries;
}

/** Every id an entry answers to: its holder's, then the covered episodes'. */
export function entryIds<E extends FileEpisode>(entry: FileEntry<E>): string[] {
  return [entry.episode.id, ...entry.covered.map((e) => e.id)];
}

/**
 * The entries before and after the file the episode `id` plays, among a
 * series' episodes in order: from a file that holds episodes 18 and 19, next
 * is 20 and previous is 17, whichever of the two the player was opened with.
 */
export function fileNeighbours<E extends FileEpisode>(
  episodes: readonly E[],
  id: string,
): { current: FileEntry<E> | null; prev: FileEntry<E> | null; next: FileEntry<E> | null } {
  const entries = fileEntries(episodes);
  const at = entries.findIndex((en) => en.episode.id === id || en.covered.some((e) => e.id === id));
  if (at < 0) return { current: null, prev: null, next: null };
  return {
    current: entries[at],
    prev: at > 0 ? entries[at - 1] : null,
    next: at < entries.length - 1 ? entries[at + 1] : null,
  };
}

/**
 * A list of watched rows, newest first, one row per file: chino-api marks
 * every episode of a file watched together, so the history holds a row for
 * each. The file keeps the place of its first row and is shown as its holder
 * when the list has the holder's row, else as the row it was.
 */
export function oneRowPerFile<E extends FileEpisode>(rows: readonly E[]): E[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const holderOf = new Map<string, string>();
  for (const r of rows) {
    for (const c of r.covers ?? []) if (c !== r.id) holderOf.set(c, r.id);
  }
  for (const r of rows) {
    if (r.coveredBy && r.coveredBy !== r.id) holderOf.set(r.id, r.coveredBy);
  }
  const seen = new Set<string>();
  const out: E[] = [];
  for (const r of rows) {
    const file = holderOf.get(r.id) ?? r.id;
    if (seen.has(file)) continue;
    seen.add(file);
    out.push(byId.get(file) ?? r);
  }
  return out;
}

const two = (n: number) => n.toString().padStart(2, '0');

/** S03E18, or S03E18–19 for a file that holds several episodes. */
export function episodeCode(season: number, first: number, last?: number | null): string {
  const code = `S${two(season)}E${two(first)}`;
  return last != null && last > first ? `${code}–${two(last)}` : code;
}
