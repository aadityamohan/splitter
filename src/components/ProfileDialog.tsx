import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import {
  updateDisplayName,
  sendLinkPhoneOtp,
  confirmLinkPhoneOtp,
  sendUpdatePhoneOtp,
  confirmUpdatePhoneOtp,
  reloadCurrentUser,
  clearRecaptchaVerifier,
} from '@/lib/auth'
import type { ConfirmationResult } from 'firebase/auth'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  User,
  Mail,
  Phone,
  Pencil,
  Check,
  X,
  ArrowLeft,
  LogOut,
  ShieldCheck,
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────

function AvatarBlock({ name, photo }: { name: string; photo: string | null }) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <div className="flex flex-col items-center gap-2">
      {photo ? (
        <img
          src={photo}
          alt=""
          referrerPolicy="no-referrer"
          className="h-20 w-20 rounded-full border-2 border-border object-cover shadow"
        />
      ) : (
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground shadow">
          {initials || <User className="h-8 w-8" />}
        </div>
      )}
      <p className="text-lg font-semibold">{name}</p>
    </div>
  )
}

type PhoneStep = 'idle' | 'enter-number' | 'recaptcha' | 'enter-otp'

interface ProfileDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
}

export function ProfileDialog({ open, onOpenChange }: ProfileDialogProps) {
  const { user, signOut } = useAuth()

  // ── Name editing ──────────────────────────────────────────────────────────
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState('')
  const [nameBusy, setNameBusy] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [nameSuccess, setNameSuccess] = useState(false)

  // ── Phone flow ────────────────────────────────────────────────────────────
  const [phoneStep, setPhoneStep] = useState<PhoneStep>('idle')
  const [newPhone, setNewPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [phoneBusy, setPhoneBusy] = useState(false)
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [, setRecaptchaSolved] = useState(false)
  const confirmationRef = useRef<ConfirmationResult | null>(null)

  const hasPhone = Boolean(user?.phoneNumber)
  const hasGoogle = user?.providerData.some((p) => p.providerId === 'google.com') ?? false
  const displayName = user?.displayName ?? user?.email ?? user?.phoneNumber ?? 'User'

  // Populate name field when dialog opens
  useEffect(() => {
    if (open) {
      setNameValue(user?.displayName ?? '')
      setEditingName(false)
      setNameError(null)
      setNameSuccess(false)
      resetPhoneFlow()
    }
  }, [open, user?.displayName])

  // Render visible reCAPTCHA when entering the recaptcha step
  useEffect(() => {
    if (phoneStep === 'recaptcha') {
      setRecaptchaSolved(false)
      const sendOtp = async () => {
        const raw = newPhone.trim()
        const e164 = raw.startsWith('+') ? raw : raw.length === 10 ? `+91${raw}` : `+${raw}`
        setPhoneBusy(true)
        setPhoneError(null)
        try {
          const fn = hasPhone ? sendUpdatePhoneOtp : sendLinkPhoneOtp
          const confirmation = await fn(
            e164,
            'profile-recaptcha-container',
            () => setRecaptchaSolved(true),
          )
          confirmationRef.current = confirmation
          setPhoneStep('enter-otp')
        } catch (e) {
          setPhoneError(e instanceof Error ? e.message : 'Could not send OTP. Try again.')
          setPhoneStep('enter-number')
        } finally {
          setPhoneBusy(false)
        }
      }
      // Small delay so the container is in the DOM
      const t = setTimeout(() => { void sendOtp() }, 120)
      return () => clearTimeout(t)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phoneStep])

  function resetPhoneFlow() {
    setPhoneStep('idle')
    setNewPhone('')
    setOtp('')
    setPhoneError(null)
    setRecaptchaSolved(false)
    confirmationRef.current = null
    clearRecaptchaVerifier()
  }

  // ── Name save ─────────────────────────────────────────────────────────────
  const saveName = async () => {
    if (!nameValue.trim()) { setNameError('Name cannot be empty'); return }
    if (nameValue.trim() === user?.displayName) { setEditingName(false); return }
    setNameBusy(true)
    setNameError(null)
    try {
      await updateDisplayName(nameValue.trim())
      await reloadCurrentUser()
      setNameSuccess(true)
      setEditingName(false)
      setTimeout(() => setNameSuccess(false), 3000)
    } catch (e) {
      setNameError(e instanceof Error ? e.message : 'Could not update name.')
    } finally {
      setNameBusy(false)
    }
  }

  // ── OTP confirm ───────────────────────────────────────────────────────────
  const confirmOtp = async () => {
    if (!otp.trim() || !confirmationRef.current) return
    setPhoneBusy(true)
    setPhoneError(null)
    try {
      const fn = hasPhone ? confirmUpdatePhoneOtp : confirmLinkPhoneOtp
      await fn(confirmationRef.current, otp.trim())
      await reloadCurrentUser()
      resetPhoneFlow()
    } catch (e) {
      setPhoneError(e instanceof Error ? e.message : 'Invalid OTP. Try again.')
    } finally {
      setPhoneBusy(false)
    }
  }

  if (!user) return null

  return (
    <Dialog open={open} onOpenChange={(v) => { resetPhoneFlow(); onOpenChange(v) }}>
      <DialogContent className="max-w-sm gap-0 p-0 overflow-hidden">
        {/* Header gradient */}
        <div className="bg-primary/10 px-6 pt-8 pb-6">
          <DialogHeader className="mb-4">
            <DialogTitle className="sr-only">Your Profile</DialogTitle>
          </DialogHeader>
          <AvatarBlock name={displayName} photo={user.photoURL} />
        </div>

        <div className="space-y-5 px-6 py-6">
          {/* ── Display name ─────────────────────────────────────────── */}
          <section className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wide">
              <User className="h-3.5 w-3.5" /> Display name
            </Label>
            {editingName ? (
              <div className="flex gap-2">
                <Input
                  autoFocus
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void saveName()
                    if (e.key === 'Escape') setEditingName(false)
                  }}
                  placeholder="Your name"
                  className="flex-1"
                />
                <Button size="icon" variant="ghost" onClick={() => void saveName()} disabled={nameBusy}>
                  <Check className="h-4 w-4 text-green-600" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => setEditingName(false)}>
                  <X className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="flex-1 text-sm font-medium">
                  {user.displayName || <span className="text-muted-foreground italic">Not set</span>}
                </span>
                {nameSuccess && (
                  <span className="text-xs text-[#5A9690]">Saved!</span>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => { setEditingName(true); setNameError(null) }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
            {nameError && <p className="text-xs text-destructive">{nameError}</p>}
          </section>

          {/* ── Email ────────────────────────────────────────────────── */}
          {user.email && (
            <section className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wide">
                <Mail className="h-3.5 w-3.5" /> Email
              </Label>
              <div className="flex items-center gap-2">
                <span className="flex-1 truncate text-sm">{user.email}</span>
                {hasGoogle && (
                  <Badge variant="secondary" className="shrink-0 gap-1 text-xs">
                    <ShieldCheck className="h-3 w-3" /> Google
                  </Badge>
                )}
              </div>
            </section>
          )}

          {/* ── Phone number ─────────────────────────────────────────── */}
          <section className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wide">
              <Phone className="h-3.5 w-3.5" /> Phone number
            </Label>

            {/* idle — show current phone or add prompt */}
            {phoneStep === 'idle' && (
              <div className="flex items-center gap-2">
                <span className="flex-1 text-sm">
                  {hasPhone
                    ? user.phoneNumber
                    : <span className="text-muted-foreground italic">Not linked</span>}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 h-7 text-xs"
                  onClick={() => setPhoneStep('enter-number')}
                >
                  {hasPhone ? 'Change' : 'Add'}
                </Button>
              </div>
            )}

            {/* Step 1 — enter new number */}
            {phoneStep === 'enter-number' && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={resetPhoneFlow}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <span className="text-xs text-muted-foreground">
                    {hasPhone ? 'Enter new phone number' : 'Enter your phone number'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Input
                    autoFocus
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && newPhone.trim() && setPhoneStep('recaptcha')}
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    onClick={() => setPhoneStep('recaptcha')}
                    disabled={!newPhone.trim()}
                  >
                    Next
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  10-digit numbers get +91 added automatically.
                </p>
                {phoneError && <p className="text-xs text-destructive">{phoneError}</p>}
              </div>
            )}

            {/* Step 2 — reCAPTCHA + sending OTP (auto-progresses) */}
            {phoneStep === 'recaptcha' && (
              <div className="space-y-2">
                {phoneBusy ? (
                  <p className="text-xs text-muted-foreground">Sending OTP…</p>
                ) : (
                  <div className="flex justify-center">
                    <div id="profile-recaptcha-container" />
                  </div>
                )}
                {phoneError && <p className="text-xs text-destructive">{phoneError}</p>}
              </div>
            )}

            {/* Step 3 — enter OTP */}
            {phoneStep === 'enter-otp' && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => { resetPhoneFlow(); setPhoneStep('enter-number') }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <span className="text-xs text-muted-foreground">
                    OTP sent to <strong>{newPhone}</strong>
                  </span>
                </div>
                <div className="flex gap-2">
                  <Input
                    autoFocus
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="6-digit OTP"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    onKeyDown={(e) => e.key === 'Enter' && !phoneBusy && void confirmOtp()}
                    className="flex-1 tracking-widest text-center"
                  />
                  <Button
                    size="sm"
                    onClick={() => void confirmOtp()}
                    disabled={phoneBusy || otp.length < 6}
                  >
                    {phoneBusy ? '…' : 'Verify'}
                  </Button>
                </div>
                {phoneError && <p className="text-xs text-destructive">{phoneError}</p>}
              </div>
            )}
          </section>

          {/* ── Account info ─────────────────────────────────────────── */}
          <section className="rounded-lg border bg-muted/30 px-4 py-3 text-xs text-muted-foreground space-y-1">
            <p>
              <span className="font-medium text-foreground">UID:</span>{' '}
              <span className="font-mono break-all">{user.uid}</span>
            </p>
            {user.metadata.creationTime && (
              <p>
                <span className="font-medium text-foreground">Member since:</span>{' '}
                {new Date(user.metadata.creationTime).toLocaleDateString('en-IN', {
                  day: 'numeric', month: 'long', year: 'numeric',
                })}
              </p>
            )}
          </section>

          {/* ── Sign out ──────────────────────────────────────────────── */}
          <Button
            variant="outline"
            className="w-full gap-2 text-destructive border-destructive/40 hover:bg-destructive/10"
            onClick={() => void signOut()}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
