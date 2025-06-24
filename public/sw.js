// Service Worker Version
const SW_VERSION = '1.0.0';

// Cache names
const CACHE_NAME = 'dutch-trails-attendance-v1';
const STATIC_CACHE_NAME = `static-cache-${SW_VERSION}`;
const DYNAMIC_CACHE_NAME = `dynamic-cache-${SW_VERSION}`;

// Assets to cache
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/Logo.png'
];

// Install event
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...', event);
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[Service Worker] Static assets cached');
        return self.skipWaiting();
      })
  );
});

// Activate event
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...', event);
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(cacheName => {
              return cacheName.startsWith('dutch-trails-attendance-') &&
                     cacheName !== STATIC_CACHE_NAME &&
                     cacheName !== DYNAMIC_CACHE_NAME;
            })
            .map(cacheName => {
              console.log('[Service Worker] Removing old cache:', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => {
        console.log('[Service Worker] Claiming clients');
        return self.clients.claim();
      })
  );
});

// Fetch event
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request)
          .then(res => {
            return caches.open(DYNAMIC_CACHE_NAME)
              .then(cache => {
                // Only cache GET requests
                if (event.request.method === 'GET') {
                  cache.put(event.request.url, res.clone());
                }
                return res;
              });
          });
      })
      .catch(() => {
        // Return offline fallback if available
        if (event.request.mode === 'navigate') {
          return caches.match('/');
        }
        return null;
      })
  );
});

// Push event
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push received:', event);
  
  if (!event.data) {
    console.log('[Service Worker] No data payload');
    return;
  }

  try {
    const data = event.data.json();
    console.log('[Service Worker] Push data:', data);

    const options = {
      body: data.body || 'New notification',
      icon: data.icon || '/Logo.png',
      badge: data.badge || '/Logo.png',
      tag: data.tag,
      data: data.data || {},
      requireInteraction: data.requireInteraction || false,
      renotify: data.renotify || false,
      silent: data.silent || false,
      actions: data.actions || []
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'Notification', options)
    );
  } catch (error) {
    console.error('[Service Worker] Error handling push event:', error);
  }
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification clicked:', event);

  event.notification.close();

  const urlToOpen = new URL('/', self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    })
    .then((clientList) => {
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(urlToOpen);
    })
  );
});

// Notification close event
self.addEventListener('notificationclose', (event) => {
  console.log('[Service Worker] Notification closed:', event);
}); 