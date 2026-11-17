const CACHE_NAME = 'nextx-room-pwa-v3';
const ASSETS = [
  './',
  './index.html',
  './css/mobile.css',
  './js/pwa_app.js',
  './Logo1.png',
  './icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = e.request.url;
  if (url.includes('.m3u8') || url.includes('.ts') || url.includes('themoviedb.org')) return;
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
