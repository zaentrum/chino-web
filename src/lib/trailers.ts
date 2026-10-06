// What a title's Trailer plays. A trailer this server plays - one of the
// title's extras, chino-api's `extras` - comes first: it opens the trailer
// page (components/TrailerPage.tsx) on the app's own player. Else a link to
// a trailer online (`trailers`), opened outside the app as before; else the
// title has no Trailer. Pure: trailers.test.ts runs it under node --test.

import type { ExtraRef, TrailerRef } from '../hooks/useItem';
import { isNotFoundStatus } from './reportPolicy.ts';

/** The kinds of extra that are a title's trailer, a trailer before a teaser. */
export const TRAILER_KINDS: readonly string[] = ['trailer', 'teaser'];

/** An extra the trailer page can play: one this server has (an id,
 *  `local: true`), with a master (`play_path`). */
function playsHere(e: ExtraRef | null | undefined): e is ExtraRef {
  return !!e && e.local === true && typeof e.id === 'string' && e.id !== ''
    && typeof e.play_path === 'string' && e.play_path !== '';
}

/**
 * The extra a title's Trailer plays: one of TRAILER_KINDS this server plays,
 * chosen the same way on every client. A trailer before a teaser, whatever
 * their seasons - a season's trailer before the whole title's teaser; within
 * a kind, one of the whole title before one of a season; and among equals
 * the first in the server's order, the order a viewer sees the extras in.
 * Null when there is none.
 */
export function localTrailer(extras: readonly ExtraRef[] | null | undefined): ExtraRef | null {
  let pick: ExtraRef | null = null;
  let pickRank = Infinity;
  for (const e of extras ?? []) {
    if (!playsHere(e)) continue;
    const kind = TRAILER_KINDS.indexOf((e.kind ?? '').toLowerCase());
    if (kind < 0) continue;
    const rank = kind * 2 + (e.season_number == null ? 0 : 1);
    if (rank < pickRank) {
      pick = e;
      pickRank = rank;
    }
  }
  return pick;
}

/** The extra `extraId` of a title, when this server plays it: what the
 *  trailer page plays. Any kind - the page plays what it is pointed at. */
export function findExtra(extras: readonly ExtraRef[] | null | undefined, extraId: string): ExtraRef | null {
  return (extras ?? []).find((e) => playsHere(e) && e.id === extraId) ?? null;
}

/**
 * The link the Trailer opened before the server played trailers, and still
 * does where it plays none: a YouTube one first, an "Official Trailer"
 * before any other trailer, else the first. Null when there is none.
 */
export function pickTrailer(trailers: readonly TrailerRef[] | null | undefined): TrailerRef | null {
  if (!trailers || !trailers.length) return null;
  const yt = trailers.filter((t) => (t.site || '').toLowerCase().includes('youtube'));
  const pool = yt.length ? yt : trailers;
  const official = pool.find((t) => /official/i.test(t.title ?? '') && /trailer/i.test(t.title ?? ''));
  if (official) return official;
  const anyTrailer = pool.find((t) => /trailer/i.test(t.title ?? ''));
  return anyTrailer ?? pool[0];
}

/** What the Trailer opens: an extra on the trailer page, or a link. */
export type TrailerChoice =
  | { local: true; extra: ExtraRef }
  | { local: false; link: TrailerRef };

/** The title's Trailer: its local trailer, else pickTrailer's link; null
 *  when it has neither. A link without a url is none. */
export function trailerChoice(
  item: { extras?: readonly ExtraRef[] | null; trailers?: readonly TrailerRef[] | null } | null | undefined,
): TrailerChoice | null {
  if (!item) return null;
  const extra = localTrailer(item.extras);
  if (extra) return { local: true, extra };
  const link = pickTrailer(item.trailers);
  return link && link.url ? { local: false, link } : null;
}

/** The trailer page of a title's extra, as an app path (toApp it). */
export function trailerPath(itemId: string, extraId: string): string {
  return `/trailer/${encodeURIComponent(itemId)}/${encodeURIComponent(extraId)}`;
}

/** An extra's master as the player asks for it: its play_path with the
 *  stream token, the quality (Auto, or the one rung picked) and this
 *  browser's caps, as a title's master is - and, after a rebuilt source,
 *  the same cache-buster (_r). */
export function extraMasterUrl(playPath: string, o: { stream: string; q?: string; caps?: string; reload?: number }): string {
  const params = new URLSearchParams({ stream: o.stream });
  if (o.q) params.set('q', o.q);
  if (o.caps) params.set('caps', o.caps);
  if (o.reload && o.reload > 0) params.set('_r', String(o.reload));
  return `${playPath}${playPath.includes('?') ? '&' : '?'}${params.toString()}`;
}

/** Why a trailer did not play, by the status of what was asked for (the
 *  title, or the extra's master): not there - 400, 404, 410 - or it failed
 *  (any other status, or none: no answer, or a player that cannot say). */
export function trailerFailure(status: number | null | undefined): 'not-found' | 'failed' {
  return status === 400 || isNotFoundStatus(status) ? 'not-found' : 'failed';
}

/** The one event the trailer page reports, once its trailer plays: a batch
 *  for chino-api's POST /api/v1/play/events, the player's sink. */
export function trailerPlayBatch(o: { sessionId: string; itemId: string; extraId: string; ts: number }) {
  return {
    sessionId: o.sessionId,
    events: [{ ts: o.ts, kind: 'trailer_play', itemId: o.itemId, payload: { extraId: o.extraId, local: true } }],
  };
}
