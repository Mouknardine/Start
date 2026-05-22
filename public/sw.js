var CACHE_NAME = 'artisano-v3';

// Install — skip waiting
self.addEventListener('install', function(event) {
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.filter(function(name) {
          return name !== CACHE_NAME;
        }).map(function(name) {
          return caches.delete(name);
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch — network first, fallback to cache
self.addEventListener('fetch', function(event) {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  var url = new URL(event.request.url);

  // Skip Supabase API calls, Google Fonts API, and Next.js HMR
  if (url.hostname.includes('supabase')) return;
  if (url.hostname.includes('googleapis.com')) return;
  if (url.hostname.includes('gstatic.com')) return;
  if (url.pathname.startsWith('/_next/webpack-hmr')) return;

  // Skip API routes (données dynamiques, ne JAMAIS cacher)
  if (url.pathname.startsWith('/api/')) return;
  // Skip auth callbacks (one-time tokens)
  if (url.pathname.startsWith('/auth/')) return;
  // Skip Sentry tunnel
  if (url.pathname.startsWith('/monitoring')) return;

  // Assets immuables (hash dans le nom) → CacheFirst (rapide, infiniment cachable)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        if (cached) return cached;
        return fetch(event.request).then(function(response) {
          if (response.status === 200) {
            var clone = response.clone();
            caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, clone); });
          }
          return response;
        });
      })
    );
    return;
  }

  event.respondWith(
    fetch(event.request).then(function(response) {
      // Cache successful responses for same-origin and font requests
      if (response.status === 200 && (url.origin === self.location.origin || url.hostname.includes('gstatic'))) {
        var responseClone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, responseClone);
        });
      }
      return response;
    }).catch(function() {
      // Offline — serve from cache
      return caches.match(event.request).then(function(cachedResponse) {
        if (cachedResponse) return cachedResponse;

        // For navigation requests, show offline page
        if (event.request.mode === 'navigate') {
          return new Response(
            '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hors-ligne | Artisano</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#FAFAF8;color:#1A2744;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px;text-align:center}.c{max-width:400px}.icon{font-size:48px;margin-bottom:16px}h1{font-size:22px;font-weight:800;margin-bottom:8px}p{font-size:14px;color:#8A8680;line-height:1.6}button{margin-top:24px;padding:12px 32px;background:#E8700A;color:white;border:none;border-radius:50px;font-weight:700;font-size:14px;cursor:pointer}</style></head><body><div class="c"><div class="icon">📡</div><h1>Vous etes hors-ligne</h1><p>Verifiez votre connexion internet et reessayez.</p><button onclick="location.reload()">Reessayer</button></div></body></html>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        }

        return new Response('Hors-ligne', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      });
    })
  );
});
