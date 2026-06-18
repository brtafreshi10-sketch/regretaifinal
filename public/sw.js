self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open("regret-gpt-cache-v1").then((cache) => {
      return cache.addAll([
        "/",
        "/manifest.json",
        "/favicon-192x192.png",
        "/favicon-512x512.png",
        "/apple-touch-icon.png",
      ]);
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== "regret-gpt-cache-v1")
          .map((key) => caches.delete(key))
      );
    })
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type !== "basic") {
          return response;
        }
        const responseClone = response.clone();
        caches.open("regret-gpt-cache-v1").then((cache) => {
          cache.put(event.request, responseClone);
        });
        return response;
      });
    })
  );
});
