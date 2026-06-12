const CACHE_NAME = 'ms-coaching-reel-experiment-v1';
const ASSETS = [
  './','./index.html','./styles.css','./app.js','./config.js','./manifest.json',
  './OneSignalSDKWorker.js','./OneSignalSDKUpdaterWorker.js','./assets/ms-logo.png','./assets/icon-96.png','./assets/icon-180.png','./assets/icon-192.png','./assets/icon-512.png','./assets/favicon-32.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const isAppFile = url.pathname.endsWith('/app.js') || url.pathname.endsWith('/config.js') || url.pathname.endsWith('/styles.css') || url.pathname.endsWith('/index.html');
  if (isAppFile) {
    e.respondWith(fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request).then(cached => cached || fetch(e.request).catch(() => caches.match('./index.html'))));
});
