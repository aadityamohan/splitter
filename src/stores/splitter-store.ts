import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Participant, Expense, Settlement } from "@/types";
import type {
  GroupDoc,
  OutboundInviteDoc,
  PendingInviteDoc,
} from "@/lib/firestore-groups";
import { getFirebaseAuth } from "@/lib/auth";
import {
  isFirebaseConfigured,
  fetchMyGroups,
  fetchGroupIfMember,
  ensureUserGroupIndex,
  fetchPendingInvitesForEmail,
  fetchPendingInvitesForPhone,
  fetchOutboundInvites,
  createGroup as fsCreateGroup,
  createPendingInvite,
  createPhoneInvite,
  acceptInvite as fsAcceptInvite,
  cancelInvite,
  declineInvite,
  fetchParticipants,
  fetchExpenses,
  fetchSettlements,
  subscribeToExpenses,
  subscribeToSettlements,
  insertParticipant,
  deleteParticipant,
  insertExpense,
  insertSettlement,
  deleteExpense,
  deleteSettlement,
} from "@/lib/firestore-groups";

// Module-level unsubscribe handles for real-time listeners
let unsubExpenses: (() => void) | null = null;
let unsubSettlements: (() => void) | null = null;

function tearDownLiveListeners() {
  unsubExpenses?.();
  unsubExpenses = null;
  unsubSettlements?.();
  unsubSettlements = null;
}

const STORAGE_KEY = "splitter-v2";

