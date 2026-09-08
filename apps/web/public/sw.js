// Minimal app-shell service worker. Enables "Add to Home Screen" / install prompts on
// Chromium-based browsers (which require a manifest + a fetch-handling service worker)
// and gives the installed app a best-effort offline shell once pages have been visited
// once. This is NOT a full offline-first precache — the first visit to any page still
// needs a network connection; after that, a stale-while-revalidate strategy serves the
// last-cached response instantly while refreshing it in the background.
//
// Deliberately never intercepts: the signaling WebSocket (cross-origin, not a fetch
// anyway), non-GET requests, cross-origin requests (fonts, TURN, etc.), or the signaling
// server's REST session endpoints — a transfer's live session state must never be served
// from a stale cache.
const CACHE_NAME = "filezilla-shell-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/session")) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      const networkFetch = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached ?? networkFetch;
    }),
  );
});
