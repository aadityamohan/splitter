import { useMemo } from 'react'
import { useSplitterStore } from '@/stores/splitter-store'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Receipt, ArrowRight, Banknote } from 'lucide-react'
import type { Expense, Settlement } from '@/types'

function formatDate(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 86400000) return 'Today'
  if (diff < 172800000) return 'Yesterday'
  return d.toLocaleDateString()
}

export function HistoryView() {
  const expenses = useSplitterStore((s) => s.expenses)
  const settlements = useSplitterStore((s) => s.settlements)
  const history = useMemo(
    () =>
      [...expenses, ...settlements].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [expenses, settlements]
  )
  const participants = useSplitterStore((s) => s.participants)
  const deleteExpense = useSplitterStore((s) => s.deleteExpense)

  const getUserName = (id: string) =>
    participants.find((p) => p.id === id)?.name ?? id

  if (history.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Receipt className="h-16 w-16 text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground text-center">
            No expenses or settlements yet.
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Add an expense to get started.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-2">
      {history.map((item) => {
        if ('splitBetween' in item) {
          const expense = item as Expense
          return (
            <Card key={expense.id}>
              <CardContent className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-primary/10 p-2">
                    <Receipt className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{expense.description}</p>
                    <p className="text-sm text-muted-foreground">
                      {getUserName(expense.paidBy)} paid • {formatDate(expense.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">₹{expense.amount.toFixed(2)}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => deleteExpense(expense.id)}
                  >
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        } else {
          const settlement = item as Settlement
          return (
            <Card key={settlement.id} className="border-green-500/30 bg-green-500/5">
              <CardContent className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-green-500/20 p-2">
                    <Banknote className="h-4 w-4 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="font-medium">Settlement</p>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      {getUserName(settlement.fromUser)}
                      <ArrowRight className="h-3 w-3" />
                      {getUserName(settlement.toUser)} • {formatDate(settlement.createdAt)}
                    </p>
                  </div>
                </div>
                <Badge variant="secondary" className="font-semibold">
                  ₹{settlement.amount.toFixed(2)}
                </Badge>
              </CardContent>
            </Card>
          )
        }
      })}
    </div>
  )
}
