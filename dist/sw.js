const CACHE_NAME = 'yb-love-v36-canvas-live-dblclick';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './images/icon.svg',
  './images/uploads/slot_1793090427258_811.jpeg?v=4'
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

  // 【核心根治】所有 HTTP Range 请求与原生 <video> 媒体流绝不走 Service Worker 缓存，直接透传网络
  // 彻底杜绝因 Service Worker 缺乏 206 Partial Content 切片支持导致的 Safari/Edge 解码管道重置、抽搐与变灰崩溃
  if (e.request.headers.get('range') || e.request.destination === 'video') {
    return; // Pass through directly to native browser HTTP streaming pipeline
  }

  // Track 1 全量高优先级预热请求 (x-live-prewarm: 1，非 Range 的 200 OK full-file fetch)
  // 按规范化 e.request.url 缓存并命中 200 OK 完整响应
  if (e.request.headers.get('x-live-prewarm') === '1') {
    e.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(e.request.url).then((cached) => {
          if (cached && cached.status === 200) return cached;
          return fetch(e.request).then((networkResp) => {
            if (networkResp && networkResp.status === 200) {
              cache.put(e.request.url, networkResp.clone());
            }
            return networkResp;
          });
        });
      })
    );
    return;
  }

  if (url.pathname.match(/\.(mov|mp4|webm|m4v)$/i)) {
    return; // Pass through directly to native browser HTTP streaming pipeline
  }

  // Cache-First for pure static assets (scripts, stylesheets, fonts, static photos)
  const isStaticAsset = url.pathname.match(/\.(jpg|jpeg|png|svg|webp|gif|mp3|woff2|ttf|js|css)$/i) ||
                        url.pathname.includes('/images/') ||
                        url.pathname.includes('/audio/') ||
                        url.hostname.includes('npmmirror.com') ||
                        url.hostname.includes('tailwindcss.com') ||
                                                url.hostname.includes('jsdelivr.net') ||
                        url.hostname.includes('statically.io');

  if (isStaticAsset) {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        if (cached) return cached;
        return fetch(e.request).then((networkResp) => {
          if (networkResp && networkResp.status === 200) {
            const clone = networkResp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          }
          return networkResp;
        }).catch(() => null);
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
