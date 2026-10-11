/* Chino service worker — minimal PWA shell + artwork cache.
 *
 * Design:
 *   - The page itself (a navigation) is asked of the network first, and
 *     the cached one is only what a failed or slow network falls back
 *     to: a release shows on the next load. (Served from the cache and
 *     refreshed behind it, every release showed one load late - on a
 *     home screen app, which is seldom loaded anew, for days.)
 *   - The Vite build emits content-hashed bundles; we don't try to
 *     manually pre-cache them. Instead we use a runtime "stale-while-
 *     revalidate" cache for them (a name never changes its content) + a
 *     long-lived cache for artwork (posters/backdrops) which are
 *     immutable per item id.
 *   - API calls are NOT cached. Auth tokens expire and a stale
 *     /me/continue-watching would mislead the user. Pass through.
 *   - Streaming endpoints (/play, /play/info, /play/subtitles) are
 *     also pass-through — large bodies + range requests we don't
 *     want in the cache.
 *
 * Versioning: bumping CACHE_VERSION invalidates old caches on next
 * activate. Required when this file's shape changes meaningfully.
 */
const CACHE_VERSION = 'chino-v4';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const ART_CACHE = `${CACHE_VERSION}-artwork`;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE));
});

// When the client posts {type:'SKIP_WAITING'}, leave the 'waiting'
// state immediately and become the active SW. The UpdateAvailable
// toast in chino-web triggers this via reg.waiting.postMessage().
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  // Drop caches from previous versions on activation.
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k))
      ).then(() => self.clients.claim())
    )
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Streaming + telemetry + auth — always network, no caching.
  if (url.pathname.startsWith('/api/v1/items/') &&
      (url.pathname.endsWith('/play') ||
       url.pathname.includes('/play/') ||
       url.pathname.includes('/subtitles'))) {
    return; // default: pass through
  }
  if (url.pathname.startsWith('/api/v1/play/events') ||
      url.pathname.startsWith('/api/v1/me/') ||
      url.pathname.startsWith('/api/v1/play/events')) {
    return;
  }

  // Artwork — cache-first, long-lived. Item posters/backdrops are
  // tied to immutable item ids; on update the id changes.
  if (url.pathname.startsWith('/api/v1/items/') &&
      (url.pathname.includes('/poster') || url.pathname.includes('/backdrop'))) {
    event.respondWith(cacheFirst(req, ART_CACHE));
    return;
  }

  // The page: the network's, so it names the release's bundles; the
  // cached one where the network fails or keeps the person waiting.
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(networkFirst(req, SHELL_CACHE, NAVIGATION_WAIT_MS));
    return;
  }

  // Hashed assets — stale-while-revalidate: a name's content never
  // changes, so the cached one is the one, at once.
  if (req.destination === 'script' ||
      req.destination === 'style' ||
      req.destination === 'font') {
    event.respondWith(staleWhileRevalidate(req, SHELL_CACHE));
    return;
  }
});

// How long a navigation waits for the network before the cached page
// answers it (a flaky connection); the network's answer still refreshes
// the cache behind it.
const NAVIGATION_WAIT_MS = 4000;

async function networkFirst(req, cacheName, waitMs) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const fromNetwork = fetch(req).then((res) => {
    if (res.ok) {
      cache.put(req, res.clone());
      return res;
    }
    // An answer that is not the page (a gateway's 502 during a rollout):
    // the cached page, where there is one.
    return cached || res;
  });
  if (!cached) return fromNetwork;
  let timer;
  const late = new Promise((resolve) => { timer = setTimeout(() => resolve(cached), waitMs); });
  try {
    return await Promise.race([fromNetwork, late]);
  } catch (e) {
    return cached;
  } finally {
    clearTimeout(timer);
    fromNetwork.catch(() => undefined);
  }
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    return cached || new Response('', { status: 504 });
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => cached);
  return cached || fetchPromise;
}
