// Caches the DWG engine, app code and sample so the viewer works offline after the first visit.
const CACHE = 'kodifly-viewer-v1';
const CACHED = /^\/(wasm|samples|_next\/static)\//;

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  if (CACHED.test(url.pathname)) {
    // These files never change under the same address (hashed names, pinned engine build).
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(event.request);
        if (hit) return hit;
        const response = await fetch(event.request);
        if (response.ok) cache.put(event.request, response.clone());
        return response;
      }),
    );
  } else if (event.request.mode === 'navigate') {
    // Pages: fresh when online, last seen copy when offline.
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request).then((hit) => hit ?? Response.error())),
    );
  }
});
