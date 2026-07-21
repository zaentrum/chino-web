import { useEffect, useState } from 'react';
import { useAuth } from 'react-oidc-context';

// Extension is one addon-contributed UI element for a named slot, served by
// chino-api's /api/v1/extensions (which forwards to portal-api's registry). A
// no-addon instance returns [], so slots render nothing.
export interface Extension {
  key: string;
  addon: string;
  slot: string;
  kind: string; // link | action
  label: string;
  icon: string;
  url: string;
  method: string;
  statusUrl: string;
  ord: number;
  enabled: boolean;
}

/**
 * useExtensions fetches the addon contributions for a slot (e.g. 'search.empty').
 * Best-effort: any error yields an empty list, so a core-only install shows no
 * extra UI. Returns the extensions ordered by the server (ord, then key).
 */
export function useExtensions(slot: string): Extension[] {
  const auth = useAuth();
  const [exts, setExts] = useState<Extension[]>([]);

  useEffect(() => {
    if (auth.isLoading || !auth.isAuthenticated || !slot) {
      return;
    }
    const ctrl = new AbortController();
    fetch(`/api/v1/extensions?slot=${encodeURIComponent(slot)}`, {
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${auth.user?.access_token ?? ''}` },
    })
      .then((r) => (r.ok ? (r.json() as Promise<Extension[]>) : []))
      .then((list) => setExts(Array.isArray(list) ? list : []))
      .catch(() => {
        /* best-effort — no extensions on error */
      });
    return () => ctrl.abort();
  }, [slot, auth.isLoading, auth.isAuthenticated, auth.user?.access_token]);

  return exts;
}
