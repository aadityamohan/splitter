import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import {
  getFirestore,
  initializeFirestore,
  type Firestore,
} from 'firebase/firestore'
import { getAnalytics, isSupported, type Analytics } from 'firebase/analytics'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  ...(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
    ? { measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID }
    : {}),
}

/** All required for Auth + Firestore; missing authDomain often causes auth/configuration-not-found. */
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId
)

let dbCache: Firestore | null = null
let firebaseApp: FirebaseApp | null = null
let analyticsPromise: Promise<Analytics | null> | null = null

function getOrCreateApp(): FirebaseApp | null {
  if (!isFirebaseConfigured) return null
  if (!firebaseApp) {
    firebaseApp =
      getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]!
  }
  return firebaseApp
}

export function getFirebaseApp(): FirebaseApp | null {
  return getOrCreateApp()
}

/** Google Analytics (only when measurementId is set and the browser supports it). */
export function getFirebaseAnalytics(): Promise<Analytics | null> {
  if (analyticsPromise) return analyticsPromise
  analyticsPromise = (async () => {
    const app = getOrCreateApp()
    if (!app || typeof window === 'undefined') return null
    if (!import.meta.env.VITE_FIREBASE_MEASUREMENT_ID) return null
    try {
      if (await isSupported()) {
        return getAnalytics(app)
      }
    } catch {
      // Analytics unavailable (e.g. blocked, localhost quirks)
    }
    return null
  })()
  return analyticsPromise
}

export function getFirebaseDb(): Firestore | null {
  const app = getOrCreateApp()
  if (!app) return null
  if (!dbCache) {
    // WebChannel is often blocked by VPNs / corporate firewalls / some ISPs.
    // Auto long-polling fallback usually fixes "unavailable" / transport errors.
    const forceLongPolling =
      import.meta.env.VITE_FIRESTORE_FORCE_LONG_POLLING === 'true'
    const settings = forceLongPolling
      ? { experimentalForceLongPolling: true as const }
      : { experimentalAutoDetectLongPolling: true as const }
    try {
      dbCache = initializeFirestore(app, settings)
    } catch {
      // Already initialized (e.g. Vite HMR) — reuse instance
      dbCache = getFirestore(app)
    }
    void getFirebaseAnalytics()
  }
  return dbCache
}
