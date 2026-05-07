import { eq } from 'drizzle-orm'
import { memberships, organizations, type DbOrganization } from '@/db/schema'
import type { AnyDb } from './notes-repository'
import type { RequestContext } from './types'

/**
 * Orgs repository. Note: the `organizations` table is the tenant root and is
 * NOT itself tenant-scoped by `org_id`. Access patterns are deliberately
 * narrow — the only legitimate query a request can do against this table is:
 *
 *   - "fetch the org I'm currently scoped to" (by id = ctx.orgId)
 *   - "list orgs I'm a member of" (joined via memberships)
 *
 * Any broader query is a bug.
 */
export type OrgsRepository = {
  current(): Promise<DbOrganization | null>
  listForCurrentUser(): Promise<DbOrganization[]>
}

export function createOrgsRepository(ctx: RequestContext, db: AnyDb): OrgsRepository {
  return {
    async current() {
      const rows = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, ctx.orgId))
        .limit(1)
      return rows[0] ?? null
    },

    async listForCurrentUser() {
      return db
        .select({
          id: organizations.id,
          slug: organizations.slug,
          name: organizations.name,
          createdAt: organizations.createdAt,
        })
        .from(organizations)
        .innerJoin(memberships, eq(memberships.orgId, organizations.id))
        .where(eq(memberships.userId, ctx.userId))
    },
  }
}
