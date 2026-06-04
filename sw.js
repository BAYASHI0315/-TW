// Equipment Manager Lite v20.2 Service Worker
// GitHub Pages更新後に古いJS/Firebase設定を掴みにくくするため、JS/CSS/HTMLは network-first にしています。
const CACHE_NAME = 'equipment-manager-lite-v20-2-cache';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './src/app.js',
  './src/data.js',
  './src/cloud-sync.js',
  './src/firebase-config.js',
  './manifest.webmanifest',
  './icons/icon-192.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .catch(() => null)
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const isAppCode = /\.(html|js|css|webmanifest)$/.test(url.pathname) || url.pathname.endsWith('/');

  if (isAppCode) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => null);
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => null);
      return response;
    }).catch(() => cached))
  );
});
