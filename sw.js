/* 甜饼工坊 Service Worker */
const CACHE_NAME = 'cookie-workshop-v4.2';
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
  const url = request.url;
  
  // 直接放行 Firebase / Google APIs：避免 SW 干扰认证、Firestore 实时通道和 SDK 资源
  if (
    url.indexOf('firebase') !== -1
    || url.indexOf('googleapis.com') !== -1
    || url.indexOf('gstatic.com/firebasejs') !== -1
  ) {
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
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME)
            .then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
