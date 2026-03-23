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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Scale,
  ArrowRight,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Receipt,
  Banknote,
} from 'lucide-react'
import type { Balance, Expense, Settlement, PaymentMethod } from '@/types'

// ── Payment method config ────────────────────────────────────────────────────
const PAYMENT_METHODS: { value: PaymentMethod; label: string; emoji: string }[] = [
  { value: 'upi',   label: 'UPI',           emoji: '📲' },
  { value: 'cash',  label: 'Cash',          emoji: '💵' },
  { value: 'bank',  label: 'Bank Transfer', emoji: '🏦' },
  { value: 'card',  label: 'Card',          emoji: '💳' },
  { value: 'other', label: 'Other',         emoji: '💸' },
]

export function paymentMethodLabel(m?: PaymentMethod) {
  return PAYMENT_METHODS.find((p) => p.value === m)?.label ?? 'Unknown'
}
export function paymentMethodEmoji(m?: PaymentMethod) {
  return PAYMENT_METHODS.find((p) => p.value === m)?.emoji ?? '💸'
}

// ── Balance computation ──────────────────────────────────────────────────────
function computeBalances(
  users: { id: string }[],
  expenses: Expense[],
  settlements: Settlement[],
): Balance[] {
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

  settlements.forEach((s) => {
    raw[s.fromUser][s.toUser] = (raw[s.fromUser][s.toUser] ?? 0) - s.amount
  })

  const result: Balance[] = []
  const seen = new Set<string>()
  users.forEach((u) => {
    users.forEach((v) => {
      if (u.id === v.id) return
      const key = [u.id, v.id].sort().join('|')
      if (seen.has(key)) return
      seen.add(key)
      const net = (raw[u.id]?.[v.id] ?? 0) - (raw[v.id]?.[u.id] ?? 0)
      if (net > 0.005)       result.push({ from: u.id, to: v.id, amount: Math.round(net * 100) / 100 })
      else if (net < -0.005) result.push({ from: v.id, to: u.id, amount: Math.round(-net * 100) / 100 })
    })
  })
  return result
}

// ── Per-pair breakdown ───────────────────────────────────────────────────────
interface BreakdownLine {
  label: string
  date: string
  amount: number // positive = fromId owes toId; negative = reduces debt
  type: 'expense-debit' | 'expense-credit' | 'settlement'
}

function computeBreakdown(
  fromId: string,
  toId: string,
  expenses: Expense[],
  settlements: Settlement[],
  getName: (id: string) => string,
): BreakdownLine[] {
  const lines: BreakdownLine[] = []

  expenses.forEach((e) => {
    const per = e.amount / e.splitBetween.length
    // fromId in split, toId paid → fromId owes toId
    if (e.paidBy === toId && e.splitBetween.includes(fromId)) {
      lines.push({
        label: e.description,
        date: e.date || e.createdAt,
        amount: per,
        type: 'expense-debit',
      })
    }
    // toId in split, fromId paid → toId owes fromId (reduces fromId→toId debt)
    if (e.paidBy === fromId && e.splitBetween.includes(toId)) {
      lines.push({
        label: e.description,
        date: e.date || e.createdAt,
        amount: -per,
        type: 'expense-credit',
      })
    }
  })

  settlements.forEach((s) => {
    // fromId paid toId → reduces debt
    if (s.fromUser === fromId && s.toUser === toId) {
      lines.push({
        label: `Settlement${s.paymentMethod ? ` · ${paymentMethodLabel(s.paymentMethod)}` : ''}`,
        date: s.createdAt,
        amount: -s.amount,
        type: 'settlement',
      })
    }
    // toId paid fromId → increases debt (overpayment scenario)
    if (s.fromUser === toId && s.toUser === fromId) {
      lines.push({
        label: `Settlement${s.paymentMethod ? ` · ${paymentMethodLabel(s.paymentMethod)}` : ''} (reversed)`,
        date: s.createdAt,
        amount: s.amount,
        type: 'settlement',
      })
    }
  })

  // Sort by date
  lines.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  return lines
}

