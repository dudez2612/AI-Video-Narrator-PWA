const CACHE_NAME = 'ai-video-narrator-v1';
const APP_SHELL_URLS = [
  './',
  './index.html',
  './index.css',
  './manifest.json',
  './icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache and caching app shell');
        return cache.addAll(APP_SHELL_URLS);
      })
  );
});

self.addEventListener('fetch', (event) => {
  // Hanya cache permintaan GET
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Coba dapatkan dari cache terlebih dahulu
      const cachedResponse = await cache.match(event.request);
      if (cachedResponse) {
        return cachedResponse;
      }

      // Jika tidak ada di cache, ambil dari jaringan
      try {
        const networkResponse = await fetch(event.request);
        
        // Periksa apakah respons valid sebelum di-cache
        if (networkResponse && networkResponse.ok) {
           const responseToCache = networkResponse.clone();
           await cache.put(event.request, responseToCache);
        }
        
        return networkResponse;
      } catch (error) {
        console.error('Fetching from network failed:', error);
        // Jika pengambilan gagal (misalnya, offline), kita bisa kembalikan halaman offline kustom di sini jika ada.
        throw error;
      }
    })
  );
});