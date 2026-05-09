/**
 * Tests for the orphan redirect helper used by `app/(app)/layout.tsx` (VAL-09).
 */

import { describe, expect, it, vi } from 'vitest'

import { AppError } from './errors'
import { requireMembershipOrRedirect } from './require-membership'

describe('requireMembershipOrRedirect (VAL-09)', () => {
  it('returns the resolved RequestContext on success', async () => {
    const ctx = Object.freeze({ userId: 'u', orgId: 'o', role: 'member' as const })
    const redirect = vi.fn(() => {
      throw new Error('redirect should not have been called')
    }) as unknown as (path: string) => never
    const out = await requireMembershipOrRedirect({
      getRequestContext: async () => ctx,
      redirect,
    })
    expect(out).toBe(ctx)
    expect((redirect as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
  })

  it('redirects to /onboarding/create-org when getRequestContext throws no_membership', async () => {
    const redirect = vi.fn((_p: string) => {
      throw new Error('NEXT_REDIRECT')
    }) as unknown as (path: string) => never
    await expect(
      requireMembershipOrRedirect({
        getRequestContext: async () => {
          throw new AppError('no_membership', 'no membership')
        },
        redirect,
      }),
    ).rejects.toThrow('NEXT_REDIRECT')
    expect((redirect as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      '/onboarding/create-org',
    )
  })

  it('rethrows unauthenticated errors (defer to middleware)', async () => {
    const redirect = vi.fn(() => {
      throw new Error('redirect should not have been called')
    }) as unknown as (path: string) => never
    await expect(
      requireMembershipOrRedirect({
        getRequestContext: async () => {
          throw new AppError('unauthenticated', 'no session')
        },
        redirect,
      }),
    ).rejects.toMatchObject({ code: 'unauthenticated' })
    expect((redirect as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
  })

  it('rethrows non-AppError failures unchanged', async () => {
    const redirect = vi.fn(() => {
      throw new Error('redirect should not have been called')
    }) as unknown as (path: string) => never
    const boom = new Error('db is down')
    await expect(
      requireMembershipOrRedirect({
        getRequestContext: async () => {
          throw boom
        },
        redirect,
      }),
    ).rejects.toBe(boom)
  })
})
