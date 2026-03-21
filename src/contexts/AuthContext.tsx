import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { getFirebaseAuth, signInWithGoogle, signOutUser } from '@/lib/auth'
import { isFirebaseConfigured } from '@/lib/firebase'
import { useSplitterStore } from '@/stores/splitter-store'
import { initFcm, listenForegroundMessages } from '@/lib/fcm'

type AuthContextValue = {
  user: User | null
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  authRequired: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function restoreSessionWorkspace(
  uid: string,
  email: string | null,
  displayName: string | null,
  phone: string | null
) {
  const store = useSplitterStore.getState()
  await store.refreshWorkspace(uid, email, displayName, phone)
  const { activeGroupId, myGroups } = useSplitterStore.getState()
  const stillMember = activeGroupId && myGroups.some((g) => g.id === activeGroupId)
  if (stillMember) {
    await store.selectGroup(activeGroupId)
  } else {
    useSplitterStore.setState({ activeGroupId: null })
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const authRequired = isFirebaseConfigured

  useEffect(() => {
    if (!authRequired) {
      setUser(null)
      setLoading(false)
      return
    }

    const auth = getFirebaseAuth()
    if (!auth) {
      setLoading(false)
      return
    }

    // Register service worker and start listening for foreground FCM messages
    let unsubFcm: (() => void) | undefined
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker
        .register('/firebase-messaging-sw.js')
        .then((reg) => {
          // Send Firebase config to the SW so it can initialise without env vars
          const config = {
            apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
            authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
            projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
            storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
            messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
            appId: import.meta.env.VITE_FIREBASE_APP_ID,
          }
          reg.active?.postMessage({ type: 'FIREBASE_SW_CONFIG', config })
          reg.installing?.addEventListener('statechange', function () {
            if (this.state === 'activated') {
              this.postMessage({ type: 'FIREBASE_SW_CONFIG', config })
            }
          })
          unsubFcm = listenForegroundMessages()
        })
        .catch((err) => console.warn('[SW] Registration failed:', err))
    }

    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u)
      setLoading(false)
      if (u) {
        void restoreSessionWorkspace(u.uid, u.email, u.displayName, u.phoneNumber).catch((err) =>
          console.error('restoreSessionWorkspace', err)
        )
        // Request notification permission and store FCM token
        void initFcm(u.uid).catch((err) => console.warn('[FCM] init failed:', err))
      }
    })
    return () => {
      unsub()
      unsubFcm?.()
    }
  }, [authRequired])

  const signIn = useCallback(async () => {
    await signInWithGoogle()
  }, [])

  const signOut = useCallback(async () => {
    await signOutUser()
    useSplitterStore.setState({
      activeGroupId: null,
      myGroups: [],
      pendingInvites: [],
      outboundInvites: [],
      participants: [],
      expenses: [],
      settlements: [],
    })
  }, [])

  const value = useMemo(
    () => ({
      user,
      loading,
      signInWithGoogle: signIn,
      signOut,
      authRequired,
    }),
    [user, loading, signIn, signOut, authRequired]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
