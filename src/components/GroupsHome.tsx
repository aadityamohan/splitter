import { useState } from 'react'
import { FirebaseError } from 'firebase/app'
import { useAuth } from '@/contexts/AuthContext'
import { useSplitterStore } from '@/stores/splitter-store'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Users, Plus, Mail, LogIn, Phone } from 'lucide-react'
import type { PendingInviteDoc } from '@/lib/firestore-groups'
import { ThemeToggle } from '@/components/ThemeToggle'

export function GroupsHome() {
  const { user } = useAuth()
  const myGroups = useSplitterStore((s) => s.myGroups)
  const pendingInvites = useSplitterStore((s) => s.pendingInvites)
  const selectGroup = useSplitterStore((s) => s.selectGroup)
  const createGroup = useSplitterStore((s) => s.createGroup)
  const acceptPendingInvite = useSplitterStore((s) => s.acceptPendingInvite)
  const declinePendingInvite = useSplitterStore((s) => s.declinePendingInvite)

  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [acceptError, setAcceptError] = useState<string | null>(null)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !newName.trim()) return
    setBusy(true)
    try {
      await createGroup(newName.trim(), user.uid, user.displayName, user.email)
      setNewName('')
      setCreateOpen(false)
    } finally {
      setBusy(false)
    }
  }

  const handleAccept = async (inv: PendingInviteDoc) => {
    if (!user) return
    setAcceptError(null)
    setBusy(true)
    try {
      await acceptPendingInvite(inv, user.uid, user.displayName, user.email, user.phoneNumber)
    } catch (e: unknown) {
      let msg =
        e instanceof Error ? e.message : 'Could not join the group. Check Firestore rules are deployed.'
      if (e instanceof FirebaseError && e.code === 'permission-denied') {
        msg =
          'Permission denied. Deploy the latest firestore.rules (npm run deploy:rules), sign in with the invited email, and ask the host to send a new invite if needed.'
      }
      setAcceptError(msg)
      console.error('acceptPendingInvite', e)
    } finally {
      setBusy(false)
    }
  }

  const handleDecline = async (inv: PendingInviteDoc) => {
    setBusy(true)
    try {
      await declinePendingInvite(inv)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <h1 className="text-xl font-bold tracking-tight">Splitter</h1>
          <div className="flex items-center gap-1">
            <p className="max-w-[160px] truncate text-sm text-muted-foreground hidden sm:block">
              {user?.email ?? user?.phoneNumber}
            </p>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-lg space-y-8 px-4 py-8">
        {pendingInvites.length > 0 ? (
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Mail className="h-5 w-5" />
              Invitations
            </h2>
            {acceptError ? (
              <p className="text-sm text-destructive" role="alert">
                {acceptError}
              </p>
            ) : null}
            {pendingInvites.map((inv) => (
              <Card key={inv.id} className="border-primary/40">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{inv.groupName}</CardTitle>
                  <CardDescription>
                    {inv.inviterName} invited you
                    {inv.contactType === 'phone' ? (
                      <span> via phone — <Phone className="inline h-3.5 w-3.5 mb-0.5" /> <strong>{inv.phone}</strong></span>
                    ) : (
                      <span> — sign in as <strong>{inv.emailLower}</strong></span>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => void handleAccept(inv)}
                  >
                    <LogIn className="mr-1 h-4 w-4" />
                    Join group
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void handleDecline(inv)}
                  >
                    Decline
                  </Button>
                </CardContent>
              </Card>
            ))}
          </section>
        ) : null}

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Users className="h-5 w-5" />
              Your groups
            </h2>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1">
                  <Plus className="h-4 w-4" />
                  New group
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create group</DialogTitle>
                  <DialogDescription className="sr-only">
                    Name your expense-sharing group. You can invite others by email afterward.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="gname">Group name</Label>
                    <Input
                      id="gname"
                      placeholder="Trip to Goa, Flatmates…"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      required
                    />
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={busy}>
                      Create
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {myGroups.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                No groups yet. Create one to start tracking shared expenses.
              </CardContent>
            </Card>
          ) : (
            <ul className="space-y-2">
              {myGroups.map((g) => (
                <li key={g.id}>
                  <Button
                    variant="outline"
                    className="h-auto w-full justify-between py-4 text-left"
                    onClick={() => void selectGroup(g.id)}
                  >
                    <span className="font-medium">{g.name}</span>
                    {g.createdBy === user?.uid ? (
                      <span className="text-xs text-muted-foreground">Owner</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Member</span>
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}
