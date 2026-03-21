import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { ThemeToggle } from '@/components/ThemeToggle'
import { ProfileDialog } from '@/components/ProfileDialog'
import { User } from 'lucide-react'

export function UserMenu() {
  const { user, authRequired } = useAuth()
  const [profileOpen, setProfileOpen] = useState(false)

  if (!authRequired || !user) return null

  const photo = user.photoURL
  const name = user.displayName ?? user.email ?? user.phoneNumber ?? 'Account'

  return (
    <>
      <div className="flex items-center gap-1">
        <ThemeToggle />

        {/* Clickable avatar / name opens the profile dialog */}
        <button
          type="button"
          onClick={() => setProfileOpen(true)}
          className="flex items-center gap-1.5 rounded-full px-1 py-0.5 hover:bg-accent transition-colors"
          aria-label="Open profile"
        >
          {photo ? (
            <img
              src={photo}
              alt=""
              className="h-8 w-8 rounded-full border object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {name.slice(0, 2).toUpperCase() || <User className="h-4 w-4" />}
            </div>
          )}
          <span className="hidden max-w-[120px] truncate text-sm text-muted-foreground sm:inline">
            {name}
          </span>
        </button>
      </div>

      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </>
  )
}
