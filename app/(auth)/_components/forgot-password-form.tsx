'use client'

import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { requestPasswordReset } from './auth-actions'
import { forgotPasswordSchema, type AuthFieldErrors } from './auth-schemas'

/**
 * Forgot-password form.
 *
 * Calls the `requestPasswordReset` server action. Per security best-practice
 * the response is uniform: same success message regardless of whether the
 * email is registered. The server action enforces this; the UI just displays.
 */
interface State {
  fieldErrors: AuthFieldErrors
  submittedEmail: string | null
  pending: boolean
}

const initialState: State = { fieldErrors: {}, submittedEmail: null, pending: false }

export function ForgotPasswordForm() {
  const [state, setState] = React.useState<State>(initialState)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const formData = new FormData(form)
    const parsed = forgotPasswordSchema.safeParse({
      email: formData.get('email'),
    })
    if (!parsed.success) {
      setState({
        ...initialState,
        fieldErrors: parsed.error.flatten().fieldErrors as AuthFieldErrors,
      })
      return
    }
    setState({ fieldErrors: {}, submittedEmail: null, pending: true })
    const result = await requestPasswordReset(formData)
    if (!result.ok) {
      setState({
        fieldErrors: result.fieldErrors ?? {},
        submittedEmail: null,
        pending: false,
      })
      return
    }
    setState({ fieldErrors: {}, submittedEmail: parsed.data.email, pending: false })
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

      <Button type="submit" className="w-full" disabled={state.pending}>
        {state.pending ? 'Sending…' : 'Send reset link'}
      </Button>
    </form>
  )
}
