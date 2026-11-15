// The stream token's cache: one entry in the tab's sessionStorage, for the
// account the token was minted for. A stream token carries its account's
// rights (an age cap among them) for 6 hours, so it must never serve the next
// person who signs in in the same tab: an entry is read back only for the
// account it names (change P.C16 of the specification, spec/portal/people.md).

export const STREAM_TOKEN_KEY = 'chino:streamToken';

/** Refresh this long before the token runs out, so the server never refuses one the cache still calls valid. */
export const EXPIRY_MARGIN_MS = 60_000;

export interface CachedStreamToken {
  token: string;
  expiresAt: number; // epoch ms
  /** The account the token was minted for: the `sub` of the bearer that asked for it. */
  sub: string;
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * The account a bearer is for: the `sub` of its payload, or null when the
 * bearer is no JWT or names none. Read, not verified: the server verifies it;
 * here it only says whose cache entry to use.
 */
export function subjectOf(bearer: string | null | undefined): string | null {
  if (!bearer) return null;
  const part = bearer.split('.')[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as { sub?: unknown };
    return typeof payload.sub === 'string' && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}

/**
 * The cached token of this account, or null: there is none, it runs out
 * within the margin, or it is another account's. An entry that names no
 * account (written before entries named one) is nobody's.
 */
export function readStreamToken(store: Store, sub: string | null | undefined, now: number = Date.now()): CachedStreamToken | null {
  if (!sub) return null;
  try {
    const raw = store.getItem(STREAM_TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedStreamToken>;
    if (!parsed.token || typeof parsed.expiresAt !== 'number') return null;
    if (parsed.sub !== sub) return null;
    if (now > parsed.expiresAt - EXPIRY_MARGIN_MS) return null;
    return { token: parsed.token, expiresAt: parsed.expiresAt, sub: parsed.sub };
  } catch {
    return null;
  }
}

/** Keeps a token for the account it was minted for, in place of whatever the tab held. */
export function writeStreamToken(store: Store, entry: CachedStreamToken): void {
  try { store.setItem(STREAM_TOKEN_KEY, JSON.stringify(entry)); } catch { /* quota, or storage off */ }
}

/** Drops the cached token, whoever's it is: its account signed out or is gone. */
export function forgetCachedStreamToken(store: Store): void {
  try { store.removeItem(STREAM_TOKEN_KEY); } catch { /* storage off */ }
}
