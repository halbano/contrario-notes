import { AppError } from './errors'
import type { RequestContext, Role } from './request-context'

/**
 * Inputs the builder accepts. `requestedOrgId` is a HINT — it is passed
 * through to the resolver, which is responsible for verifying that the user
 * is actually a member of that org. The builder NEVER trusts it directly.
 */
export type BuildRequestContextInput = {
  requestedOrgId?: string
}

/**
 * Dependencies the builder needs. Injected so that the builder is unit
 * testable without a Supabase or DB session.
 */
export type BuildRequestContextDeps = {
  /** Returns the authenticated user, or null if no session. */
  getSession(): Promise<{ userId: string } | null>
  /**
   * Given a userId (and an optional org-id hint), return the membership the
   * user is currently active under. The implementation is expected to:
   *  1. Confirm membership exists for the user.
   *  2. If `requestedOrgId` is given, confirm the user is a member of that org.
   *  3. Otherwise pick the user's default/last-active org.
   *  4. Return null if the user has no memberships at all.
   */
  getActiveMembership(
    userId: string,
    requestedOrgId?: string,
  ): Promise<{ orgId: string; role: Role } | null>
}

/**
 * Build the immutable RequestContext for a server entry point.
 *
 * Rejects with:
 *  - `unauthenticated` if no session.
 *  - `no_membership`  if user has no organization membership.
 *
 * On success returns a frozen RequestContext. Never returns a context whose
 * `orgId` was supplied verbatim by the client — the resolver has already
 * verified membership.
 */
export async function buildRequestContext(
  input: BuildRequestContextInput,
  deps: BuildRequestContextDeps,
): Promise<RequestContext> {
  const session = await deps.getSession()
  if (!session) {
    throw new AppError('unauthenticated', 'No active session')
  }

  const membership = await deps.getActiveMembership(session.userId, input.requestedOrgId)
  if (!membership) {
    throw new AppError('no_membership', 'User has no organization membership')
  }

  return Object.freeze({
    userId: session.userId,
    orgId: membership.orgId,
    role: membership.role,
  })
}
