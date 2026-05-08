import type { Repositories } from '@/repositories'
import type { RequestContext, Role } from '@/lib/request-context'
import type { Logger } from '@/logging'
import { LOG_EVENTS } from '@/logging'
import { AppError } from '@/lib/errors'
import {
  canChangeMembershipRole,
  canManageMemberships,
} from '@/permissions/org-permissions'

export type OrgsService = ReturnType<typeof createOrgsService>

/**
 * Validate org slug. URL-safe, lowercase, 2..32 chars.
 */
function isValidSlug(slug: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(slug) && slug.length >= 2
}

function isValidOrgName(name: string): boolean {
  const trimmed = name.trim()
  return trimmed.length >= 2 && trimmed.length <= 80
}

export function createOrgsService(
  ctx: RequestContext,
  repos: Repositories,
  logger: Logger,
) {
  return {
    /** The org the request is currently scoped to. */
    current: () => repos.orgs.current(),
    /** All orgs the authenticated user is a member of (for org switcher). */
    listForCurrentUser: () => repos.orgs.listForCurrentUser(),
    /** The role of the current user in the current org (from ctx). */
    currentRole: () => ctx.role,

    /**
     * Create a new organization. Inserts the org row and an `admin`
     * membership for the calling user atomically.
     *
     * Any authenticated user may create an org. The caller's existing role
     * inside other orgs is irrelevant here — `ctx.role` reflects the
     * *current* org, not the about-to-be-created one.
     */
    async createOrg(input: { slug: string; name: string }) {
      if (!isValidSlug(input.slug)) {
        throw new AppError('invalid_input', 'Invalid org slug')
      }
      if (!isValidOrgName(input.name)) {
        throw new AppError('invalid_input', 'Invalid org name')
      }
      const org = await repos.orgs.createWithAdmin({
        slug: input.slug,
        name: input.name.trim(),
      })
      logger.log(LOG_EVENTS.AUTH_ORG_CREATED, {
        orgId: org.id,
        userId: ctx.userId,
      })
      return org
    },

    /** List memberships in the current org. */
    listMemberships: () => repos.memberships.listForCurrentOrg(),

    /**
     * Add a member to the current org. Admin-only.
     * NOTE: this does NOT create a Supabase auth user — that must already
     * exist. Used when accepting an invite or when an admin manually
     * attaches an existing auth user. Real invite flows belong to a
     * future feature.
     */
    async addMember(input: { userId: string; role: Role }) {
      if (!canManageMemberships(ctx)) {
        logger.log(LOG_EVENTS.PERMISSION_DENIED, {
          orgId: ctx.orgId,
          userId: ctx.userId,
          action: 'membership.add',
        })
        throw new AppError('not_found', 'Not found')
      }
      const row = await repos.memberships.add(input)
      logger.log(LOG_EVENTS.AUTH_MEMBERSHIP_CHANGED, {
        orgId: ctx.orgId,
        userId: ctx.userId,
        targetUserId: input.userId,
        action: 'add',
        role: input.role,
      })
      return row
    },

    /** Change a member's role in the current org. Admin-only. */
    async changeRole(membershipId: string, role: Role) {
      if (!canChangeMembershipRole(ctx)) {
        logger.log(LOG_EVENTS.PERMISSION_DENIED, {
          orgId: ctx.orgId,
          userId: ctx.userId,
          action: 'membership.change_role',
        })
        throw new AppError('not_found', 'Not found')
      }
      const row = await repos.memberships.updateRole(membershipId, role)
      if (!row) throw new AppError('not_found', 'Membership not found')
      logger.log(LOG_EVENTS.AUTH_MEMBERSHIP_CHANGED, {
        orgId: ctx.orgId,
        userId: ctx.userId,
        membershipId,
        action: 'change_role',
        role,
      })
      return row
    },

    /**
     * Validate that the calling user is a member of `targetOrgId`. Used by
     * the org-switch endpoint BEFORE updating the cookie/session.
     *
     * Throws `not_found` (404) on miss — never `permission_denied` —
     * to avoid existence disclosure (TENANCY_INVARIANTS enforcement section).
     */
    async validateOrgSwitch(targetOrgId: string) {
      const m = await repos.memberships.findForUserAndOrg(ctx.userId, targetOrgId)
      if (!m) {
        logger.log(LOG_EVENTS.AUTH_ORG_SWITCH_DENIED, {
          orgId: ctx.orgId,
          userId: ctx.userId,
          targetOrgId,
        })
        throw new AppError('not_found', 'Organization not found')
      }
      logger.log(LOG_EVENTS.AUTH_ORG_SWITCH, {
        orgId: ctx.orgId,
        userId: ctx.userId,
        targetOrgId,
      })
      return { orgId: m.orgId, role: m.role as Role }
    },

    /** Remove a member from the current org. Admin-only. */
    async removeMember(membershipId: string) {
      if (!canManageMemberships(ctx)) {
        logger.log(LOG_EVENTS.PERMISSION_DENIED, {
          orgId: ctx.orgId,
          userId: ctx.userId,
          action: 'membership.remove',
        })
        throw new AppError('not_found', 'Not found')
      }
      const ok = await repos.memberships.remove(membershipId)
      if (!ok) throw new AppError('not_found', 'Membership not found')
      logger.log(LOG_EVENTS.AUTH_MEMBERSHIP_CHANGED, {
        orgId: ctx.orgId,
        userId: ctx.userId,
        membershipId,
        action: 'remove',
      })
    },
  }
}
