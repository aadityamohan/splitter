import { useMemo, useState } from 'react'
import { useSplitterStore } from '@/stores/splitter-store'
import { useAuth } from '@/contexts/AuthContext'
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
  // raw[A][B] = raw amount A owes B (before netting with raw[B][A])
  const raw: Record<string, Record<string, number>> = {}
  users.forEach((u) => {
    raw[u.id] = {}
    users.forEach((v) => { if (u.id !== v.id) raw[u.id][v.id] = 0 })
  })

  expenses.forEach((e) => {
    const perPerson = e.amount / e.splitBetween.length
    e.splitBetween.forEach((uid) => {
      if (uid !== e.paidBy) raw[uid][e.paidBy] = (raw[uid][e.paidBy] ?? 0) + perPerson
    })
  })

  // Settlements reduce (or flip) what the payer owed
  settlements.forEach((s) => {
    raw[s.fromUser][s.toUser] = (raw[s.fromUser][s.toUser] ?? 0) - s.amount
  })

  // Net each pair: if A→B and B→A both have amounts, subtract smaller from larger.
  // This also handles overpayments where raw[A][B] went negative.
  const result: Balance[] = []
  const seen = new Set<string>()

  users.forEach((u) => {
    users.forEach((v) => {
      if (u.id === v.id) return
      const key = [u.id, v.id].sort().join('|')
      if (seen.has(key)) return
      seen.add(key)

      const netAmount = (raw[u.id]?.[v.id] ?? 0) - (raw[v.id]?.[u.id] ?? 0)

      if (netAmount > 0.005) {
        result.push({ from: u.id, to: v.id, amount: Math.round(netAmount * 100) / 100 })
      } else if (netAmount < -0.005) {
        result.push({ from: v.id, to: u.id, amount: Math.round(-netAmount * 100) / 100 })
      }
    })
  })

  return result
}

export function BalancesView() {
  const { user } = useAuth()
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

  // Find the current user's participant ID
  const myParticipantId = user?.uid
    ? participants.find((p) => p.linkedUid === user.uid)?.id
    : undefined

  // Net across all balances: positive = I get back, negative = I owe
  const myNet = useMemo(() => {
    if (!myParticipantId) return null
    return Math.round(
      balances.reduce((acc, b) => {
        if (b.to === myParticipantId) return acc + b.amount
        if (b.from === myParticipantId) return acc - b.amount
        return acc
      }, 0) * 100
    ) / 100
  }, [balances, myParticipantId])

  // Pick the "main" counterparty for the summary sentence
  const myName = getUserName(myParticipantId ?? '')
  const summaryCounterparty = useMemo(() => {
    if (!myParticipantId || myNet === null || myNet === 0) return null
    if (myNet < 0) {
      // I owe — find who I owe the most to
      const row = balances
        .filter((b) => b.from === myParticipantId)
        .sort((a, b) => b.amount - a.amount)[0]
      return row ? getUserName(row.to) : null
    } else {
      // I'm owed — find who owes me the most
      const row = balances
        .filter((b) => b.to === myParticipantId)
        .sort((a, b) => b.amount - a.amount)[0]
      return row ? getUserName(row.from) : null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balances, myParticipantId, myNet])

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
      {/* ── Net balance summary ── */}
      {myNet !== null && myNet !== 0 && summaryCounterparty && (
        <div className={`rounded-xl px-5 py-4 mb-4 flex items-center justify-between gap-4
          ${myNet > 0
            ? 'bg-green-500/10 border border-green-500/30'
            : 'bg-destructive/10 border border-destructive/30'
          }`}
        >
          <p className={`text-sm font-medium ${myNet > 0 ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
            {myNet < 0
              ? <><span className="font-semibold">{myName}</span> owes <span className="font-semibold">{summaryCounterparty}</span></>
              : <><span className="font-semibold">{summaryCounterparty}</span> owes <span className="font-semibold">{myName}</span></>
            }
          </p>
          <p className={`text-xl font-bold tabular-nums shrink-0 ${myNet > 0 ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
            ₹{Math.abs(myNet).toFixed(2)}
          </p>
        </div>
      )}

      <div className="space-y-3">
        {balances.map((b) => {
          const iOwe = myParticipantId === b.from        // I owe someone
          const iAmOwed = myParticipantId === b.to       // someone owes me

          return (
            <Card
              key={`${b.from}-${b.to}`}
              className={
                iOwe
                  ? 'border-destructive/40 bg-destructive/5'
                  : iAmOwed
                  ? 'border-green-500/40 bg-green-500/5'
                  : ''
              }
            >
              <CardContent className="flex items-center justify-between py-4 gap-3">
                {/* Names + arrow */}
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <Badge
                    variant="secondary"
                    className={`font-normal ${iOwe ? 'bg-destructive/15 text-destructive' : ''}`}
                  >
                    {getUserName(b.from)}
                    {iOwe && <span className="ml-1 opacity-70">(you)</span>}
                  </Badge>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <Badge
                    variant="outline"
                    className={`font-normal ${iAmOwed ? 'border-green-500/50 text-green-600 dark:text-green-400' : ''}`}
                  >
                    {getUserName(b.to)}
                    {iAmOwed && <span className="ml-1 opacity-70">(you)</span>}
                  </Badge>
                </div>

                {/* Amount + label + button */}
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className={`font-semibold text-lg leading-tight ${
                      iOwe
                        ? 'text-destructive'
                        : iAmOwed
                        ? 'text-green-600 dark:text-green-400'
                        : ''
                    }`}>
                      ₹{b.amount.toFixed(2)}
                    </p>
                    {iOwe && (
                      <p className="text-[10px] text-destructive/70 leading-none">you owe</p>
                    )}
                    {iAmOwed && (
                      <p className="text-[10px] text-green-600/70 dark:text-green-400/70 leading-none">you get back</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSettleDialog({ from: b.from, to: b.to, amount: b.amount })}
                  >
                    Settle
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
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
