import { FirebaseError } from 'firebase/app'
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  type Auth,
} from 'firebase/auth'
import { getFirebaseApp, isFirebaseConfigured } from './firebase'

let authCache: Auth | null = null

export function getFirebaseAuth(): Auth | null {
  if (!isFirebaseConfigured) return null
  const app = getFirebaseApp()
  if (!app) return null
  if (!authCache) {
    authCache = getAuth(app)
  }
  return authCache
}

const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })
googleProvider.addScope('email')
googleProvider.addScope('profile')

function mapAuthError(e: unknown): never {
  if (e instanceof FirebaseError && e.code === 'auth/configuration-not-found') {
    throw new Error(
      'Firebase Authentication is not enabled or your web config does not match this project. ' +
        'In Firebase Console: open Authentication → Get started, enable the Google provider, ' +
        'then copy Project settings → Your apps → Web app config into .env ' +
        '(especially VITE_FIREBASE_AUTH_DOMAIN, usually <projectId>.firebaseapp.com). ' +
        'Restart the dev server after changing .env.'
    )
  }
  throw e
}

export async function signInWithGoogle(): Promise<void> {
  const auth = getFirebaseAuth()
  if (!auth) throw new Error('Firebase Auth is not configured')
  try {
    await signInWithPopup(auth, googleProvider)
  } catch (e) {
    mapAuthError(e)
  }
}

export async function signOutUser(): Promise<void> {
  const auth = getFirebaseAuth()
  if (!auth) return
  await firebaseSignOut(auth)
}