function formatDate(iso: string) {
  const d = iso.length === 10 ? new Date(`${iso}T00:00:00`) : new Date(iso)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Component ────────────────────────────────────────────────────────────────
export function BalancesView() {
  const { user } = useAuth()
  const participants = useSplitterStore((s) => s.participants)
  const expenses    = useSplitterStore((s) => s.expenses)
  const settlements = useSplitterStore((s) => s.settlements)
  const addSettlement = useSplitterStore((s) => s.addSettlement)

  const balances = useMemo(
    () => computeBalances(participants, expenses, settlements),
    [participants, expenses, settlements],
  )

  const [settleDialog, setSettleDialog] = useState<{ from: string; to: string; amount: number } | null>(null)
  const [settleAmount, setSettleAmount] = useState('')
  const [settleMethod, setSettleMethod] = useState<PaymentMethod | ''>('')
  // All breakdowns open by default; user can collapse individually
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const getName = (id: string) => participants.find((p) => p.id === id)?.name ?? id
  const myPid = user?.uid ? participants.find((p) => p.linkedUid === user.uid)?.id : undefined

  const myNet = useMemo(() => {
    if (!myPid) return null
    return Math.round(
      balances.reduce((acc, b) => {
        if (b.to === myPid) return acc + b.amount
        if (b.from === myPid) return acc - b.amount
        return acc
      }, 0) * 100,
    ) / 100
  }, [balances, myPid])

  const summaryCounterparty = useMemo(() => {
    if (!myPid || !myNet) return null
    const rows = myNet < 0
      ? balances.filter((b) => b.from === myPid).sort((a, b) => b.amount - a.amount)
      : balances.filter((b) => b.to === myPid).sort((a, b) => b.amount - a.amount)
    return rows[0] ? getName(myNet < 0 ? rows[0].to : rows[0].from) : null
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balances, myPid, myNet])

  const toggleExpand = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  const handleSettle = (e: React.FormEvent) => {
    e.preventDefault()
    if (!settleDialog) return
    const amount = parseFloat(settleAmount)
    if (isNaN(amount) || amount <= 0) return
    addSettlement({
      fromUser: settleDialog.from,
      toUser: settleDialog.to,
      amount,
      paymentMethod: settleMethod || undefined,
    })
    setSettleDialog(null)
    setSettleAmount('')
    setSettleMethod('')
  }

  if (balances.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Scale className="h-16 w-16 text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground text-center">All settled up! No one owes anyone.</p>
          <p className="text-sm text-muted-foreground mt-1">Add an expense to start tracking.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      {/* Net summary banner */}
      {myNet !== null && myNet !== 0 && summaryCounterparty && (
        <div className={`rounded-xl px-5 py-4 mb-4 flex items-center justify-between gap-4
          ${myNet > 0
            ? 'bg-[#5A9690]/10 border border-[#5A9690]/30'
            : 'bg-[#A0153E]/10 border border-[#A0153E]/30'}`}
        >
          <p className={`text-sm font-medium ${myNet > 0 ? 'text-[#5A9690]' : 'text-[#A0153E]'}`}>
            {myNet < 0
              ? <><span className="font-semibold">{getName(myPid ?? '')}</span> owes <span className="font-semibold">{summaryCounterparty}</span></>
              : <><span className="font-semibold">{summaryCounterparty}</span> owes <span className="font-semibold">{getName(myPid ?? '')}</span></>
            }
          </p>
          <p className={`text-xl font-bold tabular-nums shrink-0 ${myNet > 0 ? 'text-[#5A9690]' : 'text-[#A0153E]'}`}>
            ₹{Math.abs(myNet).toFixed(2)}
          </p>
        </div>
      )}

      <div className="space-y-3">
        {balances.map((b) => {
          const key = `${b.from}-${b.to}`
          const iOwe    = myPid === b.from
          const iAmOwed = myPid === b.to
          const isOpen  = !collapsed.has(key)
          const lines   = computeBreakdown(b.from, b.to, expenses, settlements, getName)
          const runningTotal = lines.reduce((acc, l) => acc + l.amount, 0)

          return (
            <Card
              key={key}
              className={
                iOwe    ? 'border-[#A0153E]/40 bg-[#A0153E]/5' :
                iAmOwed ? 'border-[#5A9690]/40 bg-[#5A9690]/5' : ''
              }
            >
              <CardContent className="py-4 px-4 space-y-3">
                {/* Main row */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <Badge
                      variant="secondary"
                      className={`font-normal ${iOwe ? 'bg-[#A0153E]/15 text-[#A0153E]' : ''}`}
                    >
                      {getName(b.from)}{iOwe && <span className="ml-1 opacity-70">(you)</span>}
                    </Badge>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <Badge
                      variant="outline"
                      className={`font-normal ${iAmOwed ? 'border-[#5A9690]/50 text-[#5A9690]' : ''}`}
                    >
                      {getName(b.to)}{iAmOwed && <span className="ml-1 opacity-70">(you)</span>}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <p className={`font-semibold text-lg leading-tight ${
                        iOwe ? 'text-[#A0153E]' : iAmOwed ? 'text-[#5A9690]' : ''
                      }`}>
                        ₹{b.amount.toFixed(2)}
                      </p>
                      {iOwe    && <p className="text-[10px] text-[#A0153E]/70 leading-none">you owe</p>}
                      {iAmOwed && <p className="text-[10px] text-[#5A9690]/70 leading-none">you get back</p>}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSettleDialog({ from: b.from, to: b.to, amount: b.amount })}
                    >
                      Settle
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="px-2 h-8 text-muted-foreground"
                      onClick={() => toggleExpand(key)}
                      title={isOpen ? 'Hide breakdown' : 'Show breakdown'}
                    >
                      {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                {/* Breakdown */}
                {isOpen && (
                  <div className="border-t pt-3 space-y-1.5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      How this balance is calculated
                    </p>

                    {lines.length === 0 && (
                      <p className="text-xs text-muted-foreground">No entries found.</p>
                    )}

                    {lines.map((line, i) => (
                      <div key={i} className="flex items-start justify-between gap-3 text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          {line.type === 'settlement' ? (
                            <Banknote className="h-3.5 w-3.5 shrink-0 text-[#5A9690]" />
                          ) : (
                            <Receipt className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          )}
                          <div className="min-w-0">
                            <span className={`truncate block ${
                              line.type === 'settlement' ? 'text-[#5A9690]' :
                              line.amount > 0 ? 'text-foreground' : 'text-muted-foreground'
                            }`}>
                              {line.label}
                            </span>
                            <span className="text-[10px] text-muted-foreground">{formatDate(line.date)}</span>
                          </div>
                        </div>
                        <span className={`tabular-nums font-medium shrink-0 ${
                          line.type === 'settlement' ? 'text-[#5A9690]' :
                          line.amount > 0 ? 'text-foreground' : 'text-muted-foreground'
                        }`}>
                          {line.amount < 0 ? '−' : '+'}₹{Math.abs(line.amount).toFixed(2)}
                        </span>
                      </div>
                    ))}

                    {/* Running total line */}
                    <div className="flex items-center justify-between pt-2 border-t text-sm font-semibold">
                      <span className="text-muted-foreground">Net balance</span>
                      <span className={runningTotal > 0 ? 'text-[#A0153E]' : 'text-[#5A9690]'}>
                        {runningTotal > 0
                          ? `${getName(b.from)} owes ₹${runningTotal.toFixed(2)}`
                          : runningTotal < 0
                          ? `${getName(b.to)} owes ₹${Math.abs(runningTotal).toFixed(2)}`
                          : 'Settled ✓'}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Settle dialog */}
      <Dialog open={!!settleDialog} onOpenChange={(open) => !open && setSettleDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              Record Settlement
            </DialogTitle>
            <DialogDescription className="sr-only">
              Enter the settlement amount and payment method.
            </DialogDescription>
          </DialogHeader>
          {settleDialog && (
            <form onSubmit={handleSettle} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Recording that{' '}
                <span className="font-semibold text-foreground">{getName(settleDialog.from)}</span>
                {' '}paid{' '}
                <span className="font-semibold text-foreground">{getName(settleDialog.to)}</span>
              </p>

              <div className="space-y-2">
                <Label htmlFor="settle-amount">Amount (₹)</Label>
                <Input
                  id="settle-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={settleDialog.amount.toString()}
                  value={settleAmount}
                  onChange={(e) => setSettleAmount(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="payment-method">Payment method</Label>
                <Select
                  value={settleMethod}
                  onValueChange={(v) => setSettleMethod(v as PaymentMethod)}
                >
                  <SelectTrigger id="payment-method">
                    <SelectValue placeholder="Select how it was paid" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.emoji} {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
