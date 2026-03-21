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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSplitterStore } from '@/stores/splitter-store'
import { useAuth } from '@/contexts/AuthContext'
import { DescriptionCombobox } from '@/components/DescriptionCombobox'
import { Check, Plus, Receipt, IndianRupee, ArrowRight } from 'lucide-react'

export function AddExpenseDialog() {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [paidBy, setPaidBy] = useState('')
  const [splitBetween, setSplitBetween] = useState<string[]>([])

  const participants = useSplitterStore((s) => s.participants)
  const addExpense = useSplitterStore((s) => s.addExpense)
  const saveDescription = useSplitterStore((s) => s.saveDescription)
  const { user } = useAuth()

  const numAmount = parseFloat(amount)
  const validAmount = !isNaN(numAmount) && numAmount > 0

  const splitCount = splitBetween.length
  const perPerson = validAmount && splitCount > 0 ? numAmount / splitCount : null
  const paidByName = participants.find((p) => p.id === paidBy)?.name ?? ''
  const allSelected = splitCount === participants.length

  // Who owes what to the payer (only people who didn't pay)
  const owedRows =
    validAmount && paidBy && splitCount > 0
      ? splitBetween
          .filter((id) => id !== paidBy)
          .map((id) => ({
            id,
            name: participants.find((p) => p.id === id)?.name ?? '',
            owes: perPerson!,
          }))
      : []

  const payerInSplit = paidBy && splitBetween.includes(paidBy)

  function label(p: { id: string; name: string; linkedUid?: string }) {
    const isMe = user?.uid && p.linkedUid === user.uid
    return isMe ? `${p.name} (you)` : p.name
  }

  function sublabel(p: { id: string; linkedUid?: string }) {
    if (user?.uid && p.linkedUid === user.uid) return 'Your account'
    if (p.linkedUid) return 'Member'
    return 'Not signed in yet'
  }

  const toggleSplit = (id: string) => {
    setSplitBetween((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const toggleAll = () => {
    setSplitBetween(allSelected ? [] : participants.map((p) => p.id))
  }

  const handleOpen = (val: boolean) => {
    setOpen(val)
    if (val) {
      setSplitBetween(participants.map((p) => p.id))
      // Auto-select the signed-in user as payer
      const me = participants.find((p) => user?.uid && p.linkedUid === user.uid)
      if (me) setPaidBy(me.id)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validAmount || !paidBy || splitCount === 0) return

    const finalDesc = description.trim() || 'Expense'
    // Auto-save non-default descriptions the user actually uses
    saveDescription(finalDesc)
    addExpense({
      amount: numAmount,
      description: finalDesc,
      paidBy,
      splitBetween,
    })
    setAmount('')
    setDescription('')
    setPaidBy('')
    setSplitBetween([])
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button size="lg" className="gap-2">
          <Plus className="h-5 w-5" />
          Add Expense
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            New Expense
          </DialogTitle>
          <DialogDescription>
            Enter the expense details. Everyone in the split will owe their share to the payer.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Amount */}
          <div className="space-y-1.5">
            <Label htmlFor="amount">Amount (₹)</Label>
            <div className="relative">
              <IndianRupee className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                className="pl-8"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Description combobox */}
          <DescriptionCombobox value={description} onChange={setDescription} />

          {/* Paid by */}
          <div className="space-y-1.5">
            <Label>Who paid?</Label>
            <p className="text-xs text-muted-foreground">
              This person covered the expense upfront. Others will owe them their share.
            </p>
            <Select value={paidBy} onValueChange={setPaidBy} required>
              <SelectTrigger>
                <SelectValue placeholder="Select who paid" />
              </SelectTrigger>
              <SelectContent>
                {participants.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    <div className="flex flex-col">
                      <span>{label(u)}</span>
                      <span className="text-xs text-muted-foreground">{sublabel(u)}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Split between */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div>
                <Label>Split between</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Tap to include / exclude someone from this expense.
                </p>
              </div>
              <button
                type="button"
                onClick={toggleAll}
                className="shrink-0 text-xs text-primary underline-offset-2 hover:underline"
              >
                {allSelected ? 'Deselect all' : 'Select all'}
              </button>
            </div>

            <div className="rounded-lg border divide-y overflow-hidden">
              {participants.map((u) => {
                const selected = splitBetween.includes(u.id)
                const isPayer = u.id === paidBy
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleSplit(u.id)}
                    className={`flex w-full items-center justify-between px-4 py-3 text-sm transition-colors
                      ${selected
                        ? 'bg-primary/8 text-foreground font-medium'
                        : 'bg-background text-muted-foreground hover:bg-muted/50'
                      }`}
                  >
                    <span className="flex items-center gap-3">
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors
                          ${selected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-muted-foreground/30'}`}
                      >
                        {selected && <Check className="h-3 w-3" strokeWidth={3} />}
                      </span>
                      <span className="flex flex-col items-start">
                        <span>{label(u)}</span>
                        {isPayer && selected && (
                          <span className="text-[10px] text-muted-foreground font-normal">
                            Paid — gets reimbursed
                          </span>
                        )}
                        {isPayer && !selected && (
                          <span className="text-[10px] text-muted-foreground font-normal">
                            Paid but excluded from split
                          </span>
                        )}
                      </span>
                    </span>
                    {selected && perPerson != null ? (
                      <span className="text-xs tabular-nums text-muted-foreground">
                        ₹{perPerson.toFixed(2)}
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>

            {splitCount === 0 ? (
              <p className="text-xs text-destructive">Select at least one person</p>
            ) : null}
          </div>

          {/* Live calculation summary */}
          {validAmount && paidBy && splitCount > 0 ? (
            <div className="rounded-lg bg-muted/60 px-4 py-3 space-y-2 text-sm">
              <p className="font-semibold text-foreground">How it splits</p>

              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <span>₹{numAmount.toFixed(2)}</span>
                <span>÷</span>
                <span>{splitCount} {splitCount === 1 ? 'person' : 'people'}</span>
                <span>=</span>
                <strong className="text-foreground">₹{perPerson!.toFixed(2)} each</strong>
              </div>

              {payerInSplit ? (
                <p className="text-xs text-muted-foreground">
                  <strong className="text-foreground">{paidByName}</strong> paid ₹{numAmount.toFixed(2)}{' '}
                  and keeps ₹{perPerson!.toFixed(2)} — the rest is owed back.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  <strong className="text-foreground">{paidByName}</strong> paid ₹{numAmount.toFixed(2)}{' '}
                  and is owed the full amount (not in the split).
                </p>
              )}

              {owedRows.length > 0 ? (
                <ul className="space-y-1 pt-1 border-t border-muted">
                  {owedRows.map((r) => (
                    <li key={r.id} className="flex items-center gap-1.5 text-xs">
                      <span className="font-medium text-foreground">{r.name}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground">owes</span>
                      <span className="font-semibold text-foreground tabular-nums">
                        ₹{r.owes.toFixed(2)}
                      </span>
                      <span className="text-muted-foreground">to {paidByName}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <Button
            type="submit"
            className="w-full"
            disabled={!validAmount || !paidBy || splitCount === 0}
          >
            Add Expense
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
