const CACHE_NAME = "seasonal-diary-app-__BUILD_VERSION__";
const BUILD_ASSETS = /* __BUILD_ASSETS__ */ [];
const APP_BASE = new URL(self.registration.scope).pathname;
const INDEX_URL = `${APP_BASE}index.html`;
const APP_SHELL = [
  APP_BASE,
  INDEX_URL,
  `${APP_BASE}manifest.webmanifest`,
  ...BUILD_ASSETS,
  `${APP_BASE}icons/icon-192.png`,
  `${APP_BASE}icons/icon-512.png`,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL)),
  );
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
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    const update = fetch(request).then((response) => {
      if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(INDEX_URL, response.clone()));
      return response;
    });
    event.waitUntil(update.then(() => undefined).catch(() => undefined));
    event.respondWith(caches.match(INDEX_URL).then((cached) => cached || update));
    return;
  }

  const update = fetch(request).then((response) => {
    if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
    return response;
  });
  event.waitUntil(update.then(() => undefined).catch(() => undefined));
  event.respondWith(caches.match(request).then((cached) => cached || update));
});
