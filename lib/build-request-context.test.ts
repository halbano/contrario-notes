import { describe, expect, it, vi } from 'vitest'
import { buildRequestContext } from './build-request-context'
import { AppError } from './errors'

type FakeSession = { userId: string } | null
type FakeMembership = { orgId: string; role: 'admin' | 'member' | 'viewer' } | null

function makeDeps(session: FakeSession, membership: FakeMembership) {
  return {
    getSession: vi.fn(async () => session),
    getActiveMembership: vi.fn(async (_userId: string, _requestedOrgId?: string) => membership),
  }
}

describe('buildRequestContext', () => {
  it('returns a fully-typed context for an authenticated user with an active membership', async () => {
    const deps = makeDeps({ userId: 'u1' }, { orgId: 'o1', role: 'member' })

    const ctx = await buildRequestContext({}, deps)

    expect(ctx).toEqual({ userId: 'u1', orgId: 'o1', role: 'member' })
    expect(deps.getSession).toHaveBeenCalledOnce()
    expect(deps.getActiveMembership).toHaveBeenCalledWith('u1', undefined)
  })

  it('rejects unauthenticated requests with the unauthenticated error code', async () => {
    const deps = makeDeps(null, null)

    await expect(buildRequestContext({}, deps)).rejects.toMatchObject({
      name: 'AppError',
      code: 'unauthenticated',
    })
    expect(deps.getActiveMembership).not.toHaveBeenCalled()
  })

  it('rejects users with zero memberships with no_membership', async () => {
    const deps = makeDeps({ userId: 'u1' }, null)

    await expect(buildRequestContext({}, deps)).rejects.toBeInstanceOf(AppError)
    await expect(buildRequestContext({}, deps)).rejects.toMatchObject({ code: 'no_membership' })
  })

  it('passes a requested org hint to the membership resolver but never trusts it directly', async () => {
    const deps = makeDeps({ userId: 'u1' }, { orgId: 'o-allowed', role: 'admin' })

    const ctx = await buildRequestContext({ requestedOrgId: 'o-suspect' }, deps)

    // The resolver decides; the function returns whatever the resolver
    // confirmed the user is actually a member of — never the raw input.
    expect(deps.getActiveMembership).toHaveBeenCalledWith('u1', 'o-suspect')
    expect(ctx.orgId).toBe('o-allowed')
  })

  it('produces a frozen, immutable context', async () => {
    const deps = makeDeps({ userId: 'u1' }, { orgId: 'o1', role: 'viewer' })

    const ctx = await buildRequestContext({}, deps)

    expect(Object.isFrozen(ctx)).toBe(true)
  })
})
