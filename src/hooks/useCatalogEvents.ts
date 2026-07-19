import { useEffect, useRef, useState } from 'react';
import { useAuth } from 'react-oidc-context';

// Live catalog refresh. chino-api tails the pipeline's Kafka topics and pushes
// thin catalog.updated notifications over SSE (/api/v1/events); this hook
// bridges them to the app's existing window-event refresh pattern (like
// chino:lists-changed): bursts are debounced into a single 'chino:catalog-
// updated' dispatch, and data hooks refetch by bumping a generation counter.
//
// Implemented over fetch-streaming (EventSource can't send the bearer header).
// Reconnects with backoff; a successful reconnect also dispatches once, since
// events may have been missed while disconnected.

export const CATALOG_UPDATED = 'chino:catalog-updated';
const DEBOUNCE_MS = 1500;

/** Mount once (AuthGate). Connects the SSE bridge and dispatches CATALOG_UPDATED. */
export function useCatalogEvents() {
  const auth = useAuth();
  const token = auth.user?.access_token;

  useEffect(() => {
    if (!token) return;
    let stopped = false;
    let attempt = 0;
    let abort = new AbortController();
    let debounce: number | null = null;

    const dispatch = () => {
      if (debounce) window.clearTimeout(debounce);
      debounce = window.setTimeout(
        () => window.dispatchEvent(new Event(CATALOG_UPDATED)),
        DEBOUNCE_MS,
      );
    };

    async function connect() {
      while (!stopped) {
        try {
          abort = new AbortController();
          const res = await fetch('/api/v1/events', {
            headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
            signal: abort.signal,
          });
          if (!res.ok || !res.body) throw new Error(`events ${res.status}`);
          if (attempt > 0) dispatch(); // may have missed events while away
          attempt = 0;
          const reader = res.body.getReader();
          const dec = new TextDecoder();
          let buf = '';
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            let i;
            while ((i = buf.indexOf('\n\n')) >= 0) {
              const frame = buf.slice(0, i);
              buf = buf.slice(i + 2);
              if (frame.split('\n').some((l) => l.startsWith('data: '))) dispatch();
            }
          }
          throw new Error('stream ended');
        } catch {
          if (stopped) return;
          attempt += 1;
          await new Promise((r) => setTimeout(r, Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5))));
        }
      }
    }
    void connect();
    return () => {
      stopped = true;
      abort.abort();
      if (debounce) window.clearTimeout(debounce);
    };
  }, [token]);
}

/**
 * useCatalogGen returns a counter that bumps on every CATALOG_UPDATED dispatch
 * (and on tab refocus — cheap staleness cover). Data hooks add it to their
 * fetch-effect deps to refetch when the catalog changes.
 */
export function useCatalogGen(): number {
  const [gen, setGen] = useState(0);
  const last = useRef(0);
  useEffect(() => {
    const bump = () => setGen((g) => g + 1);
    const onVisible = () => {
      // refetch at most once per minute on refocus
      if (document.visibilityState === 'visible' && Date.now() - last.current > 60_000) {
        last.current = Date.now();
        bump();
      }
    };
    window.addEventListener(CATALOG_UPDATED, bump);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener(CATALOG_UPDATED, bump);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return gen;
}
