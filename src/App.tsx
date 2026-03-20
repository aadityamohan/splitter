import { useAuth } from '@/contexts/AuthContext'
import { LoginPage } from '@/components/LoginPage'
import { MainApp } from '@/components/MainApp'
import { GroupsHome } from '@/components/GroupsHome'
import { useSplitterStore } from '@/stores/splitter-store'

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

  if (authRequired && !user) {
    return <LoginPage />
  }

  if (authRequired && user && !activeGroupId) {
    return <GroupsHome />
  }

  if (authRequired && user && activeGroupId) {
    return <MainApp />
  }

  // No Firebase in .env — local demo not supported with groups; prompt to configure
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-muted-foreground">
        Add Firebase variables to <code className="rounded bg-muted px-1">.env</code> to use Splitter
        with Google sign-in and private groups.
      </p>
    </div>
  )
}

export default App
