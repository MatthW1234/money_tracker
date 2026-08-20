// Pocket Ledger — service worker
// The app shell (index.html, manifest.json, icon.svg) is fetched network-first,
// so pushing an update to your repo shows up the next time you open the app
// while you're online — the cache is only a fallback for when you're offline.
// The vendor libraries (Chart.js, PapaParse) are now shipped locally rather
// than pulled from a CDN, so they're just ordinary same-origin files — cached
// first for speed and only re-checked in the background.
// Your data itself is not cached here — that's handled by the app's own storage.

const CACHE = 'pocket-ledger-v37';
const APP_SHELL = ['./', './index.html', './manifest.json', './icon.svg'];
const VENDOR = [
  './vendor/chart.umd.min.js',
  './vendor/papaparse.min.js',
  './css/app.css',
  './js/money.js',
  './js/backup.js',
  './js/review.js',
  './js/period-close.js',
  './js/preferences.js',
  './js/anomalies.js',
  './js/linked-events.js',
  './js/rules.js',
  './js/storage.js',
  './js/model.js',
  './js/investments.js',
  './js/trading212.js',
  './js/import.js',
  './js/reports.js',
  './js/ui.js',
  './js/diagnostics.js',
  './js/transfers.js',
  './js/reconciliation.js',
  './js/app.js',
  './js/device.js',
  './js/recurring.js',
  './js/recurring-match.js',
  './js/views/net-worth.js',
  './js/views/accounts.js',
  './js/views/dashboard.js',
  './js/views/reconcile.js',
  './js/views/health.js',
  './js/views/review.js',
  './js/views/transactions.js',
  './js/views/plan.js',
  './js/views/investments.js',
  './js/views/insights.js',
  './js/views/categories.js',
  './js/views/import.js',
  './js/views/settings.js',
  './js/start.js',
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
