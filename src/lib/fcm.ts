import { getMessaging, getToken, onMessage, type Messaging } from 'firebase/messaging'
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { getFirebaseApp, getFirebaseDb } from './firebase'

let messagingCache: Messaging | null = null

function getMessagingInstance(): Messaging | null {
  if (messagingCache) return messagingCache
  const app = getFirebaseApp()
  if (!app) return null
  try {
    messagingCache = getMessaging(app)
    return messagingCache
  } catch {
    return null
  }
}

/**
 * Request notification permission, get an FCM token, and store it in
 * `userTokens/{uid}` so Cloud Functions can send push notifications.
 * Safe to call multiple times — silently does nothing if already granted.
 */
export async function initFcm(uid: string): Promise<void> {
  if (typeof window === 'undefined' || !('Notification' in window)) return

  // Don't bother asking if the user previously denied
  if (Notification.permission === 'denied') return

  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined
  if (!vapidKey) {
    console.warn(
      '[FCM] VITE_FIREBASE_VAPID_KEY is not set — push notifications are disabled. ' +
        'Generate a Web Push certificate in Firebase Console → Project settings → Cloud Messaging.'
    )
    return
  }

  try {
    // This triggers the browser permission prompt if not yet granted
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return

    const messaging = getMessagingInstance()
    if (!messaging) return

    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js'),
    })
    if (!token) return

    // Persist the token so Cloud Functions can look it up
    const db = getFirebaseDb()
    if (!db) return
    await setDoc(
      doc(db, 'userTokens', uid, 'tokens', token),
      { token, updatedAt: serverTimestamp() },
      { merge: true }
    )
  } catch (e) {
    // FCM is optional — never crash the app
    console.warn('[FCM] initFcm failed:', e)
  }
}

/** Remove an FCM token from Firestore (e.g. on sign-out). */
export async function removeFcmToken(uid: string, token: string): Promise<void> {
  const db = getFirebaseDb()
  if (!db) return
  try {
    await deleteDoc(doc(db, 'userTokens', uid, 'tokens', token))
  } catch {
    // Best-effort
  }
}

/**
 * Listen for foreground messages and show a browser Notification manually
 * (FCM service worker only handles background messages automatically).
 */
export function listenForegroundMessages(): (() => void) | undefined {
  const messaging = getMessagingInstance()
  if (!messaging) return

  const unsub = onMessage(messaging, (payload) => {
    const title = payload.notification?.title ?? 'Splitter'
    const body = payload.notification?.body ?? ''
    if (Notification.permission === 'granted' && body) {
      new Notification(title, { body, icon: '/favicon.ico' })
    }
  })
  return unsub
}
