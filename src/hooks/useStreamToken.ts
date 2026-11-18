import { useEffect, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { forgetCachedStreamToken, readStreamToken, subjectOf, writeStreamToken, type CachedStreamToken } from '../lib/streamTokenCache';

// Minted server-side via POST /api/v1/me/stream-token. Lives 6 h. Used
// in the URL of any media asset that must survive an OIDC silent
// renew without a refetch: <video src>, <img src> for posters /
// backdrops, <track src> for embedded subtitles. Without this, every
// renewal rotates the URL of every <img> on screen and the browser
// re-fetches them all — visible as a multi-second flicker on the
// catalog grid every ~5 min.
//
// The token is cached in sessionStorage so a page reload reuses the
// same value (the browser's HTTP cache then serves the same artwork
// URLs straight from cache). The hook never fetches a new token while
// one is still valid; it only re-mints if the cached token is gone
// or expired.
//
// A token carries its account's rights, an age cap among them, so the
// cache holds it for that account alone (lib/streamTokenCache): the
// next person who signs in in the same tab gets a token of their own,
// and signing out drops it, with the tab's hero pool
// (auth/tabAccount.ts forgetTabAccountData).

/** The tab's storage, or one that holds nothing where the browser gives none. */
function tabStore(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  try {
    return sessionStorage;
  } catch {
    return { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
  }
}

function readCache(sub: string | null): CachedStreamToken | null {
  return readStreamToken(tabStore(), sub);
}

/** Drops the cached token: the account it was minted for signs out, or is gone. */
export function forgetStreamToken(): void {
  forgetCachedStreamToken(tabStore());
}

// One request at a time, for one account: a request under way for another
// account is not this one's answer.
let inflight: { sub: string; promise: Promise<string | null> | null } | null = null;

async function mintStreamToken(bearer: string): Promise<string | null> {
  const sub = subjectOf(bearer);
  if (!sub) return null;
  if (inflight && inflight.sub === sub && inflight.promise) return inflight.promise;
  const mine: { sub: string; promise: Promise<string | null> | null } = { sub, promise: null };
  mine.promise = (async () => {
    try {
      const r = await fetch('/api/v1/me/stream-token', {
        method: 'POST',
        headers: { Authorization: `Bearer ${bearer}` },
      });
      if (!r.ok) return null;
      const j = await r.json() as { stream_token?: string; expires_at?: string };
      if (!j.stream_token) return null;
      const expiresAt = j.expires_at ? new Date(j.expires_at).getTime() : Date.now() + 5 * 60 * 60 * 1000;
      writeStreamToken(tabStore(), { token: j.stream_token, expiresAt, sub });
      return j.stream_token;
    } catch {
      return null;
    } finally {
      if (inflight === mine) inflight = null;
    }
  })();
  inflight = mine;
  return mine.promise;
}

// Every mounted hook, for a token minted in place of one the server
// refused (renewStreamToken).
const renewed = new Set<(token: string) => void>();

/**
 * Mints a stream token in place of the cached one, which the server
 * refused (a 401 on a stream: its signing key changed, or this device's
 * clock runs behind the server's, so the cache's own expiry never came),
 * and hands it to every mounted hook. The new token, or null when none
 * could be minted.
 */
export async function renewStreamToken(bearer: string): Promise<string | null> {
  forgetStreamToken();
  const token = await mintStreamToken(bearer);
  if (token) renewed.forEach((give) => give(token));
  return token;
}

/**
 * Returns the current stream token, minting one on first call (and
 * after expiry). Returns null while loading or unauthenticated; the
 * caller should fall back gracefully (omit the asset, show a
 * placeholder, etc).
 */
export function useStreamToken(): string | null {
  const auth = useAuth();
  // The account signed in, as its bearer names it: the token is its alone.
  const sub = subjectOf(auth.user?.access_token);
  const [token, setToken] = useState<string | null>(() => readCache(sub)?.token ?? null);

  // Another account than the one the state's token was read for: take that
  // account's cached token, or none, and the mint effect below asks for one.
  useEffect(() => {
    setToken(readCache(sub)?.token ?? null);
  }, [sub]);

  useEffect(() => {
    const give = (t: string) => setToken(t);
    renewed.add(give);
    return () => {
      renewed.delete(give);
    };
  }, []);

  useEffect(() => {
    if (token) return;
    const bearer = auth.user?.access_token;
    if (!bearer) return;
    let cancelled = false;
    mintStreamToken(bearer).then(t => {
      if (!cancelled && t) setToken(t);
    });
    return () => { cancelled = true; };
  }, [auth.user?.access_token, token]);

  // Proactive expiry: schedule a one-shot timer to null the state
  // shortly before the cached entry expires so the mint effect above
  // re-runs. Without this, a tab left open past the 6 h TTL hangs on
  // to a stale token forever — the cache's expiry check only runs on
  // mount. `visibilitychange` covers the suspended-tab case where
  // browser timer throttling could overshoot the expiry while hidden.
  useEffect(() => {
    if (!token) return;
    const cached = readCache(sub);
    if (!cached) {
      // Cache says expired-or-missing but state still holds a string —
      // drop it so the mint effect re-fires.
      setToken(null);
      return;
    }
    const refreshMs = cached.expiresAt - Date.now() - 60_000;
    const timer = window.setTimeout(() => setToken(null), Math.max(0, refreshMs));
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      if (!readCache(sub)) setToken(null);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [token, sub]);

  return token;
}
