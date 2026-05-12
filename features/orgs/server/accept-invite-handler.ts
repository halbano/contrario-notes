/**
 * Accept-invite handler (VAL-18).
 *
 * Pure-ish business logic for `/onboarding/accept-invite`. The page is a
 * server component that thinly invokes this handler, then redirects. Pulling
 * the logic out keeps it unit-testable without spinning up the Next render
 * pipeline.
 *
 * The flow runs BEFORE a normal RequestContext exists (the user may have
 * zero memberships at this point). We construct a synthetic context whose
 * `orgId` is the invited org id (validated against `organizations`) and
 * whose `role` is the invited role. The synthetic ctx is consumed only by
 * the orgs + memberships repos, both of which scope by `ctx.orgId` — there
 * is no admin-gated path in play here.
 *
 * Security:
 *   - Validates `invited_org_id` (UUID) and `invited_role` (enum) before any
 *     write. A tampered `user_metadata` cannot widen access.
 *   - Membership insert is idempotent (`addIfMissing`) — replaying the link
 *     is a no-op.
 *   - Invited metadata is cleared after the membership is committed so a
 *     second click does not redirect into a route that no longer has the
 *     keys (gracefully degrades to /onboarding/create-org rather than
 *     re-running the join logic).
 */

import type { SupabaseClient, User } from '@supabase/supabase-js'

import {
  createMembershipsRepository,
  type MembershipsRepository,
} from '@/repositories/memberships-repository'
import {
  createOrgsRepository,
  type OrgsRepository,
} from '@/repositories/orgs-repository'
import type { AnyDb } from '@/repositories'
import type { RequestContext } from '@/lib/request-context'
import { writeActiveOrgCookie } from '@/lib/active-org-cookie'
import type { Logger } from '@/logging'
import { logger as defaultLogger, LOG_EVENTS } from '@/logging'
import { syncUserOrgIds } from '@/features/auth/server/jwt-sync'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getDb } from '@/db/client'

const ROLES = new Set(['admin', 'member', 'viewer'])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type AcceptInviteOutcome =
  | { redirectTo: '/sign-in' }
  | { redirectTo: '/onboarding/create-org' }
  | { redirectTo: '/'; orgId: string }

export type AcceptInviteRepoFactory = (ctx: RequestContext) => {
  memberships: MembershipsRepository
  orgs: OrgsRepository
}

export type AcceptInviteDeps = {
  /** Returns the current Supabase user (or null). */
  getUser: () => Promise<User | null>
  /** Supabase admin client (service role). */
  getAdmin: () => Pick<SupabaseClient, 'auth'>
  /** Per-ctx repositories. Tests inject pglite-backed factories. */
  buildRepos: AcceptInviteRepoFactory
  /** Cookie writer. */
  writeActiveOrgCookie: (orgId: string) => Promise<void>
  /** DR-PROD-01 JWT sync. */
  syncUserOrgIds: (userId: string, logger: Logger) => Promise<unknown>
  logger: Logger
}

async function defaultGetUser(): Promise<User | null> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.auth.getUser()
  return data.user ?? null
}

export function makeDefaultDeps(db?: AnyDb): AcceptInviteDeps {
  return {
    getUser: defaultGetUser,
    getAdmin: getSupabaseAdminClient,
    buildRepos: (ctx) => ({
      memberships: createMembershipsRepository(ctx, db as never),
      orgs: createOrgsRepository(ctx, db as never),
    }),
    writeActiveOrgCookie,
    syncUserOrgIds,
    logger: defaultLogger,
  }
}

/**
 * Resolve the accept-invite outcome. Performs every write itself
 * (membership insert + cookie + JWT sync + user_metadata cleanup) so the
 * caller only has to dispatch the redirect.
 */
export async function resolveAcceptInvite(
  deps: AcceptInviteDeps = makeDefaultDeps(),
): Promise<AcceptInviteOutcome> {
  const user = await deps.getUser()
  if (!user) {
    return { redirectTo: '/sign-in' }
  }

  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>
  const invitedOrgId = typeof metadata.invited_org_id === 'string' ? metadata.invited_org_id : null
  const invitedRole = typeof metadata.invited_role === 'string' ? metadata.invited_role : null

  // No invite metadata → user clicked an invite link without a payload (e.g.
  // expired / consumed / not actually an invite). Send them through the
  // standard orphan path; if they already have memberships, the (app) layout
  // will redirect them home from there.
  if (!invitedOrgId || !invitedRole) {
    return { redirectTo: '/onboarding/create-org' }
  }
  if (!UUID_RE.test(invitedOrgId) || !ROLES.has(invitedRole)) {
    deps.logger.log(LOG_EVENTS.PERMISSION_DENIED, {
      userId: user.id,
      action: 'invite.accept.invalid_metadata',
    })
    return { redirectTo: '/onboarding/create-org' }
  }

  const ctx = Object.freeze({
    userId: user.id,
    orgId: invitedOrgId,
    role: invitedRole as 'admin' | 'member' | 'viewer',
  })
  const { orgs, memberships } = deps.buildRepos(ctx)

  // Validate the org still exists. If it was deleted between invite send and
  // accept, fall through to the orphan path rather than 404 the user.
  const org = await orgs.current()
  if (!org) {
    deps.logger.log(LOG_EVENTS.PERMISSION_DENIED, {
      userId: user.id,
      action: 'invite.accept.org_missing',
    })
    return { redirectTo: '/onboarding/create-org' }
  }

  // Idempotent membership insert.
  await memberships.addIfMissing({
    userId: user.id,
    role: invitedRole as 'admin' | 'member' | 'viewer',
  })

  // DR-PROD-01: refresh the user's claim BEFORE writing the active-org cookie
  // so the next render sees an RLS-eligible session.
  await deps.syncUserOrgIds(user.id, deps.logger)
  await deps.writeActiveOrgCookie(invitedOrgId)

  // Strip the invited_* keys so a repeat click drops the user through to /.
  const admin = deps.getAdmin()
  const cleaned: Record<string, unknown> = { ...metadata }
  delete cleaned.invited_org_id
  delete cleaned.invited_role
  delete cleaned.invited_by
  await admin.auth.admin.updateUserById(user.id, {
    user_metadata: cleaned,
  })

  deps.logger.log(LOG_EVENTS.AUTH_MEMBERSHIP_CHANGED, {
    orgId: invitedOrgId,
    userId: user.id,
    action: 'invite.accept',
    role: invitedRole,
  })

  return { redirectTo: '/', orgId: invitedOrgId }
}
