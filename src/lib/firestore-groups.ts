import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  setDoc,
  writeBatch,
} from 'firebase/firestore'
import { getFirebaseDb, isFirebaseConfigured } from './firebase'
import { normalizeInviteEmail, pendingInviteDocId } from './invite-utils'
import type { Participant, Expense, Settlement } from '@/types'

function db() {
  const d = getFirebaseDb()
  if (!d) throw new Error('Firebase not configured')
  return d
}

export type GroupDoc = {
  id: string
  name: string
  createdBy: string
  memberIds: string[]
  createdAt: string
}

export type PendingInviteDoc = {
  id: string
  groupId: string
  groupName: string
  emailLower: string
  invitedBy: string
  inviterName: string
  createdAt: string
}

export type OutboundInviteDoc = {
  id: string
  emailLower: string
  createdAt: string
}

function groupRef(groupId: string) {
  return doc(db(), 'groups', groupId)
}

function userGroupIndexRef(uid: string, groupId: string) {
  return doc(db(), 'userGroups', uid, 'groups', groupId)
}

/** Path-scoped invites so list reads satisfy rules (flat `where(emailLower==…)` queries often get permission-denied). */
function mailInviteItemRef(emailLower: string, inviteId: string) {
  return doc(db(), 'mailInvites', emailLower, 'items', inviteId)
}

function mapGroupDoc(d: { id: string; data: () => Record<string, unknown> }): GroupDoc {
  const x = d.data()
  return {
    id: d.id,
    name: String(x.name ?? 'Group'),
    createdBy: String(x.createdBy ?? ''),
    memberIds: Array.isArray(x.memberIds) ? x.memberIds.map(String) : [],
    createdAt: String(x.createdAt ?? ''),
  }
}

/**
 * Lists groups via `userGroups/{uid}/groups/*` then get() each group doc.
 * (Collection queries on `groups` with array-contains are often rejected by rules.)
 */
export async function fetchMyGroups(uid: string): Promise<GroupDoc[]> {
  const indexSnap = await getDocs(collection(db(), 'userGroups', uid, 'groups'))
  const groupIds = indexSnap.docs.map((d) => d.id)
  if (groupIds.length === 0) return []

  const snaps = await Promise.all(groupIds.map((id) => getDoc(groupRef(id))))
  const groups: GroupDoc[] = []
  for (const s of snaps) {
    if (!s.exists()) continue
    const g = mapGroupDoc(s)
    if (!g.memberIds.includes(uid)) continue
    groups.push(g)
  }
  return groups.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
}

/** Single group read (works when user is in memberIds). Used to repair list + index. */
export async function fetchGroupIfMember(
  uid: string,
  groupId: string
): Promise<GroupDoc | null> {
  const snap = await getDoc(groupRef(groupId))
  if (!snap.exists()) return null
  const g = mapGroupDoc(snap)
  return g.memberIds.includes(uid) ? g : null
}

/** Ensures membership index row exists (repair for groups created before the index). */
export async function ensureUserGroupIndex(uid: string, groupId: string): Promise<void> {
  await setDoc(
    userGroupIndexRef(uid, groupId),
    { joinedAt: new Date().toISOString() },
    { merge: true }
  )
}

export async function fetchPendingInvitesForEmail(email: string): Promise<PendingInviteDoc[]> {
  const el = normalizeInviteEmail(email)
  const snap = await getDocs(collection(db(), 'mailInvites', el, 'items'))
  return snap.docs.map((d) => {
    const x = d.data()
    return {
      id: d.id,
      groupId: String(x.groupId ?? ''),
      groupName: String(x.groupName ?? 'Group'),
      emailLower: String(x.emailLower ?? ''),
      invitedBy: String(x.invitedBy ?? ''),
      inviterName: String(x.inviterName ?? 'Someone'),
      createdAt: String(x.createdAt ?? ''),
    }
  })
}

