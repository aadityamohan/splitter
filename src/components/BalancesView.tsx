import { useMemo, useState } from 'react'
import { useSplitterStore } from '@/stores/splitter-store'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Scale, ArrowRight, CheckCircle } from 'lucide-react'
import type { Balance } from '@/types'

function computeBalances(
  users: { id: string }[],
  expenses: { amount: number; paidBy: string; splitBetween: string[] }[],
  settlements: { fromUser: string; toUser: string; amount: number }[]
): Balance[] {
  const balances: Record<string, Record<string, number>> = {}
  users.forEach((u) => {
    balances[u.id] = {}
    users.forEach((v) => {
      if (u.id !== v.id) balances[u.id][v.id] = 0
    })
  })
  expenses.forEach((e) => {
    const amountPerPerson = e.amount / e.splitBetween.length
    e.splitBetween.forEach((userId) => {
      if (userId !== e.paidBy) {
        balances[userId][e.paidBy] = (balances[userId][e.paidBy] ?? 0) + amountPerPerson
      }
    })
  })
  settlements.forEach((s) => {
    balances[s.fromUser][s.toUser] = (balances[s.fromUser][s.toUser] ?? 0) - s.amount
  })
  const result: Balance[] = []
  users.forEach((from) => {
    users.forEach((to) => {
      if (from.id !== to.id) {
        const amount = balances[from.id]?.[to.id] ?? 0
        if (amount > 0) {
          result.push({ from: from.id, to: to.id, amount: Math.round(amount * 100) / 100 })
        }
      }
    })
  })
  return result
}

export function BalancesView() {
  const participants = useSplitterStore((s) => s.participants)
  const expenses = useSplitterStore((s) => s.expenses)
  const settlements = useSplitterStore((s) => s.settlements)
  const balances = useMemo(
    () => computeBalances(participants, expenses, settlements),
    [participants, expenses, settlements]
  )
  const addSettlement = useSplitterStore((s) => s.addSettlement)
  const [settleDialog, setSettleDialog] = useState<{
    from: string
    to: string
    amount: number
  } | null>(null)
  const [settleAmount, setSettleAmount] = useState('')

  const getUserName = (id: string) =>
    participants.find((p) => p.id === id)?.name ?? id

  const handleSettle = (e: React.FormEvent) => {
    e.preventDefault()
    if (!settleDialog) return
    const amount = parseFloat(settleAmount)
    if (isNaN(amount) || amount <= 0) return

    addSettlement({
      fromUser: settleDialog.from,
      toUser: settleDialog.to,
      amount,
    })
    setSettleDialog(null)
    setSettleAmount('')
  }

  if (balances.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Scale className="h-16 w-16 text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground text-center">
            All settled up! No one owes anyone.
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Add an expense to start tracking.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <div className="space-y-3">
        {balances.map((b) => (
          <Card key={`${b.from}-${b.to}`}>
            <CardContent className="flex items-center justify-between py-4">
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="font-normal">
                  {getUserName(b.from)}
                </Badge>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <Badge variant="outline" className="font-normal">
                  {getUserName(b.to)}
                </Badge>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold text-lg">
                  ₹{b.amount.toFixed(2)}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setSettleDialog({
                      from: b.from,
                      to: b.to,
                      amount: b.amount,
                    })
                  }
                >
                  Settle
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog
        open={!!settleDialog}
        onOpenChange={(open) => !open && setSettleDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              Record Settlement
            </DialogTitle>
            <DialogDescription className="sr-only">
              Enter the amount paid to settle this balance between two people.
            </DialogDescription>
          </DialogHeader>
          {settleDialog && (
            <form onSubmit={handleSettle} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {getUserName(settleDialog.from)} paid {getUserName(settleDialog.to)}{' '}
                ₹{settleDialog.amount.toFixed(2)}
              </p>
              <div className="space-y-2">
                <Label htmlFor="settle-amount">Amount</Label>
                <Input
                  id="settle-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={settleDialog.amount.toString()}
                  value={settleAmount}
                  onChange={(e) => setSettleAmount(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full">
                Record Settlement
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
