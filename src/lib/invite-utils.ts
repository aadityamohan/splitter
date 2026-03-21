/** Normalize email for Firestore paths and rules (must match security rules). */
export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function pendingInviteDocId(groupId: string, email: string): string {
  return `${groupId}|${normalizeInviteEmail(email)}`
}

export function inviteEmailSubject(groupName: string): string {
  return `You're invited to "${groupName}" on Splitter`
}

export function inviteEmailBodyPlain(
  inviterName: string,
  groupName: string,
  inviteeEmail: string,
  appUrl: string
): string {
  return (
    `${inviterName} invited you to split expenses in the group "${groupName}" on Splitter.\n\n` +
    `1. Open the app: ${appUrl}\n` +
    `2. Sign in with this Google account: ${normalizeInviteEmail(inviteeEmail)}\n` +
    `3. Accept the invite on the home screen.\n\n` +
    `If you use a different Google account, ask ${inviterName} to send a new invite to that email.`
  )
}

/**
 * Opens Gmail in the browser with To / Subject / Body filled (user must be signed into Google).
 * @see https://support.google.com/mail/answer/56256 (compose URL parameters)
 */
export function buildInviteGmailComposeUrl(
  inviterName: string,
  groupName: string,
  inviteeEmail: string,
  appUrl: string
): string {
  const to = encodeURIComponent(normalizeInviteEmail(inviteeEmail))
  const su = encodeURIComponent(inviteEmailSubject(groupName))
  const body = encodeURIComponent(
    inviteEmailBodyPlain(inviterName, groupName, inviteeEmail, appUrl)
  )
  return `https://mail.google.com/mail/?view=cm&fs=1&tf=1&to=${to}&su=${su}&body=${body}`
}

/**
 * WhatsApp deep link — opens WhatsApp with a pre-filled invite message.
 * Phone number should be in international format (digits only, no spaces/dashes).
 * Passing an empty phone opens the share sheet on mobile without a contact pre-filled.
 */
export function buildInviteWhatsAppUrl(
  inviterName: string,
  groupName: string,
  inviteeEmail: string,
  appUrl: string,
  phone = ''
): string {
  const text = encodeURIComponent(
    `${inviterName} invited you to split expenses in "${groupName}" on Splitter.\n\n` +
      `1. Open: ${appUrl}\n` +
      `2. Sign in with Google using *${normalizeInviteEmail(inviteeEmail)}*\n` +
      `3. Accept the invite on the home screen.`
  )
  const base = phone
    ? `https://wa.me/${phone.replace(/\D/g, '')}?text=${text}`
    : `https://wa.me/?text=${text}`
  return base
}

/**
 * SMS URI — opens the default messaging app with a pre-filled message.
 * Works on iOS and Android mobile browsers.
 */
export function buildInviteSmsUrl(
  inviterName: string,
  groupName: string,
  inviteeEmail: string,
  appUrl: string,
  phone = ''
): string {
  const body = encodeURIComponent(
    `${inviterName} invited you to "${groupName}" on Splitter.\n` +
      `Open ${appUrl}, sign in with Google (${normalizeInviteEmail(inviteeEmail)}), and accept the invite.`
  )
  return phone ? `sms:${phone.replace(/\D/g, '')}?body=${body}` : `sms:?body=${body}`
}

/** Default mail client (mailto) — same content as Gmail compose. */
export function buildInviteMailto(
  inviterName: string,
  groupName: string,
  inviteeEmail: string,
  appUrl: string
): string {
  const subject = encodeURIComponent(inviteEmailSubject(groupName))
  const body = encodeURIComponent(
    inviteEmailBodyPlain(inviterName, groupName, inviteeEmail, appUrl)
  )
  return `mailto:${encodeURIComponent(normalizeInviteEmail(inviteeEmail))}?subject=${subject}&body=${body}`
}
