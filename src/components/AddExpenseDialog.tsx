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
import { Check, Plus, Receipt } from 'lucide-react'

export function AddExpenseDialog() {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [paidBy, setPaidBy] = useState('')
  const [splitBetween, setSplitBetween] = useState<string[]>([])

  const participants = useSplitterStore((s) => s.participants)
  const addExpense = useSplitterStore((s) => s.addExpense)

  const numAmount = parseFloat(amount)
  const validAmount = !isNaN(numAmount) && numAmount > 0

  const perPerson =
    validAmount && splitBetween.length > 0
      ? (numAmount / splitBetween.length).toFixed(2)
      : null

  const allSelected = splitBetween.length === participants.length

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
      // Pre-select everyone when the dialog opens
      setSplitBetween(participants.map((p) => p.id))
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validAmount || !paidBy || splitBetween.length === 0) return

    addExpense({
      amount: numAmount,
      description: description || 'Expense',
      paidBy,
      splitBetween: splitBetween.includes(paidBy) ? splitBetween : [...splitBetween, paidBy],
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            New Expense
          </DialogTitle>
          <DialogDescription className="sr-only">
            Enter amount, description, who paid, and who to split the expense with.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              placeholder="Dinner, groceries, etc."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Paid by</Label>
            <Select value={paidBy} onValueChange={setPaidBy} required>
              <SelectTrigger>
                <SelectValue placeholder="Who paid?" />
              </SelectTrigger>
              <SelectContent>
                {participants.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ── Split between ────────────────────────────── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Split between</Label>
              <button
                type="button"
                onClick={toggleAll}
                className="text-xs text-primary underline-offset-2 hover:underline"
              >
                {allSelected ? 'Deselect all' : 'Select all'}
              </button>
            </div>

            <div className="rounded-lg border divide-y overflow-hidden">
              {participants.map((u) => {
                const selected = splitBetween.includes(u.id)
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleSplit(u.id)}
                    className={`flex w-full items-center justify-between px-4 py-2.5 text-sm transition-colors
                      ${selected
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'bg-background text-muted-foreground hover:bg-muted'
                      }`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors
                          ${selected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'}`}
                      >
                        {selected && <Check className="h-3 w-3" strokeWidth={3} />}
                      </span>
                      {u.name}
                    </span>
                    {selected && perPerson ? (
                      <span className="text-xs tabular-nums text-muted-foreground">
                        ₹{perPerson} each
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>

            {splitBetween.length === 0 ? (
              <p className="text-xs text-destructive">Select at least one person</p>
            ) : perPerson ? (
              <p className="text-xs text-muted-foreground text-right">
                ₹{numAmount.toFixed(2)} ÷ {splitBetween.length} = <strong>₹{perPerson} per person</strong>
              </p>
            ) : null}
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={!validAmount || !paidBy || splitBetween.length === 0}
          >
            Add Expense
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
