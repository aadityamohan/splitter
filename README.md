# Splitter - Expense Tracker

Split expenses with friends and never forget to collect. A simple PWA for managing shared expenses between you and your friends.

## Setup

```bash
npm install
npm run dev
```

## Features

- **Add expenses** – Track who paid and how to split
- **View balances** – See who owes whom at a glance
- **Record settlements** – Mark when someone pays back
- **History** – Full log of expenses and settlements
- **Manage people** – Add/remove people in your group
- **Google sign-in** – Firebase Auth (Google only); Firestore requires a signed-in user
- **PWA** – Install on your phone for quick access

## Tech Stack

- React 19 + TypeScript + Vite
- shadcn/ui + Tailwind CSS
- Zustand (state + localStorage persistence)
- **Firebase Firestore** (optional cloud sync)

## Database (Firebase Firestore)

The app uses **localStorage** by default. To sync across devices:

1. Create a [Firebase](https://console.firebase.google.com) project and add a **Web app**.
2. Enable **Firestore** (Create database) and deploy rules: `firebase deploy --only firestore:rules` (rules live in `firestore.rules` at the repo root).
3. Copy `.env.example` to `.env` and fill in the Firebase web config values from **Project settings → Your apps**.
4. **Authentication → Sign-in method → Google** — turn **Google** on, set a support email, save.
5. **Authentication → Settings → Authorized domains** — ensure `localhost` and your Hosting domain (e.g. `splitter-fd759.web.app`) are listed.

Data lives under:

- **`groups/{id}`** — group doc + subcollections (participants, expenses, …)
- **`userGroups/{uid}/groups/{groupId}`** — per-user list of group ids (Firestore often **denies** `groups` list queries that use `array-contains`; the app uses this index instead)
- **`mailInvites/{email}/items/{inviteId}`** — email invites

After any `firestore.rules` change, deploy from the repo root (same project as `.env`):

```bash
firebase deploy --only firestore:rules
```

**Still “Missing or insufficient permissions”?**

1. In Firebase Console → **Firestore → Rules**, confirm the published rules match this repo (you should see `userGroups` and `mailInvites`).
2. Confirm **`VITE_FIREBASE_PROJECT_ID`** in `.env` is that same project; restart `npm run dev` after edits.
3. **Existing groups** created before `userGroups` existed won’t appear until the index is repaired: open the group once (if you still have it as the active group from before, reload the app), or add `userGroups/{yourUid}/groups/{groupId}` manually in the console.
4. Old **`pendingInvites`** docs are unused — **re-send invites** after switching to `mailInvites`.

**No Firebase in `.env`?** The app runs in **local-only** mode (no login gate, no cloud sync).

## Firebase Hosting & CI

- **Local deploy:** `firebase deploy` (runs `npm run build` first, then uploads **`dist/`**).
- **GitHub Actions:** Workflows in `.github/workflows/` deploy on PR preview and on merge to `main`. Add repository **Secrets** with the same names as your `.env` (`VITE_FIREBASE_API_KEY`, …) so the hosted build includes Firebase config and Google sign-in works.

## PWA

The app includes a manifest for installability. Add to home screen on mobile for app-like experience.

## Currency

Default is ₹ (INR). Edit `BalancesView.tsx` and `HistoryView.tsx` to change the currency symbol.
