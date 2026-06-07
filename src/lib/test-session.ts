// Tracks whether the current browser session is a "test mode" session.
// Set when the user lands on /?test or signs in via the test account, so the
// TEST MODE badge stays visible across the whole app (not just the login page).

const KEY = 'splitter-test-mode'

export function markTestSession(): void {
  try { sessionStorage.setItem(KEY, '1') } catch { /* storage unavailable */ }
}

export function isTestSession(): boolean {
  try { return sessionStorage.getItem(KEY) === '1' } catch { return false }
}

export function clearTestSession(): void {
  try { sessionStorage.removeItem(KEY) } catch { /* storage unavailable */ }
}
