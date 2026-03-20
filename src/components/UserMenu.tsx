import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { LogOut } from 'lucide-react'

export function UserMenu() {
  const { user, signOut, authRequired } = useAuth()

  if (!authRequired || !user) return null

  const photo = user.photoURL
  const name = user.displayName ?? user.email ?? 'Account'

  return (
    <div className="flex items-center gap-2">
      {photo ? (
        <img
          src={photo}
          alt=""
          className="h-8 w-8 rounded-full border object-cover"
          referrerPolicy="no-referrer"
        />
      ) : null}
      <span className="hidden max-w-[140px] truncate text-sm text-muted-foreground sm:inline">
        {name}
      </span>
      <Button variant="ghost" size="icon" onClick={() => void signOut()} aria-label="Sign out">
        <LogOut className="h-5 w-5" />
      </Button>
    </div>
  )
}
