"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.onSettlementCreated = exports.onExpenseCreated = void 0;
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-functions/v2/firestore");
const messaging_1 = require("firebase-admin/messaging");
const firestore_2 = require("firebase-admin/firestore");
admin.initializeApp();
const db = (0, firestore_2.getFirestore)();
// ── Helpers ───────────────────────────────────────────────────────────────────
/** Fetch all FCM tokens stored for a given uid. */
async function getTokensForUser(uid) {
    const snap = await db.collection('userTokens').doc(uid).collection('tokens').get();
    return snap.docs.map((d) => d.data().token).filter(Boolean);
}
/** Remove stale tokens that FCM reports as invalid/unregistered. */
async function pruneStaleTokens(uid, staleTokens) {
    const batch = db.batch();
    for (const token of staleTokens) {
        batch.delete(db.collection('userTokens').doc(uid).collection('tokens').doc(token));
    }
    await batch.commit();
}
/**
 * Send an FCM notification to all given UIDs except the one who triggered it.
 * Stale/unregistered tokens are cleaned up automatically.
 */
async function notifyMembers(memberUids, excludeUid, title, body) {
    const targets = excludeUid ? memberUids.filter((u) => u !== excludeUid) : memberUids;
    if (targets.length === 0)
        return;
    await Promise.all(targets.map(async (uid) => {
        const tokens = await getTokensForUser(uid);
        if (tokens.length === 0)
            return;
        const response = await (0, messaging_1.getMessaging)().sendEachForMulticast({
            tokens,
            notification: { title, body },
            webpush: {
                notification: {
                    title,
                    body,
                    icon: '/favicon.ico',
                },
            },
        });
        // Prune tokens that FCM reports as invalid
        const stale = [];
        response.responses.forEach((r, i) => {
            if (!r.success &&
                (r.error?.code === 'messaging/registration-token-not-registered' ||
                    r.error?.code === 'messaging/invalid-registration-token')) {
                stale.push(tokens[i]);
            }
        });
        if (stale.length > 0)
            await pruneStaleTokens(uid, stale);
    }));
}
/** Get the memberIds array from the group doc and map them to real UIDs via participants. */
async function getMemberUids(groupId) {
    const participantsSnap = await db
        .collection('groups')
        .doc(groupId)
        .collection('participants')
        .get();
    const uids = [];
    for (const p of participantsSnap.docs) {
        const uid = p.data().linkedUid;
        if (uid)
            uids.push(uid);
    }
    return uids;
}
/** Get the group name. */
async function getGroupName(groupId) {
    const snap = await db.collection('groups').doc(groupId).get();
    return snap.data()?.name ?? 'your group';
}
// ── Cloud Functions ───────────────────────────────────────────────────────────
exports.onExpenseCreated = (0, firestore_1.onDocumentCreated)({
    document: 'groups/{groupId}/expenses/{expenseId}',
    region: 'asia-south1',
}, async (event) => {
    const data = event.data?.data();
    if (!data)
        return;
    const { groupId } = event.params;
    const addedBy = data.addedBy;
    const description = data.description || 'an expense';
    const amount = Number(data.amount).toFixed(2);
    const [memberUids, groupName] = await Promise.all([
        getMemberUids(groupId),
        getGroupName(groupId),
    ]);
    await notifyMembers(memberUids, addedBy, `New expense in ${groupName}`, `₹${amount} · ${description}`);
});
exports.onSettlementCreated = (0, firestore_1.onDocumentCreated)({
    document: 'groups/{groupId}/settlements/{settlementId}',
    region: 'asia-south1',
}, async (event) => {
    const data = event.data?.data();
    if (!data)
        return;
    const { groupId } = event.params;
    const addedBy = data.addedBy;
    const amount = Number(data.amount).toFixed(2);
    const [memberUids, groupName] = await Promise.all([
        getMemberUids(groupId),
        getGroupName(groupId),
    ]);
    await notifyMembers(memberUids, addedBy, `Settlement recorded in ${groupName}`, `₹${amount} settlement has been recorded.`);
});
//# sourceMappingURL=index.js.map