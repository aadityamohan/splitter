import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSplitterStore } from '@/stores/splitter-store'
import { useAuth } from '@/contexts/AuthContext'
import { Users } from 'lucide-react'

export function UsersSettings() {
  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const { user } = useAuth()
  const participants = useSplitterStore((s) => s.participants)
  const addParticipant = useSplitterStore((s) => s.addParticipant)
  const removeParticipant = useSplitterStore((s) => s.removeParticipant)

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    addParticipant(newName.trim())
    setNewName('')
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Manage people in this group">
          <Users className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>People in this group</DialogTitle>
          <DialogDescription className="sr-only">
            Add placeholder people for splitting (e.g. before they accept an invite). Members who
            joined via Google are linked to their account.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Add person (name only)</Label>
            <form onSubmit={handleAdd} className="flex gap-2">
              <Input
                placeholder="Name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <Button type="submit">Add</Button>
            </form>
          </div>
          <div className="space-y-2">
            <Label>Participants</Label>
            <ul className="space-y-2">
              {participants.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between rounded-lg border px-3 py-2"
                >
                  <span>
                    {p.name}
                    {p.linkedUid ? (
                      <span className="ml-2 text-xs text-muted-foreground">(signed in)</span>
                    ) : null}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => removeParticipant(p.id)}
                    disabled={
                      participants.length <= 1 ||
                      (!!user && !!p.linkedUid && p.linkedUid === user.uid)
                    }
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
