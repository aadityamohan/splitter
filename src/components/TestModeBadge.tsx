import { useAuth } from '@/contexts/AuthContext'
import { isTestSession } from '@/lib/test-session'
import { FlaskConical, LogOut } from 'lucide-react'

/**
 * Fixed, always-on-top badge shown for the whole app while in a test session.
 * Lets the tester see they're in test mode and exit (sign out) from anywhere.
 */
export function TestModeBadge() {
  const { user, signOut } = useAuth()

  if (!isTestSession()) return null

  return (
    <div className="fixed bottom-3 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-full border border-amber-500/60 bg-amber-400 px-3 py-1.5 text-amber-950 shadow-lg">
        <FlaskConical className="h-3.5 w-3.5" />
        <span className="text-xs font-bold tracking-wide">TEST MODE</span>
        {user && (
          <>
            <span className="hidden text-[11px] font-medium opacity-70 sm:inline">
              {user.email ?? user.displayName ?? user.phoneNumber}
            </span>
            <button
              type="button"
              onClick={() => void signOut()}
              className="ml-1 flex items-center gap-1 rounded-full bg-amber-950/10 px-2 py-0.5 text-[11px] font-semibold transition-colors hover:bg-amber-950/20"
              aria-label="Exit test mode"
            >
              <LogOut className="h-3 w-3" />
              Exit
            </button>
          </>
        )}
      </div>
    </div>
  )
}
