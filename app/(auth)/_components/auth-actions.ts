'use server'

/**
 * Auth server actions.
 *
 * Validates input via Zod, then delegates to `features/auth/server/auth-server.ts`.
 * Forms are wired to these via the React 19 `<form action={...}>` pattern.
 *
 * Security:
 *   - Server-side validation always runs FIRST (defense in depth).
 *   - Sign-in / sign-up errors are intentionally generic (`invalid_credentials`)
 *     — never leak whether an email is registered.
 *   - Password reset always returns `ok: true` after validation passes,
 *     regardless of whether the email exists.
 */

import { redirect } from 'next/navigation'
import {
  forgotPasswordSchema,
  signInSchema,
  signUpSchema,
  type AuthActionResult,
  type AuthFieldErrors,
} from './auth-schemas'
import {
  requestPasswordReset as requestPasswordResetServer,
  signInWithPassword,
  signOut,
  signUp as signUpServer,
} from '@/features/auth/server/auth-server'

function flattenErrors(err: { flatten: () => { fieldErrors: Record<string, string[] | undefined> } }) {
  const out: AuthFieldErrors = {}
  for (const [k, v] of Object.entries(err.flatten().fieldErrors)) {
    if (v && v.length > 0) out[k] = v
  }
  return out
}

export async function signInAction(formData: FormData): Promise<AuthActionResult> {
  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    return { ok: false, fieldErrors: flattenErrors(parsed.error) }
  }
  const result = await signInWithPassword(parsed.data)
  if (!result.ok) {
    return { ok: false, message: 'Invalid email or password.' }
  }
  redirect('/')
}

export async function signUpAction(formData: FormData): Promise<AuthActionResult> {
  const parsed = signUpSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  })
  if (!parsed.success) {
    return { ok: false, fieldErrors: flattenErrors(parsed.error) }
  }
  const result = await signUpServer({ email: parsed.data.email, password: parsed.data.password })
  if (!result.ok) {
    if (result.reason === 'email_taken') {
      // Generic message — do NOT reveal that the email is taken.
      return { ok: false, message: 'Unable to create account.' }
    }
    return { ok: false, message: 'Unable to create account.' }
  }
  redirect('/')
}

export async function requestPasswordReset(
  formData: FormData,
): Promise<AuthActionResult> {
  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get('email'),
  })
  if (!parsed.success) {
    return { ok: false, fieldErrors: flattenErrors(parsed.error) }
  }
  // Always return ok regardless of whether the email exists.
  await requestPasswordResetServer(parsed.data.email)
  return { ok: true }
}

export async function signOutAction(): Promise<void> {
  await signOut()
  redirect('/sign-in')
}
