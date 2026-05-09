/**
 * Unit tests for the `/auth/callback` route handler (VAL-01).
 *
 * The handler exchanges a Supabase auth `code` query param for a session
 * cookie via `supabase.auth.exchangeCodeForSession`, then redirects to the
 * (validated) `redirectTo`. Failure paths must NOT leak whether the code was
 * valid — they redirect uniformly to `/sign-in?error=callback_failed`.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const exchangeMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { exchangeCodeForSession: exchangeMock },
  }),
}))

beforeEach(() => {
  exchangeMock.mockReset()
})

afterEach(() => {
  vi.resetModules()
})

function buildRequest(url: string): Request {
  return new Request(url)
}

describe('GET /auth/callback', () => {
  it('exchanges the code and 303-redirects to the requested redirectTo on success', async () => {
    exchangeMock.mockResolvedValueOnce({ data: { session: { user: { id: 'u' } } }, error: null })
    const { GET } = await import('@/app/auth/callback/route')
    const res = await GET(buildRequest('https://app.example.com/auth/callback?code=abc&redirectTo=/notes'))
    expect(exchangeMock).toHaveBeenCalledWith('abc')
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('https://app.example.com/notes')
  })

  it('defaults redirectTo to "/" when the param is absent', async () => {
    exchangeMock.mockResolvedValueOnce({ data: { session: { user: { id: 'u' } } }, error: null })
    const { GET } = await import('@/app/auth/callback/route')
    const res = await GET(buildRequest('https://app.example.com/auth/callback?code=abc'))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('https://app.example.com/')
  })

  it('redirects to /sign-in?error=callback_failed when the exchange returns an error', async () => {
    exchangeMock.mockResolvedValueOnce({ data: { session: null }, error: { message: 'invalid grant' } })
    const { GET } = await import('@/app/auth/callback/route')
    const res = await GET(buildRequest('https://app.example.com/auth/callback?code=bad'))
    expect(res.status).toBe(303)
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('/sign-in')
    expect(loc).toContain('error=callback_failed')
    // Generic error: must NOT leak Supabase error message detail.
    expect(loc).not.toContain('invalid')
  })

  it('redirects to /sign-in?error=callback_failed when the code is missing', async () => {
    const { GET } = await import('@/app/auth/callback/route')
    const res = await GET(buildRequest('https://app.example.com/auth/callback'))
    expect(exchangeMock).not.toHaveBeenCalled()
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('error=callback_failed')
  })

  it('rejects external/protocol-relative redirectTo to prevent open-redirect (only same-origin paths allowed)', async () => {
    exchangeMock.mockResolvedValueOnce({ data: { session: { user: { id: 'u' } } }, error: null })
    const { GET } = await import('@/app/auth/callback/route')
    const res = await GET(
      buildRequest('https://app.example.com/auth/callback?code=abc&redirectTo=//evil.example/path'),
    )
    expect(res.status).toBe(303)
    // Falls back to "/" rather than honouring the external target.
    expect(res.headers.get('location')).toBe('https://app.example.com/')
  })
})
