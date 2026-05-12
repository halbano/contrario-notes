import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'

import type { Repositories } from '@/repositories'
import type { RequestContext, Role } from '@/lib/request-context'
import type { Logger } from '@/logging'
import { LOG_EVENTS } from '@/logging'
import type { AuditWriter } from '@/logging/audit'
import { AppError } from '@/lib/errors'
import {
  canChangeMembershipRole,
  canManageMemberships,
} from '@/permissions/org-permissions'
import {
  signOutUserGlobally,
  syncUserOrgIds,
} from '@/features/auth/server/jwt-sync'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'

/**
 * Hook for tests: lets us swap out the JWT-sync helpers without touching the
 * Supabase admin client. Default implementations are the real helpers above.
 *
 * Production code never calls `setOrgsServiceJwtSyncForTests`; only the
 * orgs-service unit tests do.
 */
type JwtSyncImpl = {
  syncUserOrgIds: typeof syncUserOrgIds
  signOutUserGlobally: typeof signOutUserGlobally
}
let jwtSyncImpl: JwtSyncImpl = {
  syncUserOrgIds,
  signOutUserGlobally,
}
export function setOrgsServiceJwtSyncForTests(impl: Partial<JwtSyncImpl>): void {
  jwtSyncImpl = {
    syncUserOrgIds: impl.syncUserOrgIds ?? syncUserOrgIds,
    signOutUserGlobally: impl.signOutUserGlobally ?? signOutUserGlobally,
  }
}
export function resetOrgsServiceJwtSyncForTests(): void {
  jwtSyncImpl = { syncUserOrgIds, signOutUserGlobally }
}

/**
 * Hook for tests: swap out the Supabase admin client used by
 * `inviteByEmail` for invite emails. Production code never overrides this.
 */
type AdminClientGetter = () => Pick<SupabaseClient, 'auth'>
let getAdminClientImpl: AdminClientGetter = getSupabaseAdminClient
export function setOrgsServiceAdminClientForTests(impl: AdminClientGetter): void {
  getAdminClientImpl = impl
}
export function resetOrgsServiceAdminClientForTests(): void {
  getAdminClientImpl = getSupabaseAdminClient
}

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

const ROLE_SCHEMA = z.enum(['admin', 'member', 'viewer'])
const INVITE_INPUT_SCHEMA = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: ROLE_SCHEMA,
})

export type InviteByEmailResult =
  | { status: 'added'; userId: string; membershipId: string }
  | { status: 'invited'; userId: string }
  | { status: 'already_member'; userId: string }

/**
 * Build the redirect URL embedded in Supabase's invite email. Returns
 * `undefined` when `NEXT_PUBLIC_APP_URL` is unset (Supabase falls back to its
 * dashboard-configured Site URL — keeps unit tests working without env).
 *
 * The redirect ALWAYS lands on `/auth/callback?redirectTo=/onboarding/accept-invite`
 * so the existing open-redirect guard there sanitises the path AND the
 * invite-acceptance flow can read `user_metadata.invited_*` before any
 * tenant-scoped render happens.
 */
function buildInviteRedirectUrl(): string | undefined {
  const base = process.env.NEXT_PUBLIC_APP_URL
  if (!base) return undefined
  const url = new URL('/auth/callback', base)
  url.searchParams.set('redirectTo', '/onboarding/accept-invite')
  return url.toString()
}

