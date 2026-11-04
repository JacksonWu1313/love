const CACHE_NAME = 'yb-love-v12-universal-fix';
const ASSETS_TO_CACHE = [
  './',
  './manifest.json',
  './images/icon.svg',
  './images/hero_cover.jpg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // 容错缓存，单个文件失败不阻断整体安装
      return Promise.allSettled(
        ASSETS_TO_CACHE.map(url => cache.add(url).catch(() => {}))
      );
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

  // 绝不拦截 API 接口与实时同步请求
  if (url.pathname.includes('/__api__/') || url.pathname.includes('/data/') || url.hostname.includes('api.github.com')) {
    return;
  }

  // 针对静态图片和媒体走 Stale-While-Revalidate，且严格返回合法 Response（绝对禁止返回 null）
  const isMedia = url.pathname.match(/\.(jpg|jpeg|png|svg|webp|gif|mp3|mov|mp4)$/i) || url.pathname.includes('/images/');

  if (isMedia) {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        const fetchPromise = fetch(e.request).then((networkResp) => {
          if (networkResp && networkResp.status === 200) {
            const clone = networkResp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          }
          return networkResp;
        }).catch(() => null);

        if (cached) return cached;
        return fetchPromise.then((res) => {
          if (res) return res;
          // Safari 严苛保护：兜底返回 404 Response，绝对不能 resolve(null)
          return new Response('', { status: 404, statusText: 'Not Found in Cache or Network' });
        });
      })
    );
    return;
  }

  // 其他资源（HTML/JS/CSS）优先走原生网络，若离线才降级到缓存
  e.respondWith(
    fetch(e.request).then((networkResp) => {
      if (networkResp && networkResp.status === 200) {
        const clone = networkResp.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
      }
      return networkResp;
    }).catch(async () => {
      const cached = await caches.match(e.request);
      if (cached) return cached;
      return new Response('', { status: 504, statusText: 'Gateway Timeout' });
    })
  );
});
