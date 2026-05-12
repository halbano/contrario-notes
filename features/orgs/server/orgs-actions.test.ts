import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * inviteMemberByEmailAction — contract tests.
 *
 * The action is a thin wrapper around `services.orgs.inviteByEmail`; here we
 * verify the wrapping (FormData → typed input, AppError → response shape,
 * revalidatePath call) without exercising the underlying business logic
 * (covered by services/orgs-service.test.ts).
 */

const inviteByEmailMock = vi.fn()
const changeRoleMock = vi.fn()
const removeMemberMock = vi.fn()
const getRequestContextMock = vi.fn()
const revalidatePathMock = vi.fn()

vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

vi.mock('@/lib/auth-context', () => ({
  getRequestContext: () => getRequestContextMock(),
}))

vi.mock('@/services', () => ({
  createScopedServices: () => ({
    orgs: {
      inviteByEmail: inviteByEmailMock,
      changeRole: changeRoleMock,
      removeMember: removeMemberMock,
    },
  }),
}))

// AppError carries the canonical `code`s the action needs to map. Use the
// real class (not a stub) so `instanceof` checks inside the action work.
import { AppError } from '@/lib/errors'
import {
  changeMemberRoleAction,
  inviteMemberByEmailAction,
  removeMemberAction,
} from './orgs-actions'

const CTX = Object.freeze({
  userId: '00000000-0000-0000-0000-0000000000aa',
  orgId: '00000000-0000-0000-0000-000000000001',
  role: 'admin' as const,
})

beforeEach(() => {
  inviteByEmailMock.mockReset()
  changeRoleMock.mockReset()
  removeMemberMock.mockReset()
  getRequestContextMock.mockReset()
  revalidatePathMock.mockReset()
  getRequestContextMock.mockResolvedValue(CTX)
})

afterEach(() => {
  vi.clearAllMocks()
})

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

describe('inviteMemberByEmailAction', () => {
  it('returns invalid_input when email is missing (before the service is called)', async () => {
    const fd = makeFormData({ role: 'member' })
    const out = await inviteMemberByEmailAction(fd)
    expect(out.ok).toBe(false)
    if (out.ok) throw new Error('unreachable')
    expect(out.code).toBe('invalid_input')
    expect(inviteByEmailMock).not.toHaveBeenCalled()
  })

  it('returns invalid_input when role is not one of admin|member|viewer', async () => {
    const fd = makeFormData({ email: 'x@example.com', role: 'superuser' })
    const out = await inviteMemberByEmailAction(fd)
    expect(out.ok).toBe(false)
    if (out.ok) throw new Error('unreachable')
    expect(out.code).toBe('invalid_input')
    expect(inviteByEmailMock).not.toHaveBeenCalled()
  })

  it('passes parsed input to the service and surfaces status=added on success', async () => {
    inviteByEmailMock.mockResolvedValue({
      status: 'added',
      userId: 'u-1',
      membershipId: 'm-1',
    })
    const fd = makeFormData({ email: 'alice@example.com', role: 'member' })
    const out = await inviteMemberByEmailAction(fd)
    expect(out).toEqual({ ok: true, status: 'added', userId: 'u-1' })
    expect(inviteByEmailMock).toHaveBeenCalledWith({
      email: 'alice@example.com',
      role: 'member',
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/settings/members')
  })

  it('surfaces status=invited when the service emails a new user', async () => {
    inviteByEmailMock.mockResolvedValue({ status: 'invited', userId: 'u-2' })
    const fd = makeFormData({ email: 'newcomer@example.com', role: 'viewer' })
    const out = await inviteMemberByEmailAction(fd)
    expect(out).toEqual({ ok: true, status: 'invited', userId: 'u-2' })
  })

  it('surfaces status=already_member without throwing', async () => {
    inviteByEmailMock.mockResolvedValue({
      status: 'already_member',
      userId: 'u-3',
    })
    const fd = makeFormData({ email: 'bob@example.com', role: 'member' })
    const out = await inviteMemberByEmailAction(fd)
    expect(out).toEqual({ ok: true, status: 'already_member', userId: 'u-3' })
  })

  it('maps AppError(not_found) (non-admin caller) to ok:false with code preserved', async () => {
    inviteByEmailMock.mockRejectedValue(new AppError('not_found', 'Not found'))
    const fd = makeFormData({ email: 'alice@example.com', role: 'member' })
    const out = await inviteMemberByEmailAction(fd)
    expect(out).toMatchObject({ ok: false, code: 'not_found' })
  })

  it('maps a non-AppError exception to a generic ok:false response (no leakage)', async () => {
    inviteByEmailMock.mockRejectedValue(new Error('SMTP exploded'))
    const fd = makeFormData({ email: 'alice@example.com', role: 'member' })
    const out = await inviteMemberByEmailAction(fd)
    expect(out).toMatchObject({ ok: false })
    if (out.ok) throw new Error('unreachable')
    expect(out.message).not.toContain('SMTP')
  })
})

const MID = '11111111-1111-1111-1111-111111111111'

describe('changeMemberRoleAction', () => {
  it('rejects malformed membershipId without calling the service', async () => {
    const fd = makeFormData({ membershipId: 'not-a-uuid', role: 'admin' })
    const out = await changeMemberRoleAction(fd)
    expect(out).toMatchObject({ ok: false, code: 'invalid_input' })
    expect(changeRoleMock).not.toHaveBeenCalled()
  })

  it('delegates to services.orgs.changeRole and revalidates the members page', async () => {
    changeRoleMock.mockResolvedValue({})
    const fd = makeFormData({ membershipId: MID, role: 'admin' })
    const out = await changeMemberRoleAction(fd)
    expect(out).toEqual({ ok: true })
    expect(changeRoleMock).toHaveBeenCalledWith(MID, 'admin')
    expect(revalidatePathMock).toHaveBeenCalledWith('/settings/members')
  })

  it('surfaces AppError.code when the service rejects', async () => {
    changeRoleMock.mockRejectedValue(new AppError('not_found', 'Not found'))
    const fd = makeFormData({ membershipId: MID, role: 'admin' })
    const out = await changeMemberRoleAction(fd)
    expect(out).toMatchObject({ ok: false, code: 'not_found' })
  })
})

describe('removeMemberAction', () => {
  it('rejects malformed membershipId before reaching the service', async () => {
    const fd = makeFormData({ membershipId: 'nope' })
    const out = await removeMemberAction(fd)
    expect(out).toMatchObject({ ok: false, code: 'invalid_input' })
    expect(removeMemberMock).not.toHaveBeenCalled()
  })

  it('delegates to services.orgs.removeMember and revalidates the members page', async () => {
    removeMemberMock.mockResolvedValue(undefined)
    const fd = makeFormData({ membershipId: MID })
    const out = await removeMemberAction(fd)
    expect(out).toEqual({ ok: true })
    expect(removeMemberMock).toHaveBeenCalledWith(MID)
    expect(revalidatePathMock).toHaveBeenCalledWith('/settings/members')
  })
})