export async function fetchOutboundInvites(groupId: string): Promise<OutboundInviteDoc[]> {
  const snap = await getDocs(collection(db(), 'groups', groupId, 'outboundInvites'))
  return snap.docs.map((d) => ({
    id: d.id,
    emailLower: String(d.data().emailLower ?? ''),
    createdAt: String(d.data().createdAt ?? ''),
  }))
}

export async function createGroup(
  ownerUid: string,
  ownerName: string,
  ownerEmail: string,
  name: string
): Promise<string> {
  const groupId = crypto.randomUUID()
  const now = new Date().toISOString()
  const participantId = crypto.randomUUID()

  // Commit the group doc first. Rules use get(group) for subcollections; same-batch
  // writes only see pre-commit state, so members/participants would otherwise be denied.
  const first = writeBatch(db())
  first.set(groupRef(groupId), {
    name: name.trim() || 'New group',
    createdBy: ownerUid,
    memberIds: [ownerUid],
    createdAt: now,
  })
  await first.commit()

  const second = writeBatch(db())
  second.set(doc(db(), 'groups', groupId, 'members', ownerUid), {
    displayName: ownerName,
    email: ownerEmail,
    joinedAt: now,
  })
  second.set(doc(db(), 'groups', groupId, 'participants', participantId), {
    name: ownerName || 'You',
    linkedUid: ownerUid,
  })
  second.set(userGroupIndexRef(ownerUid, groupId), {
    joinedAt: now,
  })
  await second.commit()

  return groupId
}

export async function createPendingInvite(
  groupId: string,
  groupName: string,
  inviteeEmail: string,
  inviterUid: string,
  inviterName: string
): Promise<string> {
  const emailLower = normalizeInviteEmail(inviteeEmail)
  const id = pendingInviteDocId(groupId, emailLower)
  const now = new Date().toISOString()
  const batch = writeBatch(db())

  batch.set(mailInviteItemRef(emailLower, id), {
    groupId,
    groupName,
    emailLower,
    invitedBy: inviterUid,
    inviterName,
    createdAt: now,
  })

  batch.set(doc(db(), 'groups', groupId, 'outboundInvites', id), {
    emailLower,
    createdAt: now,
  })

  await batch.commit()
  return id
}

export async function acceptInvite(
  invite: PendingInviteDoc,
  uid: string,
  displayName: string,
  email: string
): Promise<void> {
  const { groupId } = invite
  const inviteEmail = normalizeInviteEmail(invite.emailLower)
  const signedInEmail = normalizeInviteEmail(email)
  if (inviteEmail !== signedInEmail) {
    throw new Error(
      `This invite is for ${invite.emailLower}. Sign out and sign in with that Google account, then try again.`
    )
  }

  const now = new Date().toISOString()
  const participantId = crypto.randomUUID()
  const gRef = groupRef(groupId)
  const invRef = mailInviteItemRef(inviteEmail, invite.id)

  // Full memberIds array (not arrayUnion) so security rules can verify the update.
  // Always call transaction.update so the transaction is never empty.
  await runTransaction(db(), async (transaction) => {
    const gSnap = await transaction.get(gRef)
    if (!gSnap.exists()) throw new Error('Group not found')
    const data = gSnap.data()
    let memberIds: string[] = Array.isArray(data.memberIds)
      ? data.memberIds.map(String)
      : []

    if (!memberIds.includes(uid)) {
      const invSnap = await transaction.get(invRef)
      if (!invSnap.exists()) {
        throw new Error('Invite not found. Ask the host to send a new invite.')
      }
      memberIds = [...memberIds, uid]
    }

    transaction.update(gRef, { memberIds })
  })

  // Now isGroupMember(uid). Remove invites and add profile + ledger rows.
  const second = writeBatch(db())
  second.delete(mailInviteItemRef(normalizeInviteEmail(invite.emailLower), invite.id))
  second.delete(doc(db(), 'groups', groupId, 'outboundInvites', invite.id))
  second.set(doc(db(), 'groups', groupId, 'members', uid), {
    displayName,
    email,
    joinedAt: now,
  })
  second.set(doc(db(), 'groups', groupId, 'participants', participantId), {
    name: displayName || email,
    linkedUid: uid,
  })
  second.set(userGroupIndexRef(uid, groupId), {
    joinedAt: now,
  })
  await second.commit()
}

