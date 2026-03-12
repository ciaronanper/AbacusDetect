const CACHE_NAME = 'cleo-v2';

// On install, skip waiting so new SW activates immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// On activate, delete old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API calls: network first, fall back to a mock success response so the
  // app continues working offline (pure mock — no real data is persisted)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(
          JSON.stringify({ id: Date.now(), ok: true }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );
    return;
  }

  // Everything else: cache first, then network; cache each successful response
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;

      try {
        const networkResponse = await fetch(request);
        // Cache successful GET responses (not opaque cross-origin)
        if (
          networkResponse.ok &&
          request.method === 'GET' &&
          !url.pathname.startsWith('/api/')
        ) {
          cache.put(request, networkResponse.clone());
        }
        return networkResponse;
      } catch {
        // If offline and nothing cached, return a minimal offline page
        return new Response('<h2>You are offline</h2>', {
          headers: { 'Content-Type': 'text/html' },
        });
      }
    })
  );
});
