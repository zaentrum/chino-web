// What the player writes for the account while a title plays: its position
// every 10 s (what Continue watching lists) and, once, that it is watched.
// Each checks first that its bearer is the account this tab was loaded for
// (lib/tabAccount.ts), so a tab that took up another account's sign-in
// writes nothing under it. Pure: tabAccount.test.ts runs it under
// node --test, with a fake fetch.

export interface PlayerWriter {
  /** Whether a write with this bearer may go (auth/tabAccount.ts tabMayWrite). */
  mayWrite(bearer: string): boolean;
  /** The browser's fetch, in the app. */
  send(url: string, init: RequestInit): Promise<unknown>;
}

function go(w: PlayerWriter, url: string, init: RequestInit): void {
  try {
    void w.send(url, init).catch(() => undefined);
  } catch {
    /* a write that can't leave is dropped, as a failed one is */
  }
}

/** POST /api/v1/items/{id}/progress with the playhead and the duration, in
 *  seconds. Whether it went. */
export function saveProgress(w: PlayerWriter, bearer: string, itemId: string, positionSec: number, durationSec: number): boolean {
  if (!w.mayWrite(bearer)) return false;
  go(w, `/api/v1/items/${itemId}/progress`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bearer}`,
    },
    body: JSON.stringify({ position_sec: positionSec, duration_sec: durationSec }),
    keepalive: true,
  });
  return true;
}

/** POST /api/v1/me/items/{id}/watched. Whether it went. */
export function markWatched(w: PlayerWriter, bearer: string, itemId: string): boolean {
  if (!w.mayWrite(bearer)) return false;
  go(w, `/api/v1/me/items/${encodeURIComponent(itemId)}/watched`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${bearer}` },
  });
  return true;
}
