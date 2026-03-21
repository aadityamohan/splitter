import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  runTransaction,
  setDoc,
  writeBatch,
  type QuerySnapshot,
  type DocumentData,
} from "firebase/firestore";
import { getFirebaseDb, isFirebaseConfigured } from "./firebase";
import { normalizeInviteEmail, pendingInviteDocId } from "./invite-utils";
import type { Participant, Expense, Settlement } from "@/types";

function db() {
  const d = getFirebaseDb();
  if (!d) throw new Error("Firebase not configured");
  return d;
}

export type GroupDoc = {
  id: string;
  name: string;
  createdBy: string;
  memberIds: string[];
  createdAt: string;
};

export type ContactType = "email" | "phone";

export type PendingInviteDoc = {
  id: string;
  groupId: string;
  groupName: string;
  emailLower: string; // empty string for phone invites
  phone: string; // empty string for email invites (E.164 format)
  contactType: ContactType;
  invitedBy: string;
  inviterName: string;
  createdAt: string;
};

export type OutboundInviteDoc = {
  id: string;
  emailLower: string; // empty for phone invites
  phone: string; // empty for email invites
  contactType: ContactType;
  createdAt: string;
};

function groupRef(groupId: string) {
  return doc(db(), "groups", groupId);
}

function userGroupIndexRef(uid: string, groupId: string) {
  return doc(db(), "userGroups", uid, "groups", groupId);
}

/** Path-scoped invites so list reads satisfy rules (flat `where(emailLower==…)` queries often get permission-denied). */
function mailInviteItemRef(emailLower: string, inviteId: string) {
  return doc(db(), "mailInvites", emailLower, "items", inviteId);
}

/** Phone invites keyed by E.164 number (e.g. +911234567890). */
function phoneInviteItemRef(phone: string, inviteId: string) {
  return doc(db(), "phoneInvites", phone, "items", inviteId);
}

/** Normalizes a phone to E.164 (keeps leading +, strips spaces/dashes). */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/[\s\-().]/g, "");
  return digits.startsWith("+") ? digits : `+${digits}`;
}

export function pendingPhoneInviteDocId(
  groupId: string,
  phone: string,
): string {
  return `${groupId}|${normalizePhone(phone)}`;
}

function mapGroupDoc(d: {
  id: string;
  data: () => Record<string, unknown>;
}): GroupDoc {
  const x = d.data();
  return {
    id: d.id,
    name: String(x.name ?? "Group"),
    createdBy: String(x.createdBy ?? ""),
    memberIds: Array.isArray(x.memberIds) ? x.memberIds.map(String) : [],
    createdAt: String(x.createdAt ?? ""),
  };
}

/**
 * Lists groups via `userGroups/{uid}/groups/*` then get() each group doc.
 * (Collection queries on `groups` with array-contains are often rejected by rules.)
 */
