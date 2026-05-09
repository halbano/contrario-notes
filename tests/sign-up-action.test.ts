/**
 * VAL-02: signUpAction surfaces "email confirmation required" without redirecting.
 *
 * When Supabase email-confirmation is enabled, `signUp` returns
 * `{ ok: true, sessionCreated: false }`. The server action MUST return that
 * shape to the form (so the UI can render the "Check your email" view)
 * instead of redirecting home — there's no session cookie yet, so the home
 * route would just bounce back to /sign-in.
 *
 * When `sessionCreated: true` (confirmation off, immediate session), the
 * action redirects to `/` as before.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { AuthResult } from '@/features/auth/server/auth-server'

const signUpServerMock = vi.fn<(input: { email: string; password: string }) => Promise<AuthResult>>()
const signInServerMock = vi.fn()
const requestPasswordResetServerMock = vi.fn()
const signOutServerMock = vi.fn()
const resendSignupConfirmationMock = vi.fn()
const redirectMock = vi.fn((path: string) => {
  // Mirror Next.js's `redirect()` semantics: throw a sentinel so callers
  // never proceed past it.
  throw new RedirectError(path)
})

class RedirectError extends Error {
  constructor(public path: string) {
    super(`NEXT_REDIRECT:${path}`)
  }
}

vi.mock('@/features/auth/server/auth-server', () => ({
  signUp: signUpServerMock,
  signInWithPassword: signInServerMock,
  requestPasswordReset: requestPasswordResetServerMock,
  signOut: signOutServerMock,
  resendSignupConfirmation: resendSignupConfirmationMock,
}))

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}))

beforeEach(() => {
  signUpServerMock.mockReset()
  signInServerMock.mockReset()
  requestPasswordResetServerMock.mockReset()
  signOutServerMock.mockReset()
  resendSignupConfirmationMock.mockReset()
  redirectMock.mockClear()
})

afterEach(() => {
  vi.resetModules()
})

function fd(values: Record<string, string>): FormData {
  const form = new FormData()
  for (const [k, v] of Object.entries(values)) form.set(k, v)
  return form
}

describe('signUpAction (VAL-02)', () => {
  it('returns { ok: true, requiresEmailConfirmation: true } when sessionCreated is false (no redirect)', async () => {
    signUpServerMock.mockResolvedValueOnce({
      ok: true,
      userId: 'u-1',
      sessionCreated: false,
    })
    const { signUpAction } = await import('@/app/(auth)/_components/auth-actions')
    const out = await signUpAction(
      fd({ email: 'new@example.com', password: 'Sup3rGood', confirmPassword: 'Sup3rGood' }),
    )
    expect(out).toEqual({ ok: true, requiresEmailConfirmation: true })
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it('redirects to "/" when sessionCreated is true', async () => {
    signUpServerMock.mockResolvedValueOnce({
      ok: true,
      userId: 'u-2',
      sessionCreated: true,
    })
    const { signUpAction } = await import('@/app/(auth)/_components/auth-actions')
    await expect(
      signUpAction(
        fd({ email: 'auto@example.com', password: 'Sup3rGood', confirmPassword: 'Sup3rGood' }),
      ),
    ).rejects.toThrow(/NEXT_REDIRECT:\//)
    expect(redirectMock).toHaveBeenCalledWith('/')
  })

  it('returns generic failure (no redirect) when signUp fails', async () => {
    signUpServerMock.mockResolvedValueOnce({ ok: false, reason: 'unknown' })
    const { signUpAction } = await import('@/app/(auth)/_components/auth-actions')
    const out = await signUpAction(
      fd({ email: 'x@example.com', password: 'Sup3rGood', confirmPassword: 'Sup3rGood' }),
    )
    expect(out).toEqual({ ok: false, message: 'Unable to create account.' })
    expect(redirectMock).not.toHaveBeenCalled()
  })
})

describe('resendConfirmationAction (VAL-02)', () => {
  it('always returns { ok: true } regardless of email validity (no existence leak)', async () => {
    resendSignupConfirmationMock.mockResolvedValueOnce(undefined)
    const { resendConfirmationAction } = await import('@/app/(auth)/_components/auth-actions')
    const out = await resendConfirmationAction(fd({ email: 'maybe@example.com' }))
    expect(out).toEqual({ ok: true })
    expect(resendSignupConfirmationMock).toHaveBeenCalledWith('maybe@example.com')
  })

  it('returns { ok: true } even when the input email is malformed (no field errors leaked)', async () => {
    resendSignupConfirmationMock.mockResolvedValueOnce(undefined)
    const { resendConfirmationAction } = await import('@/app/(auth)/_components/auth-actions')
    const out = await resendConfirmationAction(fd({ email: 'not-an-email' }))
    expect(out).toEqual({ ok: true })
    // Bad email is silently dropped (we don't call Supabase) — matters because
    // a 400 here would leak that the email failed validation.
    expect(resendSignupConfirmationMock).not.toHaveBeenCalled()
  })
})
