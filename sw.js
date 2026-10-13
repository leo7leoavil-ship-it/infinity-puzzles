/**
 * Service Worker for Offline-First PWA Functionality
 */
const CACHE_NAME = 'infinity-puzzles-cache-v1';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './assets/icon.svg',
  './css/main.css',
  './css/games.css',
  './css/animations.css',
  './js/app.js',
  './js/audio.js',
  './js/storage.js',
  './js/haptics.js',
  './js/prng.js',
  './js/confetti.js',
  './js/games/tap-away.js',
  './js/games/kruskal-pipes.js',
  './js/games/lights-out.js',
  './js/games/sliding-block.js',
  './js/games/flow-free.js',
  './js/games/sokoban.js',
  './js/games/bridges.js',
  './js/games/pattern-fold.js',
  './js/games/sliding-tile.js',
  './js/games/laser-mirrors.js',
  './js/games/tetriz.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Stale-while-revalidate or Cache-first strategy for app shell
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        // Cache external assets such as Google Fonts if successful
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          (event.request.url.startsWith('http') || event.request.url.startsWith('https'))
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Offline fallback if index page requested
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
