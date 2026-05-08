/**
 * Real-world wiring of `buildRequestContext`.
 *
 * Composes:
 *   - Supabase server client (for the authenticated user)
 *   - active-org cookie (HINT only — never trusted as `orgId` directly)
 *   - memberships repository (single source of truth for what orgs the user
 *     belongs to and what role they hold there)
 *
 * The `getActiveMembership` resolver implements the contract documented in
 * `lib/build-request-context.ts`:
 *
 *   1. Confirms the user has memberships at all.
 *   2. If a `requestedOrgId` is given (typically from the cookie), confirms
 *      the user is a member of that org. If not, FALLS BACK to the default
 *      membership — never grants the requested org.
 *   3. Otherwise picks a deterministic default (oldest membership).
 *
 * Returning the default on cookie mismatch (rather than throwing) is the
 * graceful path when a user's membership is revoked while they have a stale
 * cookie. The org-switch endpoint enforces the strict path: a switch attempt
 * to a non-member org returns 404 (see `services/orgs-service.switchOrg`).
 */

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { findAllMembershipsForUser } from '@/repositories/memberships-repository'
import type { AnyDb } from '@/repositories'
import {
  buildRequestContext,
  type BuildRequestContextDeps,
} from './build-request-context'
import { readActiveOrgCookie } from './active-org-cookie'
import type { RequestContext, Role } from './request-context'

/**
 * Real session getter — reads from the Supabase server client cookie session.
 */
async function getSupabaseSession(): Promise<{ userId: string } | null> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  return { userId: user.id }
}

/**
 * Look up the user's active membership.
 *
 * Returns the membership for `requestedOrgId` if the user is a member there;
 * otherwise the user's default membership; otherwise null.
 *
 * Routes through the repositories layer (`findAllMembershipsForUser`) so
 * that no `db` import sits in `lib/`. Tests may pass a fake `db` handle.
 */
export async function getActiveMembershipFromDb(
  userId: string,
  requestedOrgId: string | undefined,
  db?: AnyDb,
): Promise<{ orgId: string; role: Role } | null> {
  const userMemberships = await findAllMembershipsForUser(
    userId,
    db ?? (undefined as unknown as AnyDb),
  )

  if (userMemberships.length === 0) return null

  if (requestedOrgId) {
    const exact = userMemberships.find((m) => m.orgId === requestedOrgId)
    if (exact) return { orgId: exact.orgId, role: exact.role as Role }
    // Cookie pointed at an org the user no longer belongs to: fall through
    // to default. This is graceful; the strict-404 path lives in the
    // org-switch endpoint, not here.
  }

  // Deterministic default: oldest membership wins.
  const sorted = [...userMemberships].sort(
    (a, b) =>
      (a.createdAt?.getTime?.() ?? 0) - (b.createdAt?.getTime?.() ?? 0),
  )
  const first = sorted[0]
  if (!first) return null
  return { orgId: first.orgId, role: first.role as Role }
}

/**
 * One-shot helper to build the per-request context for a server entry point.
 * Reads the Supabase session + active-org cookie + memberships table, and
 * returns the immutable `RequestContext` (or throws `unauthenticated` /
 * `no_membership`).
 */
export async function getRequestContext(): Promise<RequestContext> {
  const requestedOrgId = await readActiveOrgCookie()
  const deps: BuildRequestContextDeps = {
    getSession: getSupabaseSession,
    getActiveMembership: (userId, hint) => getActiveMembershipFromDb(userId, hint),
  }
  return buildRequestContext({ requestedOrgId }, deps)
}
