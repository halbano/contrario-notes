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
 *   - "create a new org and immediately add the requester as admin" (atomic)
 *
 * Any broader query is a bug.
 */
export type OrgsRepository = {
  current(): Promise<DbOrganization | null>
  listForCurrentUser(): Promise<DbOrganization[]>
  /**
   * Create a brand-new org AND insert an `admin` membership for the calling
   * user. Returns the inserted org. The two writes happen in one transaction
   * — partial state is impossible.
   *
   * NOTE: this method is allowed to insert a membership row whose `org_id`
   * is the brand-new org id (i.e. NOT `ctx.orgId`). It is the only legal
   * place this happens, because the `organizations` table is the tenant root
   * and the new org has, by definition, no current ctx yet.
   */
  createWithAdmin(input: { slug: string; name: string }): Promise<DbOrganization>
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

    async createWithAdmin({ slug, name }) {
      // Drizzle's `transaction` works for both postgres-js and pglite drivers.
      return db.transaction(async (tx) => {
        const inserted = await tx
          .insert(organizations)
          .values({ slug, name })
          .returning()
        const org = inserted[0]
        if (!org) throw new Error('Failed to create organization')

        await tx
          .insert(memberships)
          .values({ orgId: org.id, userId: ctx.userId, role: 'admin' })
        return org
      })
    },
  }
}
