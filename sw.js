var CACHE_NAME = 'artisano-v1';
var STATIC_ASSETS = [
  '/',
  '/index.html',
  '/recherche.html',
  '/connexion.html',
  '/inscription.html',
  '/inscription-client.html',
  '/artisano-common.css',
  '/artisano-common.js',
  '/supabase-config.js'
];

// Install — cache static assets
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(STATIC_ASSETS);
    })
  );
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
  // Skip non-GET requests and Supabase API calls
  if (event.request.method !== 'GET') return;
  var url = new URL(event.request.url);
  if (url.hostname.includes('supabase')) return;
  if (url.hostname.includes('googleapis.com')) return;

  event.respondWith(
    fetch(event.request).then(function(response) {
      // Cache successful responses
      if (response.status === 200) {
        var responseClone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, responseClone);
        });
      }
      return response;
    }).catch(function() {
      // Offline — serve from cache
      return caches.match(event.request).then(function(cachedResponse) {
        return cachedResponse || new Response('Vous êtes hors-ligne. Veuillez vérifier votre connexion.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      });
    })
  );
});
