// Versi dinaikkan menjadi v2 agar browser mau memperbarui cache-nya
const CACHE_NAME = 'kas-stok-v2';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './offline.html' // <--- File offline.html ditambahkan ke memori
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      // Jika request gagal (karena offline), maka fallback otomatis ke offline.html
      return response || fetch(event.request).catch(() => {
        if (event.request.mode === 'navigate' || (event.request.method === 'GET' && event.request.headers.get('accept').includes('text/html'))) {
          return caches.match('./offline.html');
        }
      });
    })
  );
});