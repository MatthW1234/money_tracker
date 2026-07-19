// Pocket Ledger — service worker
// The app shell (index.html, manifest.json, icon.svg) is fetched network-first,
// so pushing an update to your repo shows up the next time you open the app
// while you're online — the cache is only a fallback for when you're offline.
// The CDN libraries (Chart.js, PapaParse) change rarely, so those are cached
// first for speed and only re-checked in the background.
// Your data itself is not cached here — that's handled by the app's own storage.

const CACHE = 'pocket-ledger-v3';
const APP_SHELL = ['./', './index.html', './manifest.json', './icon.svg'];
const VENDOR = [
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.5.0/chart.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.3.0/papaparse.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // Cache each asset independently so one failure (e.g. briefly offline
      // during install) doesn't stop the whole app shell from caching.
      Promise.all([...APP_SHELL, ...VENDOR].map((url) => cache.add(url).catch(() => {})))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const isAppShell = event.request.mode === 'navigate' ||
    (url.origin === self.location.origin && /(\/|index\.html|manifest\.json)$/.test(url.pathname));

  if (isAppShell) {
    // Network-first: always try to get the latest version when online.
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Everything else (vendor libraries, icon): cache-first for speed & offline,
  // refreshing the cache in the background for next time.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && (response.ok || response.type === 'opaque')) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
