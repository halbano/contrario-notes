'use client'

import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { forgotPasswordSchema, type AuthFieldErrors } from './auth-schemas'

/**
 * Forgot-password form (UI stub).
 *
 * On submit we run client-side Zod validation only and flip into a local
 * "submitted" state showing the "Check your inbox" confirmation. The server
 * action `requestPasswordReset` exists (`auth-actions.ts`) but is not called
 * here yet — the `auth-agent` will replace this stub with a real call once
 * Supabase is wired. Per security best-practice, the eventual success
 * response must NOT leak whether the email is registered.
 */
interface State {
  fieldErrors: AuthFieldErrors
  submittedEmail: string | null
}

const initialState: State = { fieldErrors: {}, submittedEmail: null }

export function ForgotPasswordForm() {
  const [state, setState] = React.useState<State>(initialState)

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const parsed = forgotPasswordSchema.safeParse({
      email: formData.get('email'),
    })
    if (!parsed.success) {
      setState({
        fieldErrors: parsed.error.flatten().fieldErrors as AuthFieldErrors,
        submittedEmail: null,
      })
      return
    }
    // TODO(auth-agent): replace with `requestPasswordReset(formData)` call and
    // surface server-side validation errors via `result.fieldErrors`.
    setState({ fieldErrors: {}, submittedEmail: parsed.data.email })
  }

  if (state.submittedEmail) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="space-y-3 rounded-md border border-border bg-muted/40 p-4"
      >
        <p className="text-body font-medium text-foreground">
          Check your inbox
        </p>
        <p className="text-small text-muted-foreground">
          If an account exists for{' '}
          <span className="font-medium text-foreground">
            {state.submittedEmail}
          </span>
          , we&apos;ve sent a link to reset your password. The link expires in
          one hour.
        </p>
        <button
          type="button"
          onClick={() => setState(initialState)}
          className="text-small font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline"
        >
          Use a different email
        </button>
      </div>
    )
  }

  const emailErr = state.fieldErrors.email?.[0]

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={Boolean(emailErr) || undefined}
          aria-describedby={emailErr ? 'email-error' : 'email-hint'}
        />
        {emailErr ? (
          <p id="email-error" className="text-small text-destructive">
            {emailErr}
          </p>
        ) : (
          <p id="email-hint" className="text-small text-muted-foreground">
            We&apos;ll send a reset link to this address.
          </p>
        )}
      </div>

      <Button type="submit" className="w-full">
        Send reset link
      </Button>
    </form>
  )
}
