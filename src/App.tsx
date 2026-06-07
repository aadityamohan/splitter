import { useAuth } from '@/contexts/AuthContext'
import { LoginPage } from '@/components/LoginPage'
import { TestLoginPage } from '@/components/TestLoginPage'
import { TestModeBadge } from '@/components/TestModeBadge'
import { MainApp } from '@/components/MainApp'
import { GroupsHome } from '@/components/GroupsHome'
import { useSplitterStore } from '@/stores/splitter-store'
import { markTestSession, isTestSession } from '@/lib/test-session'

// Detect ?test (or ?test=anything) in the URL and remember it for the session
if (new URLSearchParams(window.location.search).has('test')) markTestSession()

function App() {
  const { user, loading, authRequired } = useAuth()
  const activeGroupId = useSplitterStore((s) => s.activeGroupId)

  if (authRequired && loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading…</div>
      </div>
    )
  }

  // Test-mode login — auto signs in with the test account at /?test.
  // Gated on the live session flag so "Exit" (which clears it) doesn't loop back.
  if (authRequired && !user && isTestSession()) {
    return <TestLoginPage />
  }

  if (authRequired && !user) {
    return <LoginPage />
  }

  return (
    <>
      {authRequired && user && !activeGroupId && <GroupsHome />}
      {authRequired && user && activeGroupId && <MainApp />}

      {/* No Firebase in .env — prompt to configure */}
      {!authRequired && (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="text-muted-foreground">
            Add Firebase variables to <code className="rounded bg-muted px-1">.env</code> to use
            Splitter with Google sign-in and private groups.
          </p>
        </div>
      )}

      {/* Persistent TEST MODE badge — visible across the whole app while testing */}
      <TestModeBadge />
    </>
  )
}

export default App
