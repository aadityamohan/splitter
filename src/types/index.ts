/** Person in a group ledger (split math); may link to a Firebase user after they join */
export interface Participant {
  id: string
  name: string
  linkedUid?: string
}

/** @deprecated Use Participant — kept for gradual migration */
export type User = Participant

export interface Expense {
  id: string
  amount: number
  description: string
  paidBy: string
  splitBetween: string[]
  createdAt: string
}

export interface Settlement {
  id: string
  fromUser: string
  toUser: string
  amount: number
  createdAt: string
}

export interface Balance {
  from: string
  to: string
  amount: number
}

export interface GroupSummary {
  id: string
  name: string
  isOwner: boolean
}
