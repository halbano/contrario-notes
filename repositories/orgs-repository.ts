import { eq } from 'drizzle-orm'
import { memberships, organizations, users, type DbOrganization } from '@/db/schema'
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
   *
   * VAL-11 self-heal: when `selfHealUserEmail` is supplied, we first run
   * `INSERT INTO users (id, email) ... ON CONFLICT (id) DO NOTHING` so the
   * subsequent membership insert never trips the
   * `memberships.user_id → users.id` FK. This is intended for the
   * "first-org" flow where `auth.users` may exist but the `public.users`
   * mirror was wiped (dev `seed --reset` cascade). The insert is idempotent;
   * existing rows are left untouched.
   */
  createWithAdmin(input: {
    slug: string
    name: string
    selfHealUserEmail?: string
  }): Promise<DbOrganization>
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

    async createWithAdmin({ slug, name, selfHealUserEmail }) {
      // Drizzle's `transaction` works for both postgres-js and pglite drivers.
      return db.transaction(async (tx) => {
        // VAL-11: self-heal the public.users mirror BEFORE the membership
        // write, so a wiped mirror (seed --reset cascade) can't FK-fail the
        // membership insert. Idempotent — ON CONFLICT DO NOTHING leaves any
        // existing row untouched, no double-write risk.
        if (selfHealUserEmail) {
          await tx
            .insert(users)
            .values({ id: ctx.userId, email: selfHealUserEmail })
            .onConflictDoNothing({ target: users.id })
        }

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