function generateId() {
  return (
    crypto.randomUUID?.() ??
    `id-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

export const DEFAULT_DESCRIPTIONS = [
  "Dinner",
  "Lunch",
  "Breakfast",
  "Groceries",
  "Petrol / Fuel",
  "Hotel / Stay",
  "Cab / Auto",
  "Flight / Train",
  "Movie / Event",
  "Drinks",
  "Coffee",
  "Shopping",
  "Utilities",
  "Rent",
  "Medicine",
];

export interface SplitterState {
  activeGroupId: string | null;
  myGroups: GroupDoc[];
  pendingInvites: PendingInviteDoc[];
  outboundInvites: OutboundInviteDoc[];
  participants: Participant[];
  expenses: Expense[];
  settlements: Settlement[];
  /** User-saved custom descriptions; persisted in localStorage */
  savedDescriptions: string[];

  /** Load groups + invites for signed-in user */
  refreshWorkspace: (
    uid: string,
    email: string | null,
    displayName: string | null,
    phone?: string | null,
  ) => Promise<void>;
  /** Open a group and load ledger */
  selectGroup: (groupId: string | null) => Promise<void>;
  createGroup: (
    name: string,
    uid: string,
    displayName: string | null,
    email: string | null,
  ) => Promise<void>;
  inviteToActiveGroup: (
    email: string,
    inviterUid: string,
    inviterName: string,
  ) => Promise<void>;
  inviteByPhoneToActiveGroup: (
    phone: string,
    inviterUid: string,
    inviterName: string,
  ) => Promise<void>;
  acceptPendingInvite: (
    invite: PendingInviteDoc,
    uid: string,
    displayName: string | null,
    email: string | null,
    phone?: string | null,
  ) => Promise<void>;
  declinePendingInvite: (invite: PendingInviteDoc) => Promise<void>;
  cancelOutboundInvite: (invite: OutboundInviteDoc) => Promise<void>;
  refreshOutboundInvites: () => Promise<void>;

  addParticipant: (name: string) => void;
  removeParticipant: (id: string) => void;
  addExpense: (expense: Omit<Expense, "id" | "createdAt">) => void;
  addSettlement: (settlement: Omit<Settlement, "id" | "createdAt">) => void;
  deleteExpense: (id: string) => void;
  deleteSettlement: (id: string) => void;
  saveDescription: (desc: string) => void;
  removeDescription: (desc: string) => void;
}

export const useSplitterStore = create<SplitterState>()(
  persist(
    (set, get) => ({
      activeGroupId: null,
      myGroups: [],
      pendingInvites: [],
      outboundInvites: [],
      participants: [],
      savedDescriptions: [],
      expenses: [],
      settlements: [],

      refreshWorkspace: async (uid, email, _displayName, phone) => {
        if (!isFirebaseConfigured) {
          set({ myGroups: [], pendingInvites: [] });
          return;
        }

        let myGroups: GroupDoc[] = [];
        let pendingInvites: PendingInviteDoc[] = [];

        try {
          myGroups = await fetchMyGroups(uid);
          const persistedGroupId = get().activeGroupId;
          if (
            persistedGroupId &&
            !myGroups.some((g) => g.id === persistedGroupId)
          ) {
            const extra = await fetchGroupIfMember(uid, persistedGroupId);
            if (extra) {
              myGroups = [...myGroups, extra];
              void ensureUserGroupIndex(uid, persistedGroupId).catch(
                console.error,
              );
            }
          }
        } catch (e) {
          console.error(
            "refreshWorkspace: fetchMyGroups failed — deploy firestore.rules (must include userGroups + mailInvites + phoneInvites) and check .env project id.",
            e,
          );
        }

        // Fetch email-based invites
        if (email) {
          try {
            const emailInvites = await fetchPendingInvitesForEmail(email);
            pendingInvites = [...pendingInvites, ...emailInvites];
          } catch (e) {
            console.error(
              "refreshWorkspace: fetchPendingInvitesForEmail failed.",
              e,
            );
          }
        }

        // Fetch phone-based invites
        if (phone) {
          try {
            const phoneInvites = await fetchPendingInvitesForPhone(phone);
            // Deduplicate by id
            const existingIds = new Set(pendingInvites.map((i) => i.id));
            for (const inv of phoneInvites) {
              if (!existingIds.has(inv.id)) pendingInvites.push(inv);
            }
          } catch (e) {
            console.error(
              "refreshWorkspace: fetchPendingInvitesForPhone failed.",
              e,
            );
          }
        }

        set({ myGroups, pendingInvites });
      },

      selectGroup: async (groupId) => {
        // Always tear down previous group's listeners first
        tearDownLiveListeners();

        if (!groupId || !isFirebaseConfigured) {
          set({
            activeGroupId: null,
            participants: [],
            expenses: [],
            settlements: [],
            outboundInvites: [],
          });
          return;
        }
        try {
          const [participants, expenses, settlements, outboundInvites] =
            await Promise.all([
              fetchParticipants(groupId),
              fetchExpenses(groupId),
              fetchSettlements(groupId),
              fetchOutboundInvites(groupId),
            ]);
          set({
            activeGroupId: groupId,
            participants,
            expenses,
            settlements,
            outboundInvites,
          });

          // Set up real-time listeners so all members see changes instantly
          unsubExpenses = subscribeToExpenses(groupId, (expenses) => {
            useSplitterStore.setState({ expenses });
          });
          unsubSettlements = subscribeToSettlements(groupId, (settlements) => {
            useSplitterStore.setState({ settlements });
          });

          const u = getFirebaseAuth()?.currentUser;
          if (u) {
            void ensureUserGroupIndex(u.uid, groupId).catch(console.error);
          }
        } catch (e) {
          console.error("selectGroup", e);
        }
      },

      createGroup: async (name, uid, displayName, email) => {
        if (!isFirebaseConfigured) return;
        const id = await fsCreateGroup(
          uid,
          displayName ?? "You",
          email ?? "",
          name,
        );
        const u = getFirebaseAuth()?.currentUser;
        await get().refreshWorkspace(
          uid,
          email ?? "",
          displayName,
          u?.phoneNumber ?? null,
        );
        await get().selectGroup(id);
      },

      inviteToActiveGroup: async (email, inviterUid, inviterName) => {
        const gid = get().activeGroupId;
        if (!gid || !isFirebaseConfigured) return;
        const g = get().myGroups.find((x) => x.id === gid);
        await createPendingInvite(
          gid,
          g?.name ?? "Group",
          email,
          inviterUid,
          inviterName,
        );
        await get().refreshOutboundInvites();
      },

      inviteByPhoneToActiveGroup: async (phone, inviterUid, inviterName) => {
        const gid = get().activeGroupId;
        if (!gid || !isFirebaseConfigured) return;
        const g = get().myGroups.find((x) => x.id === gid);
        await createPhoneInvite(
          gid,
          g?.name ?? "Group",
          phone,
          inviterUid,
          inviterName,
        );
        await get().refreshOutboundInvites();
      },

      acceptPendingInvite: async (invite, uid, displayName, email, phone) => {
        await fsAcceptInvite(
          invite,
          uid,
          displayName ?? "Member",
          email ?? "",
          phone,
        );
        const u = getFirebaseAuth()?.currentUser;
        await get().refreshWorkspace(
          uid,
          email ?? "",
          displayName,
          u?.phoneNumber ?? null,
        );
        await get().selectGroup(invite.groupId);
      },

      declinePendingInvite: async (invite) => {
        await declineInvite(invite);
        const u = getFirebaseAuth()?.currentUser;
        if (u) {
          await get().refreshWorkspace(
            u.uid,
            u.email,
            u.displayName,
            u.phoneNumber,
          );
        } else {
          set((s) => ({
            pendingInvites: s.pendingInvites.filter((p) => p.id !== invite.id),
          }));
        }
      },

      cancelOutboundInvite: async (invite) => {
        const gid = get().activeGroupId;
        if (!gid) return;
        await cancelInvite(gid, invite);
        await get().refreshOutboundInvites();
      },

      refreshOutboundInvites: async () => {
        const gid = get().activeGroupId;
        if (!gid || !isFirebaseConfigured) return;
        const outboundInvites = await fetchOutboundInvites(gid);
        set({ outboundInvites });
      },

      addParticipant: (name) => {
        const gid = get().activeGroupId;
        if (!gid) return;
        const p: Participant = {
          id: generateId(),
          name: name.trim() || "Someone",
        };
        set((s) => ({ participants: [...s.participants, p] }));
        insertParticipant(gid, p).catch(console.error);
      },

      removeParticipant: (id) => {
        const gid = get().activeGroupId;
        if (!gid) return;
        set((s) => ({
          participants: s.participants.filter((p) => p.id !== id),
          expenses: s.expenses.filter(
            (e) => e.paidBy !== id && !e.splitBetween.includes(id),
          ),
          settlements: s.settlements.filter(
            (st) => st.fromUser !== id && st.toUser !== id,
          ),
        }));
        deleteParticipant(gid, id).catch(console.error);
      },

      addExpense: (expense) => {
        const gid = get().activeGroupId;
        if (!gid) return;
        const uid = getFirebaseAuth()?.currentUser?.uid;
        const newExpense: Expense = {
          ...expense,
          id: generateId(),
          date: expense.date || new Date().toISOString().slice(0, 10),
          createdAt: new Date().toISOString(),
          ...(uid ? { addedBy: uid } : {}),
        };
        set((s) => ({ expenses: [newExpense, ...s.expenses] }));
        insertExpense(gid, newExpense).catch(console.error);
      },

      addSettlement: (settlement) => {
        const gid = get().activeGroupId;
        if (!gid) return;
        const uid = getFirebaseAuth()?.currentUser?.uid;
        const newSettlement: Settlement = {
          ...settlement,
          id: generateId(),
          createdAt: new Date().toISOString(),
          ...(uid ? { addedBy: uid } : {}),
        };
        set((s) => ({
          settlements: [newSettlement, ...s.settlements],
        }));
        insertSettlement(gid, newSettlement).catch(console.error);
      },

      deleteExpense: (id) => {
        const gid = get().activeGroupId;
        if (!gid) return;
        set((s) => ({
          expenses: s.expenses.filter((e) => e.id !== id),
        }));
        deleteExpense(gid, id).catch(console.error);
      },

      deleteSettlement: (id) => {
        const gid = get().activeGroupId;
        if (!gid) return;
        set((s) => ({
          settlements: s.settlements.filter((st) => st.id !== id),
        }));
        deleteSettlement(gid, id).catch(console.error);
      },

      saveDescription: (desc) => {
        const trimmed = desc.trim();
        if (!trimmed) return;
        set((s) => ({
          savedDescriptions: s.savedDescriptions.includes(trimmed)
            ? s.savedDescriptions
            : [trimmed, ...s.savedDescriptions].slice(0, 20),
        }));
      },

      removeDescription: (desc) => {
        set((s) => ({
          savedDescriptions: s.savedDescriptions.filter((d) => d !== desc),
        }));
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (s) => ({
        activeGroupId: s.activeGroupId,
        savedDescriptions: s.savedDescriptions,
      }),
    },
  ),
);

/** @deprecated use useSplitterStore */
export const useExpenseStore = useSplitterStore;
