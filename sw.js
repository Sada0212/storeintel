/**
 * StoreIntel Service Worker
 * Version: v60
 * Date:    2026-07-28
 * Change:  CACHE_NAME bumped storeintel-v55 → storeintel-v60 (forces old
 *          cached files, including the broken app.js/renderer, to be
 *          discarded on next load).
 *          FILES_TO_CACHE corrected — it was still listing
 *          'renderer_opp_v1.0.js' and 'app_opp_v55.js', which do not match
 *          the files actually referenced in index.html
 *          ('renderer_opp_pwa_v1.3.js' and 'app_opp_v56.js'). This mismatch
 *          meant the service worker was never caching the right files for
 *          offline use — now fixed to match index.html exactly.
 */
const CACHE_NAME = 'storeintel-v60';
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
  // Opportunity Report engine (v60 — corrected filenames)
  '/engine/ingestion_opp_v1.1.js',
  '/engine/analysis_opp_v1.1.js',
  '/engine/renderer_opp_pwa_v1.3.js',
  '/engine/app_opp_v56.js',
  // Icons
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];
// ── Install: cache all files ──────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW v60] Caching app shell and Opp engine files');
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
            console.log('[SW v60] Deleting old cache:', name);
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
