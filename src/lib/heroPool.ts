// The titles the home hero rotates through. A title is in the pool with a
// trailer: one this server plays (lib/trailers.ts) or a YouTube link.
// Those with one this server plays come first; each group is shuffled, and
// the hero takes eight. Pure: heroPool.test.ts runs it under node --test.

import type { ExtraRef, TrailerRef } from '../hooks/useItem';
import { trailerChoice } from './trailers.ts';

/** How many titles the hero rotates through. */
export const HERO_POOL_SIZE = 8;

const YT_KEY = /[?&]v=([A-Za-z0-9_-]{6,})|youtu\.be\/([A-Za-z0-9_-]{6,})|youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/;

/** The YouTube video id in a link to one; '' when it is none. */
export function youTubeKey(url: string | null | undefined): string {
  const m = (url ?? '').match(YT_KEY);
  if (!m) return '';
  return m[1] || m[2] || m[3] || '';
}

/** What puts a title in the pool, and what its Trailer opens. */
export interface HeroTrailer {
  /** The YouTube id of its first link to one; '' when it has none. */
  ytKey: string;
  /** The trailer this server plays (lib/trailers.ts localTrailer), which
   *  the hero's Trailer opens on the trailer page. */
  extraId?: string;
  /** Where it has none: the link its Trailer opens, the one a title's page
   *  opens (lib/trailers.ts pickTrailer). */
  url?: string;
}

/** A title's trailers as the hero reads them; null when it has neither a
 *  trailer this server plays nor a YouTube link - not one for the pool. */
export function heroTrailer(
  detail: { extras?: readonly ExtraRef[] | null; trailers?: readonly TrailerRef[] | null } | null | undefined,
): HeroTrailer | null {
  if (!detail) return null;
  const ytKey = (detail.trailers ?? []).map((t) => youTubeKey(t.url)).find((k) => k !== '') ?? '';
  const choice = trailerChoice(detail);
  if (choice?.local) return { ytKey, extraId: choice.extra.id };
  if (!ytKey) return null;
  return choice ? { ytKey, url: choice.link.url } : { ytKey };
}

/** A shuffled copy (Fisher-Yates) of `xs`; `random` is Math.random's kind. */
export function shuffled<T>(xs: readonly T[], random: () => number = Math.random): T[] {
  const out = xs.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The pool, in the order the hero shows it: the titles with a trailer this
 * server plays, then those with a YouTube link only, each group shuffled
 * so the rotation is not always the same - at most `size` of them.
 */
export function heroPoolOrder<T extends { extraId?: string }>(
  entries: readonly T[],
  random: () => number = Math.random,
  size: number = HERO_POOL_SIZE,
): T[] {
  const local = shuffled(entries.filter((e) => !!e.extraId), random);
  const linked = shuffled(entries.filter((e) => !e.extraId), random);
  return [...local, ...linked].slice(0, Math.max(0, size));
}
