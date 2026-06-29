/* StoreIntel Service Worker v1.0
   Caches everything on first load. App runs 100% offline after. */

const CACHE_NAME = 'storeintel-v26';

// All files to cache on install
const BASE = '/storeintel';
const PRECACHE_URLS = [
  BASE + '/',
  BASE + '/index.html',
  BASE + '/app.js',
  BASE + '/style.css',
  BASE + '/manifest.json',
  BASE + '/icons/icon-256.png',
  BASE + '/icons/icon-192.png',
  BASE + '/icons/icon-512.png',
  BASE + '/engine/ingestion.js',
  BASE + '/engine/analysis.js',
  BASE + '/engine/renderer.js',
  BASE + '/libs/xlsx.full.min.js',
];

// ── INSTALL: pre-cache all app files ─────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // Cache what we can, skip missing files silently during dev
        return Promise.allSettled(
          PRECACHE_URLS.map(url =>
            cache.add(url).catch(err => {
              console.warn(`[SW] Could not cache ${url}:`, err.message);
            })
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: remove old caches ───────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log(`[SW] Removing old cache: ${key}`);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: serve from cache, fall back to network ─────────────────
self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) {
          return cached; // Serve from cache (offline-first)
        }
        // Not in cache — try network, then cache the result
        return fetch(event.request)
          .then(response => {
            if (!response || response.status !== 200 || response.type === 'opaque') {
              return response;
            }
            // Cache new successful responses
            const toCache = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, toCache));
            return response;
          })
          .catch(() => {
            // Network failed and not in cache — show offline page if navigating
            if (event.request.mode === 'navigate') {
              return caches.match('/index.html');
            }
          });
      })
  );
});

// ── MESSAGE: force update from app ────────────────────────────────
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
