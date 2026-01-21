/* 甜饼工坊 Service Worker */
const CACHE_NAME = 'cookie-workshop-v3.4';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './companies_tse.json'
];

// Install event - cache assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  // 直接放行 JSONBin：避免 SW 影响跨域 POST/PUT，防止部分环境出现 TypeError
  if (request.url.indexOf('api.jsonbin.io') !== -1) {
    event.respondWith(fetch(request));
    return;
  }
  
  // Skip non-GET requests
  if (request.method !== 'GET') return;
  
  // Skip external requests (like Chart.js CDN)
  if (!request.url.startsWith(self.location.origin)) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }
  
  event.respondWith(
    caches.match(request)
      .then((cached) => {
        // Return cached version or fetch from network
        const fetchPromise = fetch(request)
          .then((response) => {
            // Cache the new response
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME)
                .then((cache) => cache.put(request, clone));
            }
            return response;
          })
          .catch(() => cached);
        
        return cached || fetchPromise;
      })
  );
});