export function createOrgsService(
  ctx: RequestContext,
  repos: Repositories,
  logger: Logger,
  audit?: AuditWriter,
) {
  async function recordAudit(
    event: Parameters<NonNullable<typeof audit>>[0],
    input: Parameters<NonNullable<typeof audit>>[1],
  ) {
    if (audit) await audit(event, input)
  }
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
      await recordAudit(LOG_EVENTS.AUTH_ORG_CREATED, {
        event: LOG_EVENTS.AUTH_ORG_CREATED,
        entityType: 'organization',
        entityId: org.id,
        payload: { slug: org.slug, name: org.name },
      })
      // DR-PROD-01: refresh app_metadata.org_ids so RLS sees the new org.
      await jwtSyncImpl.syncUserOrgIds(ctx.userId, logger)
      return org
    },

    /** List memberships in the current org. */
    listMemberships: () => repos.memberships.listForCurrentOrg(),

    /**
     * List memberships in the current org joined with user email / display.
     * Powers the members panel.
     */
    listMembershipsWithUsers: () => repos.memberships.listForCurrentOrgWithUsers(),

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
      await recordAudit(LOG_EVENTS.AUTH_MEMBERSHIP_CHANGED, {
        event: LOG_EVENTS.AUTH_MEMBERSHIP_CHANGED,
        entityType: 'membership',
        entityId: row.id,
        payload: { action: 'add', targetUserId: input.userId, role: input.role },
      })
      // DR-PROD-01: the *added* user's claim must include this org so RLS
      // recognises them on their next request. We sync the target user, NOT
      // the caller (who already has it).
      await jwtSyncImpl.syncUserOrgIds(input.userId, logger)
      return row
    },

    /**
     * Change a member's role in the current org. Admin-only.
     *
     * NOTE (DR-PROD-01): role changes do NOT alter the (user_id, org_id)
     * pair, so they cannot affect `app_metadata.org_ids`. We deliberately do
     * NOT call `syncUserOrgIds` here — re-issuing the claim on every role
     * tweak would be wasted Supabase admin calls.
     */
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
      await recordAudit(LOG_EVENTS.AUTH_MEMBERSHIP_CHANGED, {
        event: LOG_EVENTS.AUTH_MEMBERSHIP_CHANGED,
        entityType: 'membership',
        entityId: membershipId,
        payload: { action: 'change_role', role },
      })
      return row
    },

    /**
     * Invite a user into the current org by email. Admin-only.
     *
     * Two branches:
     *   - email matches a row in `public.users` → insert the membership
     *     immediately (no email is sent). The target user's JWT claim is
     *     refreshed so RLS recognises the new org on their next request.
     *   - email does NOT match → ask Supabase Auth to send an invite email.
     *     We embed `invited_org_id` / `invited_role` / `invited_by` in the
     *     user's `user_metadata` so the accept-invite page can pick them up
     *     after the auth callback exchanges the code. We also upsert a
     *     `public.users` mirror so FK joins from the eventual membership
     *     insert don't fail. Membership is NOT inserted here — that happens
     *     at accept-time so the JWT claim and the membership row stay in
     *     lockstep.
     *
     * Failures:
     *   - Non-admin caller → `not_found` (404) per existence-non-disclosure
     *     invariant.
     *   - Zod validation failure → `invalid_input`.
     *   - Supabase admin API failure → `internal` (we deliberately do NOT
     *     leak the underlying message).
     */
    async inviteByEmail(input: { email: string; role: Role }): Promise<InviteByEmailResult> {
      if (!canManageMemberships(ctx)) {
        logger.log(LOG_EVENTS.PERMISSION_DENIED, {
          orgId: ctx.orgId,
          userId: ctx.userId,
          action: 'membership.invite',
        })
        throw new AppError('not_found', 'Not found')
      }
      const parsed = INVITE_INPUT_SCHEMA.safeParse(input)
      if (!parsed.success) {
        throw new AppError('invalid_input', 'Invalid email or role')
      }
      const { email, role } = parsed.data

      const existing = await repos.users.findByEmail(email)
      if (existing) {
        // Existing user — same-org idempotency check, then immediate add.
        const alreadyMember = await repos.memberships.findForUserAndOrg(
          existing.id,
          ctx.orgId,
        )
        if (alreadyMember) {
          logger.log(LOG_EVENTS.AUTH_MEMBERSHIP_CHANGED, {
            orgId: ctx.orgId,
            userId: ctx.userId,
            targetUserId: existing.id,
            action: 'invite_existing.noop_already_member',
          })
          return { status: 'already_member', userId: existing.id }
        }
        const row = await repos.memberships.add({ userId: existing.id, role })
        logger.log(LOG_EVENTS.AUTH_MEMBERSHIP_CHANGED, {
          orgId: ctx.orgId,
          userId: ctx.userId,
          targetUserId: existing.id,
          action: 'invite_existing.added',
          role,
        })
        await recordAudit(LOG_EVENTS.AUTH_MEMBERSHIP_CHANGED, {
          event: LOG_EVENTS.AUTH_MEMBERSHIP_CHANGED,
          entityType: 'membership',
          entityId: row.id,
          payload: {
            action: 'invite_existing.added',
            targetUserId: existing.id,
            role,
          },
        })
        // DR-PROD-01: target user's claim must include this org.
        await jwtSyncImpl.syncUserOrgIds(existing.id, logger)
        return { status: 'added', userId: existing.id, membershipId: row.id }
      }

      // New user — Supabase sends the invite email with the metadata payload
      // the accept-invite page will pick up.
      const admin = getAdminClientImpl()
      const redirectTo = buildInviteRedirectUrl()
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        ...(redirectTo ? { redirectTo } : {}),
        data: {
          invited_org_id: ctx.orgId,
          invited_role: role,
          invited_by: ctx.userId,
        },
      })
      if (error || !data?.user) {
        logger.log(LOG_EVENTS.PERMISSION_DENIED, {
          orgId: ctx.orgId,
          userId: ctx.userId,
          action: 'membership.invite.supabase_error',
          error: error?.message ?? 'unknown',
        })
        throw new AppError('internal', 'Failed to send invite')
      }
      // Mirror the auth user immediately so the accept-invite flow's
      // membership insert never trips the FK.
      await repos.users.upsertMirror({ id: data.user.id, email })
      logger.log(LOG_EVENTS.AUTH_MEMBERSHIP_CHANGED, {
        orgId: ctx.orgId,
        userId: ctx.userId,
        targetUserId: data.user.id,
        action: 'invite_new.email_sent',
        role,
      })
      await recordAudit(LOG_EVENTS.AUTH_MEMBERSHIP_CHANGED, {
        event: LOG_EVENTS.AUTH_MEMBERSHIP_CHANGED,
        entityType: 'membership',
        entityId: data.user.id,
        payload: {
          action: 'invite_new.email_sent',
          targetUserId: data.user.id,
          role,
        },
      })
      return { status: 'invited', userId: data.user.id }
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
      await recordAudit(LOG_EVENTS.AUTH_ORG_SWITCH, {
        event: LOG_EVENTS.AUTH_ORG_SWITCH,
        entityType: 'organization',
        entityId: targetOrgId,
        payload: { fromOrgId: ctx.orgId, toOrgId: targetOrgId },
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
      // Capture the userId BEFORE deleting so we can refresh their JWT
      // claim and revoke active sessions afterwards (DR-PROD-01). When the
      // repo doesn't expose `findById` (older callers / mocks) we fall back
      // to scanning the org's membership list.
      const target = repos.memberships.findById
        ? await repos.memberships.findById(membershipId)
        : (await repos.memberships.listForCurrentOrg()).find(
            (m) => m.id === membershipId,
          ) ?? null
      if (!target) throw new AppError('not_found', 'Membership not found')
      const ok = await repos.memberships.remove(membershipId)
      if (!ok) throw new AppError('not_found', 'Membership not found')
      logger.log(LOG_EVENTS.AUTH_MEMBERSHIP_CHANGED, {
        orgId: ctx.orgId,
        userId: ctx.userId,
        membershipId,
        targetUserId: target.userId,
        action: 'remove',
      })
      await recordAudit(LOG_EVENTS.AUTH_MEMBERSHIP_CHANGED, {
        event: LOG_EVENTS.AUTH_MEMBERSHIP_CHANGED,
        entityType: 'membership',
        entityId: membershipId,
        payload: { action: 'remove' },
      })
      // DR-PROD-01: trim the claim AND invalidate any in-flight session so a
      // stale JWT (still encoding the old org_ids) is rejected on next use.
      // Order matters: sync claim first so when the user signs back in, RLS
      // already reflects the removal; signOut second to revoke active tokens.
      await jwtSyncImpl.syncUserOrgIds(target.userId, logger)
      await jwtSyncImpl.signOutUserGlobally(target.userId, logger)
    },
  }
}
