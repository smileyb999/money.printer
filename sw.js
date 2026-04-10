// ═══════════════════════════════════════════════════════════════
//  MONEY.PRINTER — Service Worker
//  Strategy: Cache-first for app shell, network-first for fonts
//  Bump CACHE_VERSION any time you redeploy to force a refresh
// ═══════════════════════════════════════════════════════════════

const CACHE_VERSION = 'mp-v1';
const CACHE_NAME    = `money-printer-${CACHE_VERSION}`;

// Files to pre-cache on install (the entire app shell)
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json'
];

// ── INSTALL: pre-cache app shell ───────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())   // activate immediately
  );
});

// ── ACTIVATE: delete old caches ────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('money-printer-') && k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())   // take control without reload
  );
});

// ── FETCH: serve from cache, fall back to network ──────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and Firebase/Firestore API calls (let those go straight to network)
  if (request.method !== 'GET') return;
  if (url.hostname.includes('firestore.googleapis.com')) return;
  if (url.hostname.includes('firebase.google.com'))      return;
  if (url.hostname.includes('identitytoolkit'))          return;

  // Google Fonts — network-first with cache fallback
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // App shell — cache-first (works fully offline)
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        // Only cache successful same-origin responses
        if (response.ok && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, clone));
        }
        return response;
      }).catch(() => {
        // Offline and not cached — return the main app for navigation requests
        if (request.mode === 'navigate') return caches.match('./index.html');
      });
    })
  );
});
