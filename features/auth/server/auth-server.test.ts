import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

/**
 * Auth-server contract tests.
 *
 * Critical assertion: `requestPasswordReset` MUST NOT leak whether the
 * email exists. Supabase already promises a uniform response, but we
 * additionally guarantee the *call* is always issued and the helper never
 * surfaces an existence-distinguishing error to callers.
 *
 * We mock the Supabase server client so we can simulate "user found" and
 * "user not found" responses and assert the auth-server's behavior is
 * indistinguishable to the caller.
 */

const resetMock = vi.fn()
const signInMock = vi.fn()
const signOutMock = vi.fn()
const getUserMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      resetPasswordForEmail: resetMock,
      signInWithPassword: signInMock,
      signOut: signOutMock,
      getUser: getUserMock,
    },
  }),
}))

vi.mock('@/lib/active-org-cookie', () => ({
  clearActiveOrgCookie: async () => undefined,
}))

beforeEach(() => {
  resetMock.mockReset()
  signInMock.mockReset()
  signOutMock.mockReset()
  getUserMock.mockReset()
})

afterEach(() => {
  vi.resetModules()
})

describe('requestPasswordReset — does not leak email existence', () => {
  it('returns void identically when Supabase reports the email exists', async () => {
    resetMock.mockResolvedValueOnce({ data: {}, error: null })
    const { requestPasswordReset } = await import('./auth-server')
    const out = await requestPasswordReset('exists@example.com')
    expect(out).toBeUndefined()
    expect(resetMock).toHaveBeenCalledTimes(1)
  })

  it('returns void identically when Supabase reports the email does NOT exist', async () => {
    // Even if Supabase signaled an error (it normally doesn't, but we
    // defensively handle it), the auth-server must NOT surface that to
    // the caller.
    resetMock.mockRejectedValueOnce(new Error('email not found'))
    const { requestPasswordReset } = await import('./auth-server')
    const out = await requestPasswordReset('missing@example.com')
    expect(out).toBeUndefined()
    expect(resetMock).toHaveBeenCalledTimes(1)
  })

  it('always calls resetPasswordForEmail with the supplied email', async () => {
    resetMock.mockResolvedValueOnce({ data: {}, error: null })
    const { requestPasswordReset } = await import('./auth-server')
    await requestPasswordReset('user@example.com')
    // The second arg is `{ redirectTo }` when NEXT_PUBLIC_APP_URL is set,
    // and `undefined` otherwise. The test env may have either; assert only
    // on the first arg to avoid environmental flake.
    expect(resetMock).toHaveBeenCalledTimes(1)
    expect(resetMock.mock.calls[0]?.[0]).toBe('user@example.com')
  })
})

describe('signInWithPassword — does not distinguish unknown email vs wrong password', () => {
  it('returns invalid_credentials regardless of which side of the credential failed', async () => {
    signInMock.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials' },
    })
    const { signInWithPassword } = await import('./auth-server')
    const out = await signInWithPassword({ email: 'no@x.com', password: 'wrong' })
    expect(out).toEqual({ ok: false, reason: 'invalid_credentials' })
  })
})
