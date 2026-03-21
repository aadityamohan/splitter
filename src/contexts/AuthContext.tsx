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

    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u)
      setLoading(false)
      if (u) {
        void restoreSessionWorkspace(u.uid, u.email, u.displayName, u.phoneNumber).catch((err) =>
          console.error('restoreSessionWorkspace', err)
        )
      }
    })
    return unsub
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
