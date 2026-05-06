const CACHE_NAME = 'cleo-v4';

// On install, skip waiting so new SW activates immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// On activate, delete old caches and claim all clients
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

  // API calls: network only, fall back to a mock success response offline
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

  // Everything else: NETWORK FIRST so updates are always picked up,
  // fall back to cache only when truly offline
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse.ok && request.method === 'GET') {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      })
      .catch(() =>
        caches.match(request).then(
          (cached) =>
            cached ||
            new Response('<h2>You are offline</h2>', {
              headers: { 'Content-Type': 'text/html' },
            })
        )
      )
  );
});
