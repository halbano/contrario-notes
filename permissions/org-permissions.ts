import type { RequestContext } from './types'

/**
 * Org / membership permission rules.
 *
 * Role matrix (orgs + memberships):
 *
 *   action                 | viewer | member | admin
 *   -----------------------+--------+--------+------
 *   view current org       |   ✓    |   ✓    |  ✓
 *   list memberships       |   ✓    |   ✓    |  ✓
 *   invite / add member    |   ✗    |   ✗    |  ✓
 *   change member role     |   ✗    |   ✗    |  ✓
 *   remove member          |   ✗    |   ✗    |  ✓
 *   create new org         |   any authenticated user (no ctx role gate)
 *   switch active org      |   any user, but only into orgs they are a member of
 *
 * Every check is over the *current* RequestContext. Cross-org actions are
 * categorically rejected by the repository layer (org_id scoping); these
 * functions only decide whether the role inside the current org is high
 * enough to perform the action.
 */

export function canViewOrg(_ctx: RequestContext): boolean {
  // Any role can view their current org. The fact they hold a ctx implies
  // a verified membership.
  return true
}

export function canListMemberships(_ctx: RequestContext): boolean {
  // Any member can see who else is in the org.
  return true
}

export function canManageMemberships(ctx: RequestContext): boolean {
  return ctx.role === 'admin'
}

export function canRemoveMembership(
  ctx: RequestContext,
  target: { userId: string; role: 'admin' | 'member' | 'viewer' },
): boolean {
  if (ctx.role !== 'admin') return false
  // An admin may not remove themselves if they are the *only* admin —
  // that check is enforced at the service layer (which can count admins);
  // here we just gate on the admin role.
  return target.userId !== ctx.userId
    || target.role !== 'admin'
}

export function canChangeMembershipRole(ctx: RequestContext): boolean {
  return ctx.role === 'admin'
}
