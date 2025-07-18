const CACHE_NAME = 'ai-video-narrator-v2';
const APP_SHELL_URLS = [
  './',
  './index.html',
  './index.css',
  './index.tsx', // Menambahkan file TSX utama ke cache
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

self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});


self.addEventListener('fetch', (event) => {
  // Hanya proses permintaan GET
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Coba dapatkan dari cache terlebih dahulu
      const cachedResponse = await cache.match(event.request);
      
      // Ambil dari jaringan secara paralel untuk memperbarui cache (stale-while-revalidate)
      const fetchPromise = fetch(event.request).then(networkResponse => {
        // Periksa apakah respons valid sebelum di-cache
        if (networkResponse && networkResponse.ok) {
           const responseToCache = networkResponse.clone();
           cache.put(event.request, responseToCache);
        }
        return networkResponse;
      }).catch(error => {
        console.error('Fetching from network failed:', error);
        // Jika pengambilan gagal (misalnya, offline) dan tidak ada di cache, lempar error
        if (!cachedResponse) {
          throw error;
        }
      });

      // Kembalikan dari cache jika ada, jika tidak tunggu dari jaringan
      return cachedResponse || fetchPromise;
    })
  );
});
