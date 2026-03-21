// Firebase Messaging service worker — handles background push notifications.
// This file must stay at the root path (/firebase-messaging-sw.js).
// Firebase config values are intentionally hardcoded here — they are PUBLIC
// and already shipped in the main JS bundle. Do NOT put secrets here.

importScripts('https://www.gstatic.com/firebasejs/11.0.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/11.0.0/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: 'AIzaSyB_Qg7uy1FEpsIaPXIR8_9qA3dbl4uS5mE',
  authDomain: 'splitter-fd759.firebaseapp.com',
  projectId: 'splitter-fd759',
  storageBucket: 'splitter-fd759.firebasestorage.app',
  messagingSenderId: '30267827762',
  appId: '1:30267827762:web:a314d4e19ecb40740ebe2b',
})

const messaging = firebase.messaging()

// Called when a push arrives while the app is backgrounded / closed
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title ?? 'Splitter'
  const body = payload.notification?.body ?? ''
  if (!body) return
  self.registration.showNotification(title, {
    body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: 'splitter-notification', // collapses multiple rapid notifications into one
  })
})
