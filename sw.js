const CACHEA = "gure-etxea-v3";
const FITXATEGIAK = [
  "./",
  "./index.html",
  "./estiloa.css",
  "./aplikazioa.js",
  "./google-konfigurazioa.js",
  "./manifest.webmanifest",
  "./ikonoa.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHEA).then((cache) => cache.addAll(FITXATEGIAK))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((gakoak) =>
      Promise.all(
        gakoak
          .filter((gakoa) => gakoa !== CACHEA)
          .map((gakoa) => caches.delete(gakoa))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((erantzuna) => {
      if (erantzuna) return erantzuna;

      return fetch(event.request).then((sarekoErantzuna) => {
        if (!sarekoErantzuna || sarekoErantzuna.status !== 200) {
          return sarekoErantzuna;
        }

        const kopia = sarekoErantzuna.clone();
        caches.open(CACHEA).then((cache) => cache.put(event.request, kopia));
        return sarekoErantzuna;
      });
    })
  );
});
