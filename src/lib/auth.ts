import { FirebaseError } from 'firebase/app'
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithPhoneNumber,
  linkWithPhoneNumber,
  updateProfile,
  updatePhoneNumber,
  PhoneAuthProvider,
  RecaptchaVerifier,
  signOut as firebaseSignOut,
  reload,
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

/**
 * Renders a visible reCAPTCHA checkbox into `containerId`.
 * The checkbox must be ticked by the user before calling sendPhoneOtp.
 * Returns a promise that resolves once the widget has rendered.
 */
export function initRecaptchaVerifier(
  containerId = 'recaptcha-container',
  onSolved?: () => void,
): Promise<void> {
  const auth = getFirebaseAuth()
  if (!auth) return Promise.resolve()
  // Always start fresh so the widget re-renders correctly on tab switch
  clearRecaptchaVerifier()
  recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
    size: 'normal',
    callback: () => {
      onSolved?.()
    },
    'expired-callback': () => {
      onSolved && onSolved() // reset solved state in UI
      clearRecaptchaVerifier()
    },
  })
  return recaptchaVerifier.render().then(() => { /* rendered */ }).catch(() => {
    clearRecaptchaVerifier()
  })
}

function getOrCreateRecaptchaVerifier(auth: Auth, containerId: string): RecaptchaVerifier {
  if (!recaptchaVerifier) {
    recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
      size: 'normal',
      'expired-callback': () => { clearRecaptchaVerifier() },
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
        'auth/invalid-phone-number':
          'Invalid phone number. Use E.164 format, e.g. +919876543210.',
        'auth/too-many-requests':
          'Too many OTP attempts. Please wait a few minutes and try again.',
        'auth/captcha-check-failed':
          'reCAPTCHA check failed. Disable your ad blocker (or open in incognito) and try again.',
        'auth/network-request-failed':
          'Network error — your ad blocker may be blocking Firebase. Try in an incognito window.',
        'auth/operation-not-allowed':
          'Phone sign-in is not enabled. Go to Firebase Console → Authentication → Sign-in methods → Phone and enable it.',
        'auth/quota-exceeded':
          'SMS quota exceeded for this project. Try again later or use a different number.',
        'auth/missing-phone-number':
          'No phone number provided.',
        'auth/invalid-app-credential':
          'reCAPTCHA verification failed. Reload and try again, or disable your ad blocker.',
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

// ── Profile updates ───────────────────────────────────────────────────────────

/** Update the signed-in user's display name. */
export async function updateDisplayName(name: string): Promise<void> {
  const auth = getFirebaseAuth()
  if (!auth?.currentUser) throw new Error('Not signed in')
  await updateProfile(auth.currentUser, { displayName: name.trim() })
  await reload(auth.currentUser)
}

/**
 * Step 1 – send OTP to link a new phone number to the current account.
 * Works for Google-signed-in users who have no phone yet.
 */
export async function sendLinkPhoneOtp(
  phoneNumber: string,
  containerId = 'profile-recaptcha-container',
  onSolved?: () => void,
): Promise<ConfirmationResult> {
  const auth = getFirebaseAuth()
  if (!auth?.currentUser) throw new Error('Not signed in')
  clearRecaptchaVerifier()
  recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
    size: 'normal',
    callback: () => { onSolved?.() },
    'expired-callback': () => { clearRecaptchaVerifier() },
  })
  await recaptchaVerifier.render()
  try {
    return await linkWithPhoneNumber(auth.currentUser, phoneNumber, recaptchaVerifier)
  } catch (e) {
    clearRecaptchaVerifier()
    if (e instanceof FirebaseError) {
      const msgs: Record<string, string> = {
        'auth/invalid-phone-number': 'Invalid phone number. Use E.164 format, e.g. +919876543210.',
        'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
        'auth/captcha-check-failed': 'reCAPTCHA failed. Try again.',
        'auth/provider-already-linked': 'A phone number is already linked to this account.',
        'auth/credential-already-in-use': 'This phone number is already used by another account.',
      }
      if (msgs[e.code]) throw new Error(msgs[e.code])
    }
    throw e
  }
}

/**
 * Step 2 – confirm the OTP to finish linking the phone number.
 * After this succeeds call `reloadCurrentUser()` to refresh the UI.
 */
export async function confirmLinkPhoneOtp(
  confirmation: ConfirmationResult,
  otp: string,
): Promise<void> {
  const auth = getFirebaseAuth()
  try {
    const result = await confirmation.confirm(otp)
    // Also update the phone on the profile so updateProfile reflects it
    if (result.user && auth) await reload(result.user)
  } catch (e) {
    if (e instanceof FirebaseError) {
      if (e.code === 'auth/invalid-verification-code') throw new Error('Incorrect OTP. Try again.')
      if (e.code === 'auth/code-expired') throw new Error('OTP expired. Request a new one.')
    }
    throw e
  } finally {
    clearRecaptchaVerifier()
  }
}

/**
 * Step 1 – send OTP to update (change) an existing phone number.
 * Used by phone-auth users who want to change their number.
 */
export async function sendUpdatePhoneOtp(
  newPhoneNumber: string,
  containerId = 'profile-recaptcha-container',
  onSolved?: () => void,
): Promise<ConfirmationResult> {
  const auth = getFirebaseAuth()
  if (!auth?.currentUser) throw new Error('Not signed in')
  clearRecaptchaVerifier()
  recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
    size: 'normal',
    callback: () => { onSolved?.() },
    'expired-callback': () => { clearRecaptchaVerifier() },
  })
  await recaptchaVerifier.render()
  try {
    return await signInWithPhoneNumber(auth, newPhoneNumber, recaptchaVerifier)
  } catch (e) {
    clearRecaptchaVerifier()
    if (e instanceof FirebaseError) {
      const msgs: Record<string, string> = {
        'auth/invalid-phone-number': 'Invalid phone number. Use E.164 format, e.g. +919876543210.',
        'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
        'auth/credential-already-in-use': 'This number is already used by another account.',
      }
      if (msgs[e.code]) throw new Error(msgs[e.code])
    }
    throw e
  }
}

/**
 * Step 2 – confirm OTP and update the phone number on the current user.
 */
export async function confirmUpdatePhoneOtp(
  confirmation: ConfirmationResult,
  otp: string,
): Promise<void> {
  const auth = getFirebaseAuth()
  if (!auth?.currentUser) throw new Error('Not signed in')
  try {
    const credential = PhoneAuthProvider.credential(
      (confirmation as unknown as { verificationId: string }).verificationId,
      otp,
    )
    await updatePhoneNumber(auth.currentUser, credential)
    await reload(auth.currentUser)
  } catch (e) {
    if (e instanceof FirebaseError) {
      if (e.code === 'auth/invalid-verification-code') throw new Error('Incorrect OTP. Try again.')
      if (e.code === 'auth/code-expired') throw new Error('OTP expired. Request a new one.')
    }
    throw e
  } finally {
    clearRecaptchaVerifier()
  }
}

/** Force-reload the current Firebase user so profile changes are reflected. */
export async function reloadCurrentUser(): Promise<void> {
  const auth = getFirebaseAuth()
  if (auth?.currentUser) await reload(auth.currentUser)
}

// ── Sign out ──────────────────────────────────────────────────────────────────

export async function signOutUser(): Promise<void> {
  const auth = getFirebaseAuth()
  if (!auth) return
  await firebaseSignOut(auth)
}
