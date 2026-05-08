/**
 * Server-side auth helpers — wraps Supabase Auth.
 *
 * Boundary: this is the only module (besides the Supabase client modules) that
 * calls `supabase.auth.*`. Everything else goes through `getRequestContext`.
 *
 * IMPORTANT: All functions here are server-only. They read/write cookies via
 * `next/headers`. Importing from a client component will trip Next.js'
 * 'use server' boundary. Server actions in `app/(auth)/_components/auth-actions.ts`
 * call into these functions.
 */

import { eq } from 'drizzle-orm'
import { users } from '@/db/schema'
import { getDb } from '@/db/client'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { logger, LOG_EVENTS } from '@/logging'
import { clearActiveOrgCookie } from '@/lib/active-org-cookie'

export type SignInInput = { email: string; password: string }
export type SignUpInput = { email: string; password: string }

export type AuthResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'invalid_credentials' | 'email_taken' | 'unknown'; message?: string }

/** Sign in with email + password. Sets the Supabase session cookie. */
export async function signInWithPassword(input: SignInInput): Promise<AuthResult> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.signInWithPassword(input)
  if (error || !data.user) {
    logger.log(LOG_EVENTS.AUTH_SIGNIN_FAILED, {
      // Never log the email or password — keep PII minimal per spec.
      reason: error?.message ?? 'unknown',
    })
    return { ok: false, reason: 'invalid_credentials' }
  }
  logger.log(LOG_EVENTS.AUTH_SIGNIN, { userId: data.user.id })
  return { ok: true, userId: data.user.id }
}

/**
 * Sign up. Creates the Supabase auth user AND a mirror row in `public.users`
 * so foreign-key joins work for new accounts immediately.
 *
 * Does NOT create an organization or membership — first sign-in lands the
 * user on the "create your first org / accept invite" flow.
 */
export async function signUp(input: SignUpInput): Promise<AuthResult> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.signUp(input)
  if (error || !data.user) {
    const taken = /already (registered|exists)/i.test(error?.message ?? '')
    logger.warn('auth.signup_failed', { reason: error?.message ?? 'unknown' })
    return {
      ok: false,
      reason: taken ? 'email_taken' : 'unknown',
      message: error?.message,
    }
  }

  // Mirror the auth user into our `users` table. Idempotent: if a row already
  // exists (rare race), do nothing. This is the only place outside repositories
  // we write directly — justified because `users` is identity, not a tenant
  // resource, and there is no `org_id` involved.
  const db = getDb()
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.id, data.user.id)).limit(1)
  if (existing.length === 0) {
    await db.insert(users).values({ id: data.user.id, email: input.email })
  }

  logger.log(LOG_EVENTS.AUTH_SIGNUP, { userId: data.user.id })
  return { ok: true, userId: data.user.id }
}

/** Sign out. Clears Supabase session AND the active-org cookie. */
export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient()
  // Capture user before signOut nukes the session.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  await supabase.auth.signOut()
  await clearActiveOrgCookie()
  logger.log(LOG_EVENTS.AUTH_SIGNOUT, { userId: user?.id ?? 'unknown' })
}

/**
 * Request a password-reset email.
 *
 * SECURITY: do NOT leak whether the email is registered. We always return
 * `ok: true` after validation passes, regardless of Supabase's underlying
 * response. The Supabase client's `resetPasswordForEmail` already implements
 * "don't 404 on missing email" but we surface a uniform success regardless.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const supabase = await createSupabaseServerClient()
  const redirectTo = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/sign-in`
    : undefined
  // Best-effort. We log the attempt but never expose the result.
  await supabase.auth
    .resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined)
    .catch(() => undefined)
  logger.log(LOG_EVENTS.AUTH_PASSWORD_RESET_REQUESTED, {})
}
