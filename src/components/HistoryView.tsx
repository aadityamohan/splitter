import { useMemo, useState } from "react";
import { useSplitterStore } from "@/stores/splitter-store";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Receipt, ArrowRight, Banknote, CalendarDays, Pencil, Trash2 } from "lucide-react";
import type { Expense, Settlement } from "@/types";
import { AddExpenseDialog } from "@/components/AddExpenseDialog";
import { paymentMethodLabel, paymentMethodEmoji } from "@/components/BalancesView";
import { useAuth } from "@/contexts/AuthContext";

type PendingDelete =
  | { kind: "expense"; item: Expense }
  | { kind: "settlement"; item: Settlement };

function formatDate(iso: string) {
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
  const { user } = useAuth();
  const expenses = useSplitterStore((s) => s.expenses);
  const settlements = useSplitterStore((s) => s.settlements);
  const participants = useSplitterStore((s) => s.participants);
  const deleteExpense = useSplitterStore((s) => s.deleteExpense);
  const deleteSettlement = useSplitterStore((s) => s.deleteSettlement);

  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

  const history = useMemo(
    () =>
      [...expenses, ...settlements].sort((a, b) => {
        const dateA = "date" in a && a.date ? a.date : a.createdAt;
        const dateB = "date" in b && b.date ? b.date : b.createdAt;
        const diff = new Date(dateB).getTime() - new Date(dateA).getTime();
        if (diff !== 0) return diff;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }),
    [expenses, settlements],
  );

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
    <>
      {/* Edit dialog — rendered once, driven by editingExpense state */}
      {editingExpense && (
        <AddExpenseDialog
          expense={editingExpense}
          open={Boolean(editingExpense)}
          onOpenChange={(open) => { if (!open) setEditingExpense(null); }}
        />
      )}

      {/* ── Confirm-delete dialog ── */}
      <Dialog
        open={!!pendingDelete}
        onOpenChange={(open) => { if (!open) setPendingDelete(null); }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Confirm delete
            </DialogTitle>
            <DialogDescription>
              {pendingDelete?.kind === "expense" ? (
                <>
                  Delete expense{" "}
                  <span className="font-semibold text-foreground">
                    "{pendingDelete.item.description}"
                  </span>{" "}
                  for{" "}
                  <span className="font-semibold text-foreground">
                    ₹{pendingDelete.item.amount.toFixed(2)}
                  </span>
                  ? This will recalculate all balances.
                </>
              ) : pendingDelete?.kind === "settlement" ? (
                <>
                  Delete this settlement of{" "}
                  <span className="font-semibold text-foreground">
                    ₹{pendingDelete.item.amount.toFixed(2)}
                  </span>{" "}
                  from{" "}
                  <span className="font-semibold text-foreground">
                    {getUserName(pendingDelete.item.fromUser)}
                  </span>{" "}
                  to{" "}
                  <span className="font-semibold text-foreground">
                    {getUserName(pendingDelete.item.toUser)}
                  </span>
                  ? The original debt will reappear.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!pendingDelete) return;
                if (pendingDelete.kind === "expense") deleteExpense(pendingDelete.item.id);
                else deleteSettlement(pendingDelete.item.id);
                setPendingDelete(null);
              }}
            >
              Yes, delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="space-y-2">
        {history.map((item) => {
          if ("splitBetween" in item) {
            const expense = item as Expense;
            const expDate = expense.date || expense.createdAt;
            return (
              <Card key={expense.id}>
                <CardContent className="py-3 px-4 space-y-2">
                  {/* Top row */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="rounded-full bg-primary/10 p-2 shrink-0">
                        <Receipt className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{expense.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {getUserName(expense.paidBy)} paid · split between{" "}
                          {expense.splitBetween.map(getUserName).join(", ")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="font-semibold">₹{expense.amount.toFixed(2)}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-muted-foreground hover:text-foreground"
                        onClick={() => setEditingExpense(expense)}
                        title="Edit expense"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive h-7 px-2 gap-1"
                        onClick={() => setPendingDelete({ kind: "expense", item: expense })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </div>
                  </div>
                  {/* Date */}
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
            const canDelete = !settlement.addedBy || settlement.addedBy === user?.uid;
            return (
              <Card
                key={settlement.id}
                className="border-[#5A9690]/30 bg-[#5A9690]/5"
              >
                <CardContent className="py-3 px-4 space-y-2">
                  {/* Top row */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="rounded-full bg-[#5A9690]/20 p-2 shrink-0">
                        <Banknote className="h-4 w-4 text-[#5A9690]" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-[#5A9690]">Settlement</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <span className="font-medium text-foreground">
                            {getUserName(settlement.fromUser)}
                          </span>
                          <ArrowRight className="h-3 w-3 shrink-0" />
                          <span className="font-medium text-foreground">
                            {getUserName(settlement.toUser)}
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge
                        variant="secondary"
                        className="font-semibold text-[#5A9690] bg-[#5A9690]/10 border-[#5A9690]/20"
                      >
                        ₹{settlement.amount.toFixed(2)}
                      </Badge>
                      {canDelete && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive h-7 px-2 gap-1"
                          onClick={() => setPendingDelete({ kind: "settlement", item: settlement })}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                  {/* Date + payment method */}
                  <div className="flex items-center gap-3 pl-11 flex-wrap">
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarDays className="h-3 w-3" />
                      {formatDate(settlement.createdAt)}
                    </span>
                    {settlement.paymentMethod ? (
                      <span className="flex items-center gap-1 text-xs font-medium text-[#5A9690] bg-[#5A9690]/10 px-2 py-0.5 rounded-full">
                        <span>{paymentMethodEmoji(settlement.paymentMethod)}</span>
                        <span>{paymentMethodLabel(settlement.paymentMethod)}</span>
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground/60 italic">
                        payment method not recorded
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          }
        })}
      </div>
    </>
  );
}
