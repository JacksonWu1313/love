const CACHE_NAME = 'yb-love-v9-instant-media';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './images/icon.svg',
  './images/hero_cover.jpg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // Cache-First for images, audio, and CDN assets
  const isImageOrMedia = url.pathname.match(/\.(jpg|jpeg|png|svg|webp|gif|mp3|woff2|ttf)$/i) ||
                         url.pathname.includes('/images/') ||
                         url.pathname.includes('/audio/') ||
                         url.hostname.includes('jsdelivr.net') ||
                         url.hostname.includes('statically.io');

  if (isImageOrMedia) {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        if (cached) return cached;
        return fetch(e.request).then((networkResp) => {
          if (networkResp && networkResp.status === 200) {
            const clone = networkResp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          }
          return networkResp;
        });
      })
    );
    return;
  }

  // Network-First for HTML & JSON data
  e.respondWith(
    fetch(e.request).then((networkResp) => {
      if (networkResp && networkResp.status === 200) {
        const clone = networkResp.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
      }
      return networkResp;
    }).catch(() => caches.match(e.request))
  );
});
