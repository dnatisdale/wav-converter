const CACHE_NAME = "audio-converter-v2.1.0";

const APP_FILES = [
  "./",
  "./index.html",
  "./offline.html",
  "./manifest.webmanifest",
  "./css/styles.css",
  "./js/app.js",
  "./icons/icon-192.png",
  "./icons/icon-256.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js",
  "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js",
  "https://cdn.jsdelivr.net/npm/libflacjs@5.4.0/dist/libflac.min.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const url of APP_FILES) {
        try {
          await cache.add(url);
        } catch (error) {
          // Skip failed cache entries so one CDN hiccup does not break install.
        }
      }
    }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          return key !== CACHE_NAME ? caches.delete(key) : Promise.resolve();
        }),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(event.request, copy))
            .catch(() => {});
          return response;
        })
        .catch(() => {
          if (event.request.mode === "navigate") {
            return caches.match("./offline.html");
          }
          return undefined;
        });
    }),
  );
});
