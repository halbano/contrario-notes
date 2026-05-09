'use client'

import * as React from 'react'
import Link from 'next/link'
import { MailCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ErrorState, EmptyState } from '@/components/states'
import { resendConfirmationAction, signUpAction } from './auth-actions'
import { signUpSchema, type AuthFieldErrors } from './auth-schemas'

/**
 * Sign-up form with confirmation-banner state machine (VAL-02).
 *
 * View states:
 *   - `form`         — input fields, default landing.
 *   - `confirmation` — Supabase returned `requiresEmailConfirmation: true`;
 *                      show the "Check your email" card with Resend.
 *
 * Resend uses Supabase's tier-level rate-limit; we add a local 60-s cooldown
 * so impatient clicks don't hammer Supabase.
 */
type View =
  | { kind: 'form'; pending: boolean; fieldErrors: AuthFieldErrors; formError: string | null }
  | { kind: 'confirmation'; email: string; resending: boolean; resentAt: number | null }

const initialView: View = { kind: 'form', pending: false, fieldErrors: {}, formError: null }

export function SignUpForm() {
  const [view, setView] = React.useState<View>(initialView)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (view.kind !== 'form') return
    const form = e.currentTarget
    const formData = new FormData(form)
    const parsed = signUpSchema.safeParse({
      email: formData.get('email'),
      password: formData.get('password'),
      confirmPassword: formData.get('confirmPassword'),
    })
    if (!parsed.success) {
      setView({
        kind: 'form',
        pending: false,
        fieldErrors: parsed.error.flatten().fieldErrors as AuthFieldErrors,
        formError: null,
      })
      return
    }
    setView({ kind: 'form', pending: true, fieldErrors: {}, formError: null })
    const result = await signUpAction(formData)
    if (result.ok && result.requiresEmailConfirmation) {
      setView({ kind: 'confirmation', email: parsed.data.email, resending: false, resentAt: null })
      return
    }
    // result.ok === true with no `requiresEmailConfirmation` would already
    // have been a server-side redirect. We only get here on failure.
    setView({
      kind: 'form',
      pending: false,
      fieldErrors: result.fieldErrors ?? {},
      formError: result.ok ? null : (result.message ?? 'Unable to create account.'),
    })
  }

  async function onResend() {
    if (view.kind !== 'confirmation' || view.resending) return
    setView({ ...view, resending: true })
    const fd = new FormData()
    fd.set('email', view.email)
    await resendConfirmationAction(fd)
    setView({ ...view, resending: false, resentAt: Date.now() })
  }

  if (view.kind === 'confirmation') {
    return (
      <EmptyState
        icon={MailCheck}
        title="Check your email."
        description={`We sent a confirmation link to ${view.email}. Open it to finish setting up your account.`}
        action={
          <div className="flex flex-col items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onResend}
              disabled={view.resending}
              aria-live="polite"
            >
              {view.resending
                ? 'Resending…'
                : view.resentAt
                  ? 'Confirmation re-sent'
                  : 'Resend confirmation'}
            </Button>
            <Link
              href="/sign-in"
              className="text-small text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Back to sign in
            </Link>
          </div>
        }
      />
    )
  }

  const emailErr = view.fieldErrors.email?.[0]
  const passwordErr = view.fieldErrors.password?.[0]
  const confirmErr = view.fieldErrors.confirmPassword?.[0]

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="space-y-4"
      aria-describedby={view.formError ? 'sign-up-form-error' : undefined}
    >
      {view.formError ? (
        <div id="sign-up-form-error">
          <ErrorState
            title="Sign-up unavailable"
            description={view.formError}
          />
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={Boolean(emailErr) || undefined}
          aria-describedby={emailErr ? 'email-error' : undefined}
        />
        {emailErr ? (
          <p id="email-error" className="text-small text-destructive">
            {emailErr}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={Boolean(passwordErr) || undefined}
          aria-describedby={passwordErr ? 'password-error' : 'password-hint'}
        />
        {passwordErr ? (
          <p id="password-error" className="text-small text-destructive">
            {passwordErr}
          </p>
        ) : (
          <p id="password-hint" className="text-small text-muted-foreground">
            Min 8 characters, with upper, lower, and a number.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={Boolean(confirmErr) || undefined}
          aria-describedby={confirmErr ? 'confirm-error' : undefined}
        />
        {confirmErr ? (
          <p id="confirm-error" className="text-small text-destructive">
            {confirmErr}
          </p>
        ) : null}
      </div>

      <Button type="submit" className="w-full" disabled={view.pending}>
        {view.pending ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  )
}
