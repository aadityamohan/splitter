import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  signInWithTestAccount,
  isTestAccountConfigured,
  getFirebaseAuth,
  updateDisplayName,
} from '@/lib/auth'
import { seedDemoData } from '@/lib/firestore-groups'
import { useSplitterStore } from '@/stores/splitter-store'
import { markTestSession } from '@/lib/test-session'
import { FlaskConical, Loader2, AlertTriangle, RotateCw } from 'lucide-react'

type Status = 'signing-in' | 'seeding' | 'error'

export function TestLoginPage() {
  const [status, setStatus] = useState<Status>('signing-in')
  const [error, setError] = useState<string | null>(null)
  const attempted = useRef(false)

  const attempt = async () => {
    setStatus('signing-in')
    setError(null)
    try {
      markTestSession()
      await signInWithTestAccount()

      // Seed demo data on first login so the account looks populated.
      const u = getFirebaseAuth()?.currentUser
      if (u) {
        setStatus('seeding')
        if (!u.displayName) {
          try { await updateDisplayName('Demo User') } catch { /* non-fatal */ }
        }
        await seedDemoData(u.uid, u.displayName ?? 'Demo User', u.email ?? '')
        // Surface the seeded groups (onAuthStateChanged also refreshes, this guarantees it)
        await useSplitterStore
          .getState()
          .refreshWorkspace(u.uid, u.email, u.displayName ?? 'Demo User', u.phoneNumber)
      }
      // AuthContext's onAuthStateChanged swaps to GroupsHome.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Test sign-in failed.')
      setStatus('error')
    }
  }

  // Auto sign-in once on mount
  useEffect(() => {
    if (attempted.current) return
    attempted.current = true
    if (!isTestAccountConfigured) {
      setError(
        'Test account is not configured. Set VITE_TEST_ACCOUNT_EMAIL and VITE_TEST_ACCOUNT_PASSWORD in .env and rebuild.',
      )
      setStatus('error')
      return
    }
    void attempt()
  }, [])

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Test-mode banner */}
      <div className="flex items-center justify-center gap-2 bg-amber-400 dark:bg-amber-500 py-2 px-4 text-sm font-semibold tracking-wide text-amber-950">
        <FlaskConical className="h-4 w-4" />
        TEST MODE — for development &amp; QA only
      </div>

      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="overflow-hidden rounded-2xl border-2 border-amber-400/60 bg-card shadow-lg">
            <div className="border-b border-amber-200 bg-amber-50 px-6 py-4 dark:border-amber-800 dark:bg-amber-950/30">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-400/20">
                  <FlaskConical className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-foreground">Test Mode Login</h1>
                  <p className="text-xs text-muted-foreground">
                    One-click sign-in — no OTP, no SMS
                  </p>
                </div>
              </div>
            </div>

            <div className="px-6 py-8">
              {status === 'signing-in' || status === 'seeding' ? (
                <div className="flex flex-col items-center gap-3 text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
                  <p className="text-sm text-muted-foreground">
                    {status === 'seeding'
                      ? 'Setting up demo data…'
                      : 'Signing in to the test account…'}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 text-center">
                  <AlertTriangle className="h-8 w-8 text-destructive" />
                  <p className="text-sm text-destructive">{error}</p>
                  <Button
                    className="gap-2 bg-amber-500 text-white hover:bg-amber-600"
                    onClick={() => void attempt()}
                    disabled={!isTestAccountConfigured}
                  >
                    <RotateCw className="h-4 w-4" />
                    Retry
                  </Button>
                </div>
              )}
            </div>
          </div>

          <p className="mt-6 px-4 text-center text-xs text-muted-foreground">
            Enable the <span className="font-medium">Email/Password</span> provider and create the
            test user in{' '}
            <a
              href="https://console.firebase.google.com/project/_/authentication/users"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Firebase Console → Authentication → Users
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  )
}
