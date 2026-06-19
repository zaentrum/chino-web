import { useEffect, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import type { KatalogItem } from './useItems';
import { useStreamToken } from './useStreamToken';

/**
 * People search + filmography, served by katalog-api:
 *   GET /api/v1/people?q=&limit=    → { people: [...], total }
 *   GET /api/v1/people/{id}?limit=  → { id, name, items: [...] }
 *
 * Mirrors the useItems fetch/auth pattern (OIDC bearer header, abortable
 * effect, stream-token rewrite of artwork URLs) so the People surfaces
 * behave the same as the title grids w.r.t. silent renewals and the
 * artwork proxy.
 */

export interface PersonSummary {
  id: string;
  name: string;
  // Number of titles this person is credited on — rendered as "· N titles".
  credits: number;
}

interface PeopleResponse {
  people: PersonSummary[];
  total: number;
}

/**
 * Search people by name. Accent/case-insensitive on the server — the
 * client passes the raw query straight through and renders the server
 * order as-is (no client-side re-ranking).
 */
export function usePeople(q?: string, limit = 12) {
  const auth = useAuth();
  const [data, setData] = useState<PeopleResponse | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (auth.isLoading || !auth.isAuthenticated) return;
    // No query → no people. Clear any previous results so a cleared
    // search box doesn't leave a stale "Cast & crew" section behind.
    if (!q) {
      setData(null);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    const params = new URLSearchParams();
    params.set('q', q);
    if (limit) params.set('limit', String(limit));
    setLoading(true);
    fetch(`/api/v1/people?${params}`, {
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${auth.user?.access_token ?? ''}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`chino-api ${r.status}`);
        return r.json() as Promise<PeopleResponse>;
      })
      .then((j) => setData(j))
      .catch((e) => {
        if ((e as Error).name !== 'AbortError') setError(e as Error);
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [q, limit, auth.isAuthenticated, auth.isLoading]);

  return { data, error, loading };
}

export interface PersonDetail {
  id: string;
  name: string;
  items: KatalogItem[];
}

/**
 * Fetch a single person's filmography. Returns null (and notFound=true)
 * on a 404 so the PersonPage can render a "not found" state rather than
 * spin forever. Rewrites artwork URLs with the long-lived stream token,
 * matching useItem / useItems.
 */
export function usePerson(personId: string | undefined, limit = 100) {
  const auth = useAuth();
  const streamToken = useStreamToken();
  const [data, setData] = useState<PersonDetail | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!personId || auth.isLoading || !auth.isAuthenticated) return;
    const ctrl = new AbortController();
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    setLoading(true);
    setNotFound(false);
    fetch(`/api/v1/people/${personId}${params.toString() ? `?${params}` : ''}`, {
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${auth.user?.access_token ?? ''}` },
    })
      .then((r) => {
        if (r.status === 404) {
          setNotFound(true);
          return null;
        }
        if (!r.ok) throw new Error(`chino-api ${r.status}`);
        return r.json() as Promise<PersonDetail>;
      })
      .then((j) => {
        if (!j) {
          setData(null);
          return;
        }
        // Long-lived stream token in artwork URLs so silent renews don't
        // refetch every poster in the filmography grid.
        const enc = streamToken ? encodeURIComponent(streamToken) : '';
        setData({
          ...j,
          items: (j.items ?? []).map((it) => ({
            ...it,
            poster_url: it.poster_url && enc ? `${it.poster_url}?stream=${enc}` : it.poster_url,
            backdrop_url: it.backdrop_url && enc ? `${it.backdrop_url}?stream=${enc}` : it.backdrop_url,
          })),
        });
      })
      .catch((e) => {
        if ((e as Error).name !== 'AbortError') setError(e as Error);
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personId, limit, auth.isAuthenticated, auth.isLoading, streamToken]);

  return { data, error, notFound, loading };
}
