import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Scale, Phone, ArrowLeft, RefreshCw } from 'lucide-react'
import { sendPhoneOtp, verifyPhoneOtp, clearRecaptchaVerifier, initRecaptchaVerifier } from '@/lib/auth'
import type { ConfirmationResult } from 'firebase/auth'
import { ThemeToggle } from '@/components/ThemeToggle'

// ── Helpers ───────────────────────────────────────────────────────────────────

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="currentColor"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="currentColor"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="currentColor"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

type Tab = 'google' | 'phone'
type PhoneStep = 'enter-phone' | 'enter-otp'

export function LoginPage() {
  const { signInWithGoogle } = useAuth()
  const [tab, setTab] = useState<Tab>('google')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Phone OTP state
  const [phoneStep, setPhoneStep] = useState<PhoneStep>('enter-phone')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [otp, setOtp] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [recaptchaSolved, setRecaptchaSolved] = useState(false)
  const confirmationRef = useRef<ConfirmationResult | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Render visible reCAPTCHA checkbox when the phone tab opens
  useEffect(() => {
    if (tab === 'phone' && phoneStep === 'enter-phone') {
      setRecaptchaSolved(false)
      const t = setTimeout(() => {
        void initRecaptchaVerifier('recaptcha-container', () => setRecaptchaSolved(true))
      }, 100)
      return () => clearTimeout(t)
    } else {
      clearRecaptchaVerifier()
      setRecaptchaSolved(false)
    }
  }, [tab, phoneStep])

  // Clean up on unmount
  useEffect(() => {
    return () => {
      clearRecaptchaVerifier()
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  function startCountdown(seconds = 60) {
    setCountdown(seconds)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timerRef.current!)
          return 0
        }
        return c - 1
      })
    }, 1000)
  }

  // ── Google ────────────────────────────────────────────────────────────────

  const handleGoogle = async () => {
    setError(null)
    setBusy(true)
    try {
      await signInWithGoogle()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Sign-in failed. Try again.')
    } finally {
      setBusy(false)
    }
  }

  // ── Phone OTP ─────────────────────────────────────────────────────────────

  const handleSendOtp = async () => {
    setError(null)
    const raw = phoneNumber.trim()
    if (!raw) { setError('Enter your phone number first.'); return }

    // Auto-prepend +91 for 10-digit Indian numbers
    const e164 = raw.startsWith('+') ? raw : raw.length === 10 ? `+91${raw}` : `+${raw}`

    setBusy(true)
    try {
      const confirmation = await sendPhoneOtp(e164)
      confirmationRef.current = confirmation
      setPhoneStep('enter-otp')
      startCountdown(60)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not send OTP. Check the number and try again.')
    } finally {
      setBusy(false)
    }
  }

  const handleVerifyOtp = async () => {
    setError(null)
    if (!otp.trim()) { setError('Enter the 6-digit OTP.'); return }
    if (!confirmationRef.current) { setError('Session expired. Send OTP again.'); return }
    setBusy(true)
    try {
      await verifyPhoneOtp(confirmationRef.current, otp.trim())
      // onAuthStateChanged in AuthContext handles the rest
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Invalid OTP. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const handleResendOtp = async () => {
    clearRecaptchaVerifier()
    confirmationRef.current = null
    setOtp('')
    setPhoneStep('enter-phone')
    setError(null)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-4">
      {/* Theme toggle — top-right */}
      <div className="fixed top-3 right-3">
        <ThemeToggle />
      </div>

      <div className="flex items-center gap-2 text-2xl font-bold tracking-tight">
        <Scale className="h-8 w-8" />
        Splitter
      </div>

      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            Choose how you'd like to sign in.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Tab switcher */}
          <div className="flex rounded-lg border p-1 gap-1">
            <button
              type="button"
              onClick={() => { setTab('google'); setError(null) }}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                tab === 'google'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Google
            </button>
            <button
              type="button"
              onClick={() => { setTab('phone'); setError(null) }}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium transition-colors ${
                tab === 'phone'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Phone className="h-3.5 w-3.5" />
              Phone number
            </button>
          </div>

          {/* ── Google tab ── */}
          {tab === 'google' && (
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full gap-2 border-2"
              onClick={handleGoogle}
              disabled={busy}
            >
              <GoogleIcon className="h-5 w-5" />
              {busy ? 'Signing in…' : 'Continue with Google'}
            </Button>
          )}

          {/* ── Phone tab ── */}
          {tab === 'phone' && phoneStep === 'enter-phone' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="phone-input">Mobile number</Label>
                <div className="flex gap-2">
                  <Input
                    id="phone-input"
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !busy && recaptchaSolved && void handleSendOtp()}
                    className="flex-1"
                    autoComplete="tel"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Include country code (e.g. +91 for India). 10-digit numbers get +91 automatically.
                </p>
              </div>

              {/* Visible reCAPTCHA checkbox — must be ticked before sending OTP */}
              <div className="flex justify-center">
                <div id="recaptcha-container" />
              </div>

              <Button
                type="button"
                className="w-full gap-2"
                onClick={handleSendOtp}
                disabled={busy || !phoneNumber.trim() || !recaptchaSolved}
              >
                <Phone className="h-4 w-4" />
                {busy ? 'Sending OTP…' : 'Send OTP'}
              </Button>
            </div>
          )}

          {tab === 'phone' && phoneStep === 'enter-otp' && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleResendOtp}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Change number
              </button>

              <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">
                OTP sent to <span className="font-semibold">{phoneNumber}</span>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="otp-input">Enter 6-digit OTP</Label>
                <Input
                  id="otp-input"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="123456"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={(e) => e.key === 'Enter' && !busy && void handleVerifyOtp()}
                  autoFocus
                  className="text-center text-lg tracking-widest"
                />
              </div>

              <Button
                type="button"
                className="w-full"
                onClick={handleVerifyOtp}
                disabled={busy || otp.length < 6}
              >
                {busy ? 'Verifying…' : 'Verify & Sign in'}
              </Button>

              <div className="flex items-center justify-center">
                {countdown > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Resend OTP in {countdown}s
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Resend OTP
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Error message */}
          {error ? (
            <p className="text-center text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <p className="max-w-md text-center text-xs text-muted-foreground">
        By signing in you agree to use this app responsibly. Phone verification is powered by Firebase.
      </p>
    </div>
  )
}
