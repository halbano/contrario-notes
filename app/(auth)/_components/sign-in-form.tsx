'use client'

import * as React from 'react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ErrorState } from '@/components/states'
import { signInAction } from './auth-actions'
import { signInSchema, type AuthFieldErrors } from './auth-schemas'

interface State {
  pending: boolean
  fieldErrors: AuthFieldErrors
  formError: string | null
}

const initialState: State = { pending: false, fieldErrors: {}, formError: null }

export function SignInForm() {
  const [state, setState] = React.useState<State>(initialState)
  const formRef = React.useRef<HTMLFormElement>(null)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const formData = new FormData(form)
    const parsed = signInSchema.safeParse({
      email: formData.get('email'),
      password: formData.get('password'),
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
    const result = await signInAction(formData)
    setState({
      pending: false,
      fieldErrors: result.fieldErrors ?? {},
      formError: result.ok ? null : (result.message ?? 'Unable to sign in.'),
    })
  }

  const emailErr = state.fieldErrors.email?.[0]
  const passwordErr = state.fieldErrors.password?.[0]

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      noValidate
      className="space-y-4"
      aria-describedby={state.formError ? 'sign-in-form-error' : undefined}
    >
      {state.formError ? (
        <div id="sign-in-form-error">
          <ErrorState
            title="Sign-in unavailable"
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
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link
            href="/sign-in"
            className="text-small text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            aria-label="Forgot password (not yet available)"
          >
            Forgot?
          </Link>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(passwordErr) || undefined}
          aria-describedby={passwordErr ? 'password-error' : undefined}
        />
        {passwordErr ? (
          <p id="password-error" className="text-small text-destructive">
            {passwordErr}
          </p>
        ) : null}
      </div>

      <Button type="submit" className="w-full" disabled={state.pending}>
        {state.pending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  )
}
