const CACHE_NAME = 'yb-love-v14-purge-ticket';
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

  // 【核心根治】实况动图视频 (.mov/.mp4/.webm) 与 HTTP Range 字节流绝不走 Service Worker 缓存！
  // 彻底杜绝因 Service Worker 缺乏 206 Partial Content 切片支持导致的解码管道重置、抽搐与变灰崩溃
  const isVideoOrRange = url.pathname.match(/\.(mov|mp4|webm|m4v)$/i) ||
                         e.request.headers.get('range');
  if (isVideoOrRange) {
    return; // Pass through directly to native browser HTTP streaming pipeline
  }

  // Cache-First for pure static assets (scripts, stylesheets, fonts, static photos)
  const isStaticAsset = url.pathname.match(/\.(jpg|jpeg|png|svg|webp|gif|mp3|woff2|ttf|js|css)$/i) ||
                        url.pathname.includes('/images/') ||
                        url.pathname.includes('/audio/') ||
                        url.hostname.includes('npmmirror.com') ||
                        url.hostname.includes('tailwindcss.com') ||
                        url.hostname.includes('font.im') ||
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