export async function cancelInvite(groupId: string, inviteeEmail: string): Promise<void> {
  const emailLower = normalizeInviteEmail(inviteeEmail)
  const id = pendingInviteDocId(groupId, emailLower)
  const batch = writeBatch(db())
  batch.delete(mailInviteItemRef(emailLower, id))
  batch.delete(doc(db(), 'groups', groupId, 'outboundInvites', id))
  await batch.commit()
}

export async function declineInvite(invite: PendingInviteDoc): Promise<void> {
  const el = normalizeInviteEmail(invite.emailLower)
  const ref = mailInviteItemRef(el, invite.id)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const groupId = String(snap.data().groupId ?? '')
  const batch = writeBatch(db())
  batch.delete(ref)
  batch.delete(doc(db(), 'groups', groupId, 'outboundInvites', invite.id))
  await batch.commit()
}

// --- Ledger (scoped) ---

export async function fetchParticipants(groupId: string): Promise<Participant[]> {
  const snap = await getDocs(collection(db(), 'groups', groupId, 'participants'))
  return snap.docs.map((d) => {
    const x = d.data()
    return {
      id: d.id,
      name: String(x.name ?? ''),
      linkedUid: x.linkedUid ? String(x.linkedUid) : undefined,
    }
  })
}

export async function fetchExpenses(groupId: string): Promise<Expense[]> {
  const snap = await getDocs(collection(db(), 'groups', groupId, 'expenses'))
  const list = snap.docs.map((d) => {
    const x = d.data()
    return {
      id: d.id,
      amount: Number(x.amount),
      description: String(x.description ?? ''),
      paidBy: String(x.paidBy),
      splitBetween: Array.isArray(x.splitBetween) ? x.splitBetween.map(String) : [],
      createdAt: String(x.createdAt ?? ''),
    }
  })
  return list.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
}

export async function fetchSettlements(groupId: string): Promise<Settlement[]> {
  const snap = await getDocs(collection(db(), 'groups', groupId, 'settlements'))
  const list = snap.docs.map((d) => {
    const x = d.data()
    return {
      id: d.id,
      fromUser: String(x.fromUser),
      toUser: String(x.toUser),
      amount: Number(x.amount),
      createdAt: String(x.createdAt ?? ''),
    }
  })
  return list.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
}

export async function insertParticipant(groupId: string, p: Participant): Promise<void> {
  await setDoc(doc(db(), 'groups', groupId, 'participants', p.id), {
    name: p.name,
    ...(p.linkedUid ? { linkedUid: p.linkedUid } : {}),
  })
}

export async function deleteParticipant(groupId: string, id: string): Promise<void> {
  await deleteDoc(doc(db(), 'groups', groupId, 'participants', id))
}

export async function insertExpense(groupId: string, expense: Expense): Promise<void> {
  await setDoc(doc(db(), 'groups', groupId, 'expenses', expense.id), {
    amount: expense.amount,
    description: expense.description,
    paidBy: expense.paidBy,
    splitBetween: expense.splitBetween,
    createdAt: expense.createdAt,
  })
}

export async function insertSettlement(groupId: string, settlement: Settlement): Promise<void> {
  await setDoc(doc(db(), 'groups', groupId, 'settlements', settlement.id), {
    fromUser: settlement.fromUser,
    toUser: settlement.toUser,
    amount: settlement.amount,
    createdAt: settlement.createdAt,
  })
}

export async function deleteExpense(groupId: string, id: string): Promise<void> {
  await deleteDoc(doc(db(), 'groups', groupId, 'expenses', id))
}

export { isFirebaseConfigured }
