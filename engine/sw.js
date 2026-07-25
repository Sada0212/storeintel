/**
 * StoreIntel Service Worker
 * Version: v55
 * Date:    2026-07-07
 * Change:  Opportunity Report engine files added to cache.
 *          CACHE_NAME bumped from storeintel-v54 → storeintel-v55.
 *          On next online open, old cache is deleted and v55 is installed.
 */

const CACHE_NAME = 'storeintel-v55';

const FILES_TO_CACHE = [
  '/',
  '/index.html',
  '/app.js',
  '/style.css',
  '/manifest.json',
  '/libs/xlsx.full.min.js',
  // POS engine (existing)
  '/engine/ingestion.js',
  '/engine/analysis.js',
  '/engine/renderer.js',
  '/engine/date_filter.js',
  // Opportunity Report engine (new v55)
  '/engine/ingestion_opp_v1.1.js',
  '/engine/analysis_opp_v1.1.js',
  '/engine/renderer_opp_v1.0.js',
  '/engine/app_opp_v55.js',
  // Icons
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// ── Install: cache all files ──────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW v55] Caching app shell and Opp engine files');
      return cache.addAll(FILES_TO_CACHE);
    })
  );
  // Take control immediately — don't wait for old SW to die
  self.skipWaiting();
});

// ── Activate: delete old caches ───────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[SW v55] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  // Take control of all open clients
  self.clients.claim();
});

// ── Fetch: cache-first, network fallback ─────────────────────────
self.addEventListener('fetch', event => {
  // Only handle same-origin GET requests
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        // Cache valid responses
        if (response && response.status === 200 && response.type === 'basic') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      }).catch(() => {
        // Offline fallback: return index.html for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
