import { precacheAndRoute } from 'workbox-precaching';

declare let self: ServiceWorkerGlobalScope;

// This will be replaced by the list of files to precache
self.__WB_MANIFEST;

precacheAndRoute(self.__WB_MANIFEST);

const CACHE_NAME = 'attendance-app-v1';

// Handle push notifications
self.addEventListener('push', (event) => {
  try {
    const options = {
      body: event.data.text(),
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      vibrate: [100, 50, 100],
      data: {
        dateOfArrival: Date.now(),
        primaryKey: 1
      }
    };

    event.waitUntil(
      self.registration.showNotification('Attendance Update', options)
    );
  } catch (error) {
    console.error('Push event handling failed:', error);
  }
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/')
  );
});

// Ensure the service worker takes control immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
}); 