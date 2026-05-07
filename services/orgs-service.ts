import type { Repositories } from '@/repositories'
import type { RequestContext } from '@/lib/request-context'
import type { Logger } from '@/logging'

export type OrgsService = ReturnType<typeof createOrgsService>

export function createOrgsService(
  ctx: RequestContext,
  repos: Repositories,
  _logger: Logger,
) {
  return {
    /** The org the request is currently scoped to. */
    current: () => repos.orgs.current(),
    /** All orgs the authenticated user is a member of (for org switcher). */
    listForCurrentUser: () => repos.orgs.listForCurrentUser(),
    /** The role of the current user in the current org (from ctx). */
    currentRole: () => ctx.role,
  }
}
