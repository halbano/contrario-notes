'use client'

import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ErrorState } from '@/components/states'
import { signUpAction } from './auth-actions'
import { signUpSchema, type AuthFieldErrors } from './auth-schemas'

interface State {
  pending: boolean
  fieldErrors: AuthFieldErrors
  formError: string | null
}

const initialState: State = { pending: false, fieldErrors: {}, formError: null }

export function SignUpForm() {
  const [state, setState] = React.useState<State>(initialState)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const formData = new FormData(form)
    const parsed = signUpSchema.safeParse({
      email: formData.get('email'),
      password: formData.get('password'),
      confirmPassword: formData.get('confirmPassword'),
    })
    if (!parsed.success) {
      setState({
        pending: false,
        fieldErrors: parsed.error.flatten().fieldErrors as AuthFieldErrors,
        formError: null,
      })
      return
    }
    setState({ pending: true, fieldErrors: {}, formError: null })
    const result = await signUpAction(formData)
    setState({
      pending: false,
      fieldErrors: result.fieldErrors ?? {},
      formError: result.ok ? null : (result.message ?? 'Unable to create account.'),
    })
  }

  const emailErr = state.fieldErrors.email?.[0]
  const passwordErr = state.fieldErrors.password?.[0]
  const confirmErr = state.fieldErrors.confirmPassword?.[0]

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="space-y-4"
      aria-describedby={state.formError ? 'sign-up-form-error' : undefined}
    >
      {state.formError ? (
        <div id="sign-up-form-error">
          <ErrorState
            title="Sign-up unavailable"
            description={state.formError}
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

      <Button type="submit" className="w-full" disabled={state.pending}>
        {state.pending ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  )
}
