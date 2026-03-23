/** Person in a group ledger (split math); may link to a Firebase user after they join */
export interface Participant {
  id: string;
  name: string;
  linkedUid?: string;
}

/** @deprecated Use Participant — kept for gradual migration */
export type User = Participant;

export interface Expense {
  id: string;
  amount: number;
  description: string;
  paidBy: string;
  splitBetween: string[];
  /** ISO date string of when the expense occurred (user-chosen), e.g. "2025-03-20" */
  date: string;
  createdAt: string;
  /** UID of the user who added this expense — used to exclude them from notifications */
  addedBy?: string;
}

export type PaymentMethod = 'cash' | 'upi' | 'bank' | 'card' | 'other'

export interface Settlement {
  id: string;
  fromUser: string;
  toUser: string;
  amount: number;
  createdAt: string;
  /** How the payment was made */
  paymentMethod?: PaymentMethod;
  /** UID of the user who recorded this settlement — used to exclude them from notifications */
  addedBy?: string;
}

export interface Balance {
  from: string;
  to: string;
  amount: number;
}

export interface GroupSummary {
  id: string;
  name: string;
  isOwner: boolean;
}
