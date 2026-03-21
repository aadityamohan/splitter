import * as admin from 'firebase-admin'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { getFirestore } from 'firebase-admin/firestore'

admin.initializeApp()

const db = getFirestore()

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fetch all FCM tokens stored for a given uid. */
async function getTokensForUser(uid: string): Promise<string[]> {
  const snap = await db.collection('userTokens').doc(uid).collection('tokens').get()
  return snap.docs.map((d) => d.data().token as string).filter(Boolean)
}

/** Remove stale tokens that FCM reports as invalid/unregistered. */
async function pruneStaleTokens(uid: string, staleTokens: string[]): Promise<void> {
  const batch = db.batch()
  for (const token of staleTokens) {
    batch.delete(db.collection('userTokens').doc(uid).collection('tokens').doc(token))
  }
  await batch.commit()
}

/**
 * Send an FCM notification to all given UIDs except the one who triggered it.
 * Stale/unregistered tokens are cleaned up automatically.
 */
async function notifyMembers(
  memberUids: string[],
  excludeUid: string | undefined,
  title: string,
  body: string,
): Promise<void> {
  const targets = excludeUid ? memberUids.filter((u) => u !== excludeUid) : memberUids
  if (targets.length === 0) return

  await Promise.all(
    targets.map(async (uid) => {
      const tokens = await getTokensForUser(uid)
      if (tokens.length === 0) return

      const response = await getMessaging().sendEachForMulticast({
        tokens,
        notification: { title, body },
        webpush: {
          notification: {
            title,
            body,
            icon: '/favicon.ico',
          },
        },
      })

      // Prune tokens that FCM reports as invalid
      const stale: string[] = []
      response.responses.forEach((r, i) => {
        if (
          !r.success &&
          (r.error?.code === 'messaging/registration-token-not-registered' ||
            r.error?.code === 'messaging/invalid-registration-token')
        ) {
          stale.push(tokens[i])
        }
      })
      if (stale.length > 0) await pruneStaleTokens(uid, stale)
    })
  )
}

/** Get the memberIds array from the group doc and map them to real UIDs via participants. */
async function getMemberUids(groupId: string): Promise<string[]> {
  const participantsSnap = await db
    .collection('groups')
    .doc(groupId)
    .collection('participants')
    .get()
  const uids: string[] = []
  for (const p of participantsSnap.docs) {
    const uid = p.data().linkedUid as string | undefined
    if (uid) uids.push(uid)
  }
  return uids
}

/** Get the group name. */
async function getGroupName(groupId: string): Promise<string> {
  const snap = await db.collection('groups').doc(groupId).get()
  return (snap.data()?.name as string | undefined) ?? 'your group'
}

// ── Cloud Functions ───────────────────────────────────────────────────────────

export const onExpenseCreated = onDocumentCreated(
  {
    document: 'groups/{groupId}/expenses/{expenseId}',
    region: 'asia-south1',
  },
  async (event) => {
    const data = event.data?.data()
    if (!data) return

    const { groupId } = event.params
    const addedBy = data.addedBy as string | undefined
    const description = (data.description as string) || 'an expense'
    const amount = Number(data.amount).toFixed(2)

    const [memberUids, groupName] = await Promise.all([
      getMemberUids(groupId),
      getGroupName(groupId),
    ])

    await notifyMembers(
      memberUids,
      addedBy,
      `New expense in ${groupName}`,
      `₹${amount} · ${description}`,
    )
  }
)

export const onSettlementCreated = onDocumentCreated(
  {
    document: 'groups/{groupId}/settlements/{settlementId}',
    region: 'asia-south1',
  },
  async (event) => {
    const data = event.data?.data()
    if (!data) return

    const { groupId } = event.params
    const addedBy = data.addedBy as string | undefined
    const amount = Number(data.amount).toFixed(2)

    const [memberUids, groupName] = await Promise.all([
      getMemberUids(groupId),
      getGroupName(groupId),
    ])

    await notifyMembers(
      memberUids,
      addedBy,
      `Settlement recorded in ${groupName}`,
      `₹${amount} settlement has been recorded.`,
    )
  }
)
