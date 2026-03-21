import { useMemo } from "react";
import { useSplitterStore } from "@/stores/splitter-store";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Receipt, ArrowRight, Banknote, CalendarDays } from "lucide-react";
import type { Expense, Settlement } from "@/types";

function formatDate(iso: string) {
  // For YYYY-MM-DD date strings, parse as local date to avoid timezone shifts
  const d = iso.length === 10 ? new Date(`${iso}T00:00:00`) : new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = today.getTime() - target.getTime();
  if (diff === 0) return "Today";
  if (diff === 86400000) return "Yesterday";
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function HistoryView() {
  const expenses = useSplitterStore((s) => s.expenses);
  const settlements = useSplitterStore((s) => s.settlements);
  const history = useMemo(
    () =>
      [...expenses, ...settlements].sort((a, b) => {
        // Use the user-chosen date for expenses; createdAt for settlements
        const dateA = "date" in a && a.date ? a.date : a.createdAt;
        const dateB = "date" in b && b.date ? b.date : b.createdAt;
        const diff = new Date(dateB).getTime() - new Date(dateA).getTime();
        if (diff !== 0) return diff;
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      }),
    [expenses, settlements],
  );
  const participants = useSplitterStore((s) => s.participants);
  const deleteExpense = useSplitterStore((s) => s.deleteExpense);
  const deleteSettlement = useSplitterStore((s) => s.deleteSettlement);

  const getUserName = (id: string) =>
    participants.find((p) => p.id === id)?.name ?? id;

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
    );
  }

  return (
    <div className="space-y-2">
      {history.map((item) => {
        if ("splitBetween" in item) {
          const expense = item as Expense;
          const expDate = expense.date || expense.createdAt;
          return (
            <Card key={expense.id}>
              <CardContent className="py-3 px-4 space-y-2">
                {/* Top row: icon + description + amount */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="rounded-full bg-primary/10 p-2 shrink-0">
                      <Receipt className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">
                        {expense.description}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {getUserName(expense.paidBy)} paid
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-semibold">
                      ₹{expense.amount.toFixed(2)}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive h-7 px-2"
                      onClick={() => deleteExpense(expense.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
                {/* Date badge */}
                <div className="flex items-center gap-1.5 pl-11">
                  <CalendarDays className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    {formatDate(expDate)}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        } else {
          const settlement = item as Settlement;
          return (
            <Card
              key={settlement.id}
              className="border-green-500/30 bg-green-500/5"
            >
              <CardContent className="py-3 px-4 space-y-2">
                {/* Top row */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="rounded-full bg-green-500/20 p-2 shrink-0">
                      <Banknote className="h-4 w-4 text-green-600 dark:text-green-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium">Settlement</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        {getUserName(settlement.fromUser)}
                        <ArrowRight className="h-3 w-3 shrink-0" />
                        {getUserName(settlement.toUser)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="secondary" className="font-semibold">
                      ₹{settlement.amount.toFixed(2)}
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive h-7 px-2"
                      onClick={() => deleteSettlement(settlement.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
                {/* Date badge */}
                <div className="flex items-center gap-1.5 pl-11">
                  <CalendarDays className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    {formatDate(settlement.createdAt)}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        }
      })}
    </div>
  );
}
