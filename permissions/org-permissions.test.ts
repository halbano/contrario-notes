import { describe, expect, it } from 'vitest'
import {
  canChangeMembershipRole,
  canListMemberships,
  canManageMemberships,
  canRemoveMembership,
  canViewOrg,
} from './org-permissions'
import type { RequestContext } from './types'

const ctx = (role: 'admin' | 'member' | 'viewer'): RequestContext =>
  Object.freeze({ userId: 'u1', orgId: 'o1', role })

describe('canViewOrg', () => {
  it.each(['admin', 'member', 'viewer'] as const)(
    'allows %s to view their current org',
    (role) => {
      expect(canViewOrg(ctx(role))).toBe(true)
    },
  )
})

describe('canListMemberships', () => {
  it.each(['admin', 'member', 'viewer'] as const)(
    'allows %s to list memberships',
    (role) => {
      expect(canListMemberships(ctx(role))).toBe(true)
    },
  )
})

describe('canManageMemberships', () => {
  it('allows admin', () => expect(canManageMemberships(ctx('admin'))).toBe(true))
  it('denies member', () => expect(canManageMemberships(ctx('member'))).toBe(false))
  it('denies viewer', () => expect(canManageMemberships(ctx('viewer'))).toBe(false))
})

describe('canChangeMembershipRole', () => {
  it('allows admin', () => expect(canChangeMembershipRole(ctx('admin'))).toBe(true))
  it('denies member', () => expect(canChangeMembershipRole(ctx('member'))).toBe(false))
  it('denies viewer', () => expect(canChangeMembershipRole(ctx('viewer'))).toBe(false))
})

describe('canRemoveMembership', () => {
  it('admin can remove other members', () => {
    expect(
      canRemoveMembership(ctx('admin'), { userId: 'u2', role: 'member' }),
    ).toBe(true)
  })
  it('admin cannot remove themselves if they are admin (self-protection)', () => {
    expect(
      canRemoveMembership(ctx('admin'), { userId: 'u1', role: 'admin' }),
    ).toBe(false)
  })
  it('admin can remove themselves if they hold a non-admin role (impossible state but defensive)', () => {
    expect(
      canRemoveMembership(ctx('admin'), { userId: 'u1', role: 'member' }),
    ).toBe(true)
  })
  it('member cannot remove anyone', () => {
    expect(
      canRemoveMembership(ctx('member'), { userId: 'u2', role: 'member' }),
    ).toBe(false)
  })
  it('viewer cannot remove anyone', () => {
    expect(
      canRemoveMembership(ctx('viewer'), { userId: 'u2', role: 'member' }),
    ).toBe(false)
  })
})
