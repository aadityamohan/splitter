import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useSplitterStore } from '@/stores/splitter-store'
import type { OutboundInviteDoc } from '@/lib/firestore-groups'
import {
  buildInviteGmailComposeUrl,
  buildInviteWhatsAppUrl,
  buildInviteSmsUrl,
  buildPhoneInviteWhatsAppUrl,
  buildPhoneInviteSmsUrl,
  normalizeInviteEmail,
} from '@/lib/invite-utils'
import { normalizePhone } from '@/lib/firestore-groups'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  MailPlus,
  Phone,
  MessageCircle,
  Mail,
  BookUser,
  ArrowLeft,
  Check,
  X,
} from 'lucide-react'

// Web Contacts API – only available on some mobile browsers (Chrome Android, Safari iOS)
const supportsContactPicker =
  typeof window !== 'undefined' &&
  'contacts' in navigator &&
  'ContactsManager' in window

type Step = 'form' | 'share'
type InviteMode = 'email' | 'phone'

export function InviteByEmailDialog() {
  const { user } = useAuth()
  const activeGroupId = useSplitterStore((s) => s.activeGroupId)
  const myGroups = useSplitterStore((s) => s.myGroups)
  const inviteToActiveGroup = useSplitterStore((s) => s.inviteToActiveGroup)
  const inviteByPhoneToActiveGroup = useSplitterStore((s) => s.inviteByPhoneToActiveGroup)
  const outboundInvites = useSplitterStore((s) => s.outboundInvites)
  const cancelOutboundInvite = useSplitterStore((s) => s.cancelOutboundInvite)
  const refreshOutboundInvites = useSplitterStore((s) => s.refreshOutboundInvites)

  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('form')
  const [mode, setMode] = useState<InviteMode>('email')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Saved values for the share step
  const [savedEmail, setSavedEmail] = useState('')
  const [savedPhone, setSavedPhone] = useState('')
  const [savedContactType, setSavedContactType] = useState<'email' | 'phone'>('email')

  const groupName = myGroups.find((g) => g.id === activeGroupId)?.name ?? 'this group'
  const inviterName = user?.displayName ?? user?.email ?? user?.phoneNumber ?? 'Your friend'
  const appUrl = typeof window !== 'undefined' ? window.location.origin : ''

  useEffect(() => {
    if (open && activeGroupId) void refreshOutboundInvites()
  }, [open, activeGroupId, refreshOutboundInvites])

  const resetForm = () => {
    setStep('form')
    setEmail('')
    setPhone('')
    setSavedEmail('')
    setSavedPhone('')
    setSavedContactType('email')
    setError(null)
  }

  const handleClose = (val: boolean) => {
    setOpen(val)
    if (!val) resetForm()
  }

  // ── Submit: email mode ──────────────────────────────────────────────────────

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!user || !activeGroupId) return
    const norm = normalizeInviteEmail(email)
    if (!norm.includes('@')) { setError('Enter a valid email address'); return }
    if (user.email && normalizeInviteEmail(user.email) === norm) {
      setError("You can't invite your own email"); return
    }
    setBusy(true)
    try {
      await inviteToActiveGroup(norm, user.uid, inviterName)
      setSavedEmail(norm)
      setSavedPhone(phone.trim())
      setSavedContactType('email')
      setStep('share')
      await refreshOutboundInvites()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not send invite')
    } finally {
      setBusy(false)
    }
  }

  // ── Submit: phone mode ──────────────────────────────────────────────────────

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!user || !activeGroupId) return
    const raw = phone.trim()
    if (!raw) { setError('Enter a phone number'); return }
    const normalized = normalizePhone(raw.startsWith('+') ? raw : raw.length === 10 ? `+91${raw}` : `+${raw}`)
    if (user.phoneNumber && normalizePhone(user.phoneNumber) === normalized) {
      setError("You can't invite your own phone number"); return
    }
    setBusy(true)
    try {
      await inviteByPhoneToActiveGroup(normalized, user.uid, inviterName)
      setSavedPhone(normalized)
      setSavedEmail('')
      setSavedContactType('phone')
      setStep('share')
      await refreshOutboundInvites()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not send invite')
    } finally {
      setBusy(false)
    }
  }

  // ── Contact picker ──────────────────────────────────────────────────────────

  const pickContact = async () => {
    if (!supportsContactPicker) return
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const contacts = await (navigator as any).contacts.select(['email', 'tel', 'name'], {
        multiple: false,
      })
      if (contacts?.length) {
        const c = contacts[0]
        if (c.email?.[0]) setEmail(c.email[0])
        if (c.tel?.[0]) setPhone(c.tel[0].replace(/\s/g, ''))
      }
    } catch {
      // User cancelled or API unavailable
    }
  }

  // ── Share options ───────────────────────────────────────────────────────────

  const openGmail = () =>
    window.open(
      buildInviteGmailComposeUrl(inviterName, groupName, savedEmail, appUrl),
      '_blank',
      'noopener,noreferrer'
    )

  const openWhatsApp = () =>
    window.open(
      savedContactType === 'phone'
        ? buildPhoneInviteWhatsAppUrl(inviterName, groupName, appUrl, savedPhone)
        : buildInviteWhatsAppUrl(inviterName, groupName, savedEmail, appUrl, savedPhone),
      '_blank',
      'noopener,noreferrer'
    )

  const openSms = () =>
    window.open(
      savedContactType === 'phone'
        ? buildPhoneInviteSmsUrl(inviterName, groupName, appUrl, savedPhone)
        : buildInviteSmsUrl(inviterName, groupName, savedEmail, appUrl, savedPhone),
      '_blank',
      'noopener,noreferrer'
    )

  // ── Outbound invite display label ───────────────────────────────────────────

  function inviteLabel(o: OutboundInviteDoc) {
    return o.contactType === 'phone' ? o.phone : o.emailLower
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <MailPlus className="h-4 w-4" />
          Invite
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">

        {/* ── Step 1 — form ── */}
        {step === 'form' && (
          <>
            <DialogHeader>
              <DialogTitle>Invite someone</DialogTitle>
              <DialogDescription>
                Invite a friend to split expenses in <strong>{groupName}</strong>.
              </DialogDescription>
            </DialogHeader>

            {/* Mode switcher */}
            <div className="flex rounded-lg border p-1 gap-1 mt-2">
              <button
                type="button"
                onClick={() => { setMode('email'); setError(null) }}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium transition-colors ${
                  mode === 'email'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Mail className="h-3.5 w-3.5" />
                By email
              </button>
              <button
                type="button"
                onClick={() => { setMode('phone'); setError(null) }}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium transition-colors ${
                  mode === 'phone'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Phone className="h-3.5 w-3.5" />
                By phone
              </button>
            </div>

            {/* ── Email mode ── */}
            {mode === 'email' && (
              <form onSubmit={handleEmailSubmit} className="space-y-4 mt-2">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="invite-email">
                      Google account email <span className="text-destructive">*</span>
                    </Label>
                    {supportsContactPicker && (
                      <button
                        type="button"
                        onClick={pickContact}
                        className="flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <BookUser className="h-3.5 w-3.5" />
                        Pick from contacts
                      </button>
                    )}
                  </div>
                  <Input
                    id="invite-email"
                    type="email"
                    placeholder="friend@gmail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <p className="text-[11px] text-muted-foreground">
                    They must sign in with this exact Google account to accept.
                  </p>
                </div>

                {/* Optional phone for WhatsApp/SMS */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="invite-phone">
                      Phone{' '}
                      <span className="text-muted-foreground font-normal">(optional — for WhatsApp/SMS)</span>
                    </Label>
                  </div>
                  <div className="relative">
                    <Phone className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="invite-phone"
                      type="tel"
                      placeholder="+91 98765 43210"
                      className="pl-8"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                </div>

                {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}

                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? 'Creating invite…' : 'Create invite & choose how to send'}
                </Button>
              </form>
            )}

            {/* ── Phone mode ── */}
            {mode === 'phone' && (
              <form onSubmit={handlePhoneSubmit} className="space-y-4 mt-2">
                <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-4 py-3 text-xs text-blue-700 space-y-1">
                  <p className="font-medium">For friends who sign in with phone number</p>
                  <p>They'll see this invite when they open the app with their phone number.</p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="invite-phone-only">
                      Mobile number <span className="text-destructive">*</span>
                    </Label>
                    {supportsContactPicker && (
                      <button
                        type="button"
                        onClick={pickContact}
                        className="flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <BookUser className="h-3.5 w-3.5" />
                        Pick from contacts
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Phone className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="invite-phone-only"
                      type="tel"
                      placeholder="+91 98765 43210"
                      className="pl-8"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    10-digit numbers get +91 automatically. Include country code for others.
                  </p>
                </div>

                {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}

                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? 'Creating invite…' : 'Create invite & choose how to notify'}
                </Button>
              </form>
            )}

            {/* Pending invites list */}
            {outboundInvites.length > 0 && (
              <div className="border-t pt-4 mt-2">
                <p className="mb-2 text-sm font-medium">Pending invites</p>
                <ul className="space-y-2 text-sm">
                  {outboundInvites.map((o) => (
                    <li
                      key={o.id}
                      className="flex items-center justify-between gap-2 rounded border px-3 py-1.5"
                    >
                      <span className="flex items-center gap-1.5 truncate text-muted-foreground">
                        {o.contactType === 'phone'
                          ? <Phone className="h-3.5 w-3.5 shrink-0" />
                          : <Mail className="h-3.5 w-3.5 shrink-0" />
                        }
                        <span className="truncate">{inviteLabel(o)}</span>
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="shrink-0 text-destructive h-7 px-2"
                        onClick={() => void cancelOutboundInvite(o)}
                      >
                        <X className="h-3.5 w-3.5 mr-1" />
                        Cancel
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {/* ── Step 2 — choose how to notify ── */}
        {step === 'share' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Check className="h-5 w-5 text-green-500" />
                Invite created!
              </DialogTitle>
              <DialogDescription>
                Invite saved for{' '}
                <strong>{savedEmail || savedPhone}</strong>. Now choose how to notify them.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 mt-2">
              {/* Gmail — only if email invite */}
              {savedEmail && (
                <button
                  type="button"
                  onClick={openGmail}
                  className="flex w-full items-center gap-4 rounded-lg border px-4 py-3 text-left hover:bg-muted transition-colors"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50">
                    <Mail className="h-5 w-5 text-red-500" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Send via Gmail</p>
                    <p className="text-xs text-muted-foreground">Opens Gmail in browser with the invite pre-filled</p>
                  </div>
                </button>
              )}

              {/* WhatsApp */}
              <button
                type="button"
                onClick={openWhatsApp}
                className="flex w-full items-center gap-4 rounded-lg border px-4 py-3 text-left hover:bg-muted transition-colors"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-50">
                  <MessageCircle className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="font-medium text-sm">Send via WhatsApp</p>
                  <p className="text-xs text-muted-foreground">
                    {savedPhone
                      ? `Opens WhatsApp with message to ${savedPhone}`
                      : 'Opens WhatsApp — you can choose a contact there'}
                  </p>
                </div>
              </button>

              {/* SMS */}
              <button
                type="button"
                onClick={openSms}
                className="flex w-full items-center gap-4 rounded-lg border px-4 py-3 text-left hover:bg-muted transition-colors"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50">
                  <Phone className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="font-medium text-sm">Send via SMS</p>
                  <p className="text-xs text-muted-foreground">
                    {savedPhone
                      ? `Opens SMS app with message to ${savedPhone}`
                      : 'Opens SMS app — works best on mobile'}
                  </p>
                </div>
              </button>

              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 gap-1"
                  onClick={() => { resetForm() }}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Invite another
                </Button>
                <Button
                  type="button"
                  className="flex-1"
                  onClick={() => handleClose(false)}
                >
                  Done
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
