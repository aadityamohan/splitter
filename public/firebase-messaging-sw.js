// Firebase Messaging service worker — handles background push notifications.
// This file must stay at the root path (/firebase-messaging-sw.js).

importScripts('https://www.gstatic.com/firebasejs/11.0.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/11.0.0/firebase-messaging-compat.js')

// These values are injected at runtime via the FIREBASE_SW_CONFIG query param
// OR hard-coded here. We use the query-param approach so we never expose secrets.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// Read config injected by the app when it registers this service worker
self.__FIREBASE_MESSAGING_SW_CONFIG__ = self.__FIREBASE_MESSAGING_SW_CONFIG__ || null

// Listen for a one-time config message from the main thread
self.addEventListener('message', (event) => {
  if (event.data?.type === 'FIREBASE_SW_CONFIG') {
    const config = event.data.config
    if (!firebase.apps.length) {
      firebase.initializeApp(config)
    }
    const messaging = firebase.messaging()

    // Background message handler — shows a notification when the app is closed / backgrounded
    messaging.onBackgroundMessage((payload) => {
      const title = payload.notification?.title ?? 'Splitter'
      const body = payload.notification?.body ?? ''
      if (body) {
        self.registration.showNotification(title, {
          body,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
        })
      }
    })
  }
})
