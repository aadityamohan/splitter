import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useSplitterStore } from '@/stores/splitter-store'
import { buildInviteGmailComposeUrl, normalizeInviteEmail } from '@/lib/invite-utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MailPlus } from 'lucide-react'

export function InviteByEmailDialog() {
  const { user } = useAuth()
  const activeGroupId = useSplitterStore((s) => s.activeGroupId)
  const myGroups = useSplitterStore((s) => s.myGroups)
  const inviteToActiveGroup = useSplitterStore((s) => s.inviteToActiveGroup)
  const outboundInvites = useSplitterStore((s) => s.outboundInvites)
  const cancelOutboundInvite = useSplitterStore((s) => s.cancelOutboundInvite)
  const refreshOutboundInvites = useSplitterStore((s) => s.refreshOutboundInvites)

  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open && activeGroupId) void refreshOutboundInvites()
  }, [open, activeGroupId, refreshOutboundInvites])

  const groupName =
    myGroups.find((g) => g.id === activeGroupId)?.name ?? 'this group'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!user || !activeGroupId) return
    const norm = normalizeInviteEmail(email)
    if (!norm.includes('@')) {
      setError('Enter a valid email address')
      return
    }
    if (user.email && normalizeInviteEmail(user.email) === norm) {
      setError("You can't invite your own email")
      return
    }
    setBusy(true)
    try {
      await inviteToActiveGroup(
        norm,
        user.uid,
        user.displayName ?? user.email ?? 'Someone'
      )
      const inviterName = user.displayName ?? user.email ?? 'Your friend'
      const appUrl =
        typeof window !== 'undefined' ? window.location.origin : ''
      const gmailUrl = buildInviteGmailComposeUrl(inviterName, groupName, norm, appUrl)
      window.open(gmailUrl, '_blank', 'noopener,noreferrer')
      setEmail('')
      setOpen(false)
      await refreshOutboundInvites()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not send invite')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <MailPlus className="h-4 w-4" />
          Invite
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite by email</DialogTitle>
          <DialogDescription>
            We&apos;ll open <strong>Gmail</strong> in your browser with the invite ready to send. Sign in to
            Google if asked. Your friend must use the <strong>same Google account email</strong> to accept.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="friend@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Saving…' : 'Create invite & open Gmail'}
          </Button>
        </form>

        {outboundInvites.length > 0 ? (
          <div className="border-t pt-4">
            <p className="mb-2 text-sm font-medium">Pending invites</p>
            <ul className="space-y-2 text-sm">
              {outboundInvites.map((o) => (
                <li
                  key={o.id}
                  className="flex items-center justify-between gap-2 rounded border px-2 py-1"
                >
                  <span className="truncate">{o.emailLower}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-destructive"
                    onClick={() => void cancelOutboundInvite(o.emailLower)}
                  >
                    Cancel
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
