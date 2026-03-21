import { FirebaseError } from 'firebase/app'
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  signOut as firebaseSignOut,
  type Auth,
  type ConfirmationResult,
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

// ── Google ────────────────────────────────────────────────────────────────────

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

// ── Phone OTP ─────────────────────────────────────────────────────────────────

let recaptchaVerifier: RecaptchaVerifier | null = null

export function clearRecaptchaVerifier() {
  if (recaptchaVerifier) {
    try { recaptchaVerifier.clear() } catch { /* already cleared */ }
    recaptchaVerifier = null
  }
}

function getOrCreateRecaptchaVerifier(auth: Auth, containerId: string): RecaptchaVerifier {
  if (!recaptchaVerifier) {
    recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
      size: 'invisible',
      callback: () => { /* OTP sent */ },
    })
  }
  return recaptchaVerifier
}

/**
 * Send a 6-digit OTP to the given phone number (E.164 format: +91XXXXXXXXXX).
 * `containerId` must be the id of a div that exists in the DOM.
 */
export async function sendPhoneOtp(
  phoneNumber: string,
  containerId = 'recaptcha-container'
): Promise<ConfirmationResult> {
  const auth = getFirebaseAuth()
  if (!auth) throw new Error('Firebase Auth is not configured')
  const verifier = getOrCreateRecaptchaVerifier(auth, containerId)
  try {
    return await signInWithPhoneNumber(auth, phoneNumber, verifier)
  } catch (e) {
    // Reset on error so the next attempt gets a fresh verifier
    clearRecaptchaVerifier()
    if (e instanceof FirebaseError) {
      const msgs: Record<string, string> = {
        'auth/invalid-phone-number': 'Invalid phone number. Use E.164 format, e.g. +919876543210',
        'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
        'auth/captcha-check-failed': 'reCAPTCHA check failed. Reload the page and try again.',
      }
      if (msgs[e.code]) throw new Error(msgs[e.code])
    }
    throw e
  }
}

/**
 * Confirm the OTP the user typed. Throws if the code is wrong or expired.
 */
export async function verifyPhoneOtp(
  confirmationResult: ConfirmationResult,
  otp: string
): Promise<void> {
  try {
    await confirmationResult.confirm(otp)
  } catch (e) {
    if (e instanceof FirebaseError) {
      if (e.code === 'auth/invalid-verification-code') throw new Error('Incorrect OTP. Try again.')
      if (e.code === 'auth/code-expired') throw new Error('OTP expired. Request a new one.')
    }
    throw e
  }
}

// ── Sign out ──────────────────────────────────────────────────────────────────

export async function signOutUser(): Promise<void> {
  const auth = getFirebaseAuth()
  if (!auth) return
  await firebaseSignOut(auth)
}