export async function fetchMyGroups(uid: string): Promise<GroupDoc[]> {
  const indexSnap = await getDocs(
    collection(db(), "userGroups", uid, "groups"),
  );
  const groupIds = indexSnap.docs.map((d) => d.id);
  if (groupIds.length === 0) return [];

  const snaps = await Promise.all(groupIds.map((id) => getDoc(groupRef(id))));
  const groups: GroupDoc[] = [];
  for (const s of snaps) {
    if (!s.exists()) continue;
    const g = mapGroupDoc(s);
    if (!g.memberIds.includes(uid)) continue;
    groups.push(g);
  }
  return groups.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

/** Single group read (works when user is in memberIds). Used to repair list + index. */
export async function fetchGroupIfMember(
  uid: string,
  groupId: string,
): Promise<GroupDoc | null> {
  const snap = await getDoc(groupRef(groupId));
  if (!snap.exists()) return null;
  const g = mapGroupDoc(snap);
  return g.memberIds.includes(uid) ? g : null;
}

/** Ensures membership index row exists (repair for groups created before the index). */
export async function ensureUserGroupIndex(
  uid: string,
  groupId: string,
): Promise<void> {
  await setDoc(
    userGroupIndexRef(uid, groupId),
    { joinedAt: new Date().toISOString() },
    { merge: true },
  );
}

function mapPendingInviteDoc(d: {
  id: string;
  data: () => Record<string, unknown>;
}): PendingInviteDoc {
  const x = d.data();
  return {
    id: d.id,
    groupId: String(x.groupId ?? ""),
    groupName: String(x.groupName ?? "Group"),
    emailLower: String(x.emailLower ?? ""),
    phone: String(x.phone ?? ""),
    contactType: (x.contactType as ContactType) ?? "email",
    invitedBy: String(x.invitedBy ?? ""),
    inviterName: String(x.inviterName ?? "Someone"),
    createdAt: String(x.createdAt ?? ""),
  };
}

export async function fetchPendingInvitesForEmail(
  email: string,
): Promise<PendingInviteDoc[]> {
  const el = normalizeInviteEmail(email);
  const snap = await getDocs(collection(db(), "mailInvites", el, "items"));
  return snap.docs.map(mapPendingInviteDoc);
}

export async function fetchPendingInvitesForPhone(
  phone: string,
): Promise<PendingInviteDoc[]> {
  const p = normalizePhone(phone);
  const snap = await getDocs(collection(db(), "phoneInvites", p, "items"));
  return snap.docs.map(mapPendingInviteDoc);
}

export async function fetchOutboundInvites(
  groupId: string,
): Promise<OutboundInviteDoc[]> {
  const snap = await getDocs(
    collection(db(), "groups", groupId, "outboundInvites"),
  );
  return snap.docs.map((d) => ({
    id: d.id,
    emailLower: String(d.data().emailLower ?? ""),
    phone: String(d.data().phone ?? ""),
    contactType: (d.data().contactType as ContactType) ?? "email",
    createdAt: String(d.data().createdAt ?? ""),
  }));
}

export async function createGroup(
  ownerUid: string,
  ownerName: string,
  ownerEmail: string,
  name: string,
): Promise<string> {
  const groupId = crypto.randomUUID();
  const now = new Date().toISOString();
  const participantId = crypto.randomUUID();

  // Commit the group doc first. Rules use get(group) for subcollections; same-batch
  // writes only see pre-commit state, so members/participants would otherwise be denied.
  const first = writeBatch(db());
  first.set(groupRef(groupId), {
    name: name.trim() || "New group",
    createdBy: ownerUid,
    memberIds: [ownerUid],
    createdAt: now,
  });
  await first.commit();

  const second = writeBatch(db());
  second.set(doc(db(), "groups", groupId, "members", ownerUid), {
    displayName: ownerName,
    email: ownerEmail,
    joinedAt: now,
  });
  second.set(doc(db(), "groups", groupId, "participants", participantId), {
    name: ownerName || "You",
    linkedUid: ownerUid,
  });
  second.set(userGroupIndexRef(ownerUid, groupId), {
    joinedAt: now,
  });
  await second.commit();

  return groupId;
}

export async function createPendingInvite(
  groupId: string,
  groupName: string,
  inviteeEmail: string,
  inviterUid: string,
  inviterName: string,
): Promise<string> {
  const emailLower = normalizeInviteEmail(inviteeEmail);
  const id = pendingInviteDocId(groupId, emailLower);
  const now = new Date().toISOString();
  const batch = writeBatch(db());

  batch.set(mailInviteItemRef(emailLower, id), {
    groupId,
    groupName,
    emailLower,
    phone: "",
    contactType: "email",
    invitedBy: inviterUid,
    inviterName,
    createdAt: now,
  });
  batch.set(doc(db(), "groups", groupId, "outboundInvites", id), {
    emailLower,
    phone: "",
    contactType: "email",
    createdAt: now,
  });

  await batch.commit();
  return id;
}

export async function createPhoneInvite(
  groupId: string,
  groupName: string,
  inviteePhone: string,
  inviterUid: string,
  inviterName: string,
): Promise<string> {
  const phone = normalizePhone(inviteePhone);
  const id = pendingPhoneInviteDocId(groupId, phone);
  const now = new Date().toISOString();
  const batch = writeBatch(db());

  batch.set(phoneInviteItemRef(phone, id), {
    groupId,
    groupName,
    emailLower: "",
    phone,
    contactType: "phone",
    invitedBy: inviterUid,
    inviterName,
    createdAt: now,
  });
  batch.set(doc(db(), "groups", groupId, "outboundInvites", id), {
    emailLower: "",
    phone,
    contactType: "phone",
    createdAt: now,
  });

  await batch.commit();
  return id;
}

export async function acceptInvite(
  invite: PendingInviteDoc,
  uid: string,
  displayName: string,
  email: string,
  phone?: string | null,
): Promise<void> {
  const { groupId } = invite;

  // Validate the signed-in identity matches the invite target
  if (invite.contactType === "email") {
    const inviteEmail = normalizeInviteEmail(invite.emailLower);
    const signedInEmail = normalizeInviteEmail(email);
    if (inviteEmail !== signedInEmail) {
      throw new Error(
        `This invite is for ${invite.emailLower}. Sign out and sign in with that Google account, then try again.`,
      );
    }
  } else {
    const invitePhone = normalizePhone(invite.phone);
    const signedInPhone = phone ? normalizePhone(phone) : "";
    if (invitePhone !== signedInPhone) {
      throw new Error(
        `This invite is for ${invite.phone}. Sign in with that phone number and try again.`,
      );
    }
  }

  const now = new Date().toISOString();
  const participantId = crypto.randomUUID();
  const gRef = groupRef(groupId);

  const invRef =
    invite.contactType === "phone"
      ? phoneInviteItemRef(normalizePhone(invite.phone), invite.id)
      : mailInviteItemRef(normalizeInviteEmail(invite.emailLower), invite.id);

  await runTransaction(db(), async (transaction) => {
    const gSnap = await transaction.get(gRef);
    if (!gSnap.exists()) throw new Error("Group not found");
    const data = gSnap.data();
    let memberIds: string[] = Array.isArray(data.memberIds)
      ? data.memberIds.map(String)
      : [];

    if (!memberIds.includes(uid)) {
      const invSnap = await transaction.get(invRef);
      if (!invSnap.exists()) {
        throw new Error("Invite not found. Ask the host to send a new invite.");
      }
      memberIds = [...memberIds, uid];
    }

    transaction.update(gRef, { memberIds });
  });

  // Now isGroupMember(uid). Remove invites and add profile + ledger rows.
  const second = writeBatch(db());
  second.delete(invRef);
  second.delete(doc(db(), "groups", groupId, "outboundInvites", invite.id));
  second.set(doc(db(), "groups", groupId, "members", uid), {
    displayName,
    email,
    phone: phone ?? "",
    joinedAt: now,
  });
  second.set(doc(db(), "groups", groupId, "participants", participantId), {
    name: displayName || email || phone || "Member",
    linkedUid: uid,
  });
  second.set(userGroupIndexRef(uid, groupId), { joinedAt: now });
  await second.commit();
}

export async function cancelInvite(
  groupId: string,
  invite: OutboundInviteDoc,
): Promise<void> {
  const batch = writeBatch(db());
  if (invite.contactType === "phone") {
    batch.delete(phoneInviteItemRef(normalizePhone(invite.phone), invite.id));
  } else {
    batch.delete(
      mailInviteItemRef(normalizeInviteEmail(invite.emailLower), invite.id),
    );
  }
  batch.delete(doc(db(), "groups", groupId, "outboundInvites", invite.id));
  await batch.commit();
}

export async function declineInvite(invite: PendingInviteDoc): Promise<void> {
  const invRef =
    invite.contactType === "phone"
      ? phoneInviteItemRef(normalizePhone(invite.phone), invite.id)
      : mailInviteItemRef(normalizeInviteEmail(invite.emailLower), invite.id);
  const snap = await getDoc(invRef);
  if (!snap.exists()) return;
  const groupId = String(snap.data().groupId ?? "");
  const batch = writeBatch(db());
  batch.delete(invRef);
  batch.delete(doc(db(), "groups", groupId, "outboundInvites", invite.id));
  await batch.commit();
}

// --- Ledger (scoped) ---

export async function fetchParticipants(
  groupId: string,
): Promise<Participant[]> {
  const snap = await getDocs(
    collection(db(), "groups", groupId, "participants"),
  );
  return snap.docs.map((d) => {
    const x = d.data();
    return {
      id: d.id,
      name: String(x.name ?? ""),
      linkedUid: x.linkedUid ? String(x.linkedUid) : undefined,
    };
  });
}

export async function fetchExpenses(groupId: string): Promise<Expense[]> {
  const snap = await getDocs(collection(db(), "groups", groupId, "expenses"));
  const list = snap.docs.map((d) => {
    const x = d.data();
    return {
      id: d.id,
      amount: Number(x.amount),
      description: String(x.description ?? ""),
      paidBy: String(x.paidBy),
      splitBetween: Array.isArray(x.splitBetween)
        ? x.splitBetween.map(String)
        : [],
      date: String(x.date ?? new Date().toISOString().slice(0, 10)),
      createdAt: String(x.createdAt ?? ""),
    };
  });
  // Sort by user-chosen date descending, then by createdAt for same-day entries
  return list.sort((a, b) => {
    const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
    if (dateDiff !== 0) return dateDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export async function fetchSettlements(groupId: string): Promise<Settlement[]> {
  const snap = await getDocs(
    collection(db(), "groups", groupId, "settlements"),
  );
  const list = snap.docs.map((d) => {
    const x = d.data();
    return {
      id: d.id,
      fromUser: String(x.fromUser),
      toUser: String(x.toUser),
      amount: Number(x.amount),
      createdAt: String(x.createdAt ?? ""),
    };
  });
  return list.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function insertParticipant(
  groupId: string,
  p: Participant,
): Promise<void> {
  await setDoc(doc(db(), "groups", groupId, "participants", p.id), {
    name: p.name,
    ...(p.linkedUid ? { linkedUid: p.linkedUid } : {}),
  });
}

export async function deleteParticipant(
  groupId: string,
  id: string,
): Promise<void> {
  await deleteDoc(doc(db(), "groups", groupId, "participants", id));
}

export async function insertExpense(
  groupId: string,
  expense: Expense,
): Promise<void> {
  await setDoc(doc(db(), "groups", groupId, "expenses", expense.id), {
    amount: expense.amount,
    description: expense.description,
    paidBy: expense.paidBy,
    splitBetween: expense.splitBetween,
    date: expense.date,
    createdAt: expense.createdAt,
    ...(expense.addedBy ? { addedBy: expense.addedBy } : {}),
  });
}

export async function insertSettlement(
  groupId: string,
  settlement: Settlement,
): Promise<void> {
  await setDoc(doc(db(), "groups", groupId, "settlements", settlement.id), {
    fromUser: settlement.fromUser,
    toUser: settlement.toUser,
    amount: settlement.amount,
    createdAt: settlement.createdAt,
    ...(settlement.addedBy ? { addedBy: settlement.addedBy } : {}),
  });
}

export async function deleteExpense(
  groupId: string,
  id: string,
): Promise<void> {
  await deleteDoc(doc(db(), "groups", groupId, "expenses", id));
}

/**
 * Returns the net balance for `uid` in a group.
 * Positive → others owe you. Negative → you owe others. Zero → settled.
 */
export async function fetchGroupNetBalance(
  groupId: string,
  uid: string,
): Promise<number> {
  const participantsSnap = await getDocs(
    collection(db(), "groups", groupId, "participants"),
  );
  const myPid = participantsSnap.docs.find(
    (d) => d.data().linkedUid === uid,
  )?.id;
  if (!myPid) return 0;

  const [expSnap, setSnap] = await Promise.all([
    getDocs(collection(db(), "groups", groupId, "expenses")),
    getDocs(collection(db(), "groups", groupId, "settlements")),
  ]);

  let net = 0;

  expSnap.docs.forEach((d) => {
    const x = d.data();
    const amount = Number(x.amount);
    const paidBy = String(x.paidBy);
    const split: string[] = Array.isArray(x.splitBetween)
      ? x.splitBetween.map(String)
      : [];
    const n = split.length;
    if (n === 0) return;
    const perPerson = amount / n;

    if (paidBy === myPid) {
      // Others in the split owe me their share
      net += split.filter((id) => id !== myPid).length * perPerson;
    } else if (split.includes(myPid)) {
      // I owe the payer my share
      net -= perPerson;
    }
  });

  setSnap.docs.forEach((d) => {
    const x = d.data();
    if (String(x.fromUser) === myPid) net -= Number(x.amount); // I paid someone
    if (String(x.toUser) === myPid) net += Number(x.amount); // someone paid me
  });

  return Math.round(net * 100) / 100;
}

export async function deleteSettlement(
  groupId: string,
  id: string,
): Promise<void> {
  await deleteDoc(doc(db(), "groups", groupId, "settlements", id));
}

export { isFirebaseConfigured };

// ── Real-time listeners ───────────────────────────────────────────────────────

function mapExpenseSnap(snap: QuerySnapshot<DocumentData>): Expense[] {
  const list = snap.docs.map((d) => {
    const x = d.data();
    return {
      id: d.id,
      amount: Number(x.amount),
      description: String(x.description ?? ""),
      paidBy: String(x.paidBy),
      splitBetween: Array.isArray(x.splitBetween)
        ? x.splitBetween.map(String)
        : [],
      date: String(x.date ?? new Date().toISOString().slice(0, 10)),
      createdAt: String(x.createdAt ?? ""),
      addedBy: x.addedBy ? String(x.addedBy) : undefined,
    } satisfies Expense;
  });
  return list.sort((a, b) => {
    const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
    if (dateDiff !== 0) return dateDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function mapSettlementSnap(snap: QuerySnapshot<DocumentData>): Settlement[] {
  return snap.docs
    .map((d) => {
      const x = d.data();
      return {
        id: d.id,
        fromUser: String(x.fromUser),
        toUser: String(x.toUser),
        amount: Number(x.amount),
        createdAt: String(x.createdAt ?? ""),
        addedBy: x.addedBy ? String(x.addedBy) : undefined,
      } satisfies Settlement;
    })
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
}

/**
 * Subscribe to real-time expense updates for a group.
 * Returns an unsubscribe function — call it when leaving the group.
 */
export function subscribeToExpenses(
  groupId: string,
  onUpdate: (expenses: Expense[]) => void,
): () => void {
  return onSnapshot(
    collection(db(), "groups", groupId, "expenses"),
    (snap) => onUpdate(mapExpenseSnap(snap)),
    (err) => console.error("subscribeToExpenses", err),
  );
}

/**
 * Subscribe to real-time settlement updates for a group.
 * Returns an unsubscribe function — call it when leaving the group.
 */
export function subscribeToSettlements(
  groupId: string,
  onUpdate: (settlements: Settlement[]) => void,
): () => void {
  return onSnapshot(
    collection(db(), "groups", groupId, "settlements"),
    (snap) => onUpdate(mapSettlementSnap(snap)),
    (err) => console.error("subscribeToSettlements", err),
  );
}
