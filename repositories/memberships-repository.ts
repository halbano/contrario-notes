import { and, eq } from 'drizzle-orm'
import { memberships, type DbMembership } from '@/db/schema'
import type { Role } from '@/lib/request-context'
import { getDb } from '@/db/client'
import type { AnyDb } from './notes-repository'
import type { RequestContext } from './types'

/**
 * "Pre-context" memberships query. Used by the request-context builder
 * BEFORE a `RequestContext` exists — when we know the user id from the
 * Supabase session but not which org they're scoped to. This is one of two
 * legitimate places (alongside `OrgsRepository.createWithAdmin`) where a
 * tenant table is touched without a ctx-derived org filter.
 *
 * Returns one row per (user_id, org_id) the user belongs to.
 */
export async function findAllMembershipsForUser(
  userId: string,
  db: AnyDb = getDb() as unknown as AnyDb,
): Promise<Pick<DbMembership, 'orgId' | 'role' | 'createdAt'>[]> {
  return db
    .select({
      orgId: memberships.orgId,
      role: memberships.role,
      createdAt: memberships.createdAt,
    })
    .from(memberships)
    .where(eq(memberships.userId, userId))
}

/**
 * Memberships repository.
 *
 * `memberships` is tenant-scoped (`org_id` column). All read methods are
 * scoped to `ctx.orgId`, and writes are scoped via `withOrgId` semantics
 * (caller may not supply a foreign org id).
 *
 * Special case — `findForUserAndOrg(userId, orgId)` deliberately accepts a
 * raw orgId because it is the *org-switch validator*: called BEFORE a
 * `RequestContext` for that org has been established. It returns null when
 * no matching membership row exists. The caller MUST treat null as 404.
 */
export type MembershipsRepository = {
  /** All memberships in the current org (admin-facing list). */
  listForCurrentOrg(): Promise<DbMembership[]>

  /** The current user's membership in the current org. */
  findForCurrentUser(): Promise<DbMembership | null>

  /**
   * Out-of-band membership lookup for a (user, org) pair. The ONLY repo
   * method that accepts an explicit orgId — used by the org-switch flow
   * BEFORE a request context for that org exists.
   */
  findForUserAndOrg(userId: string, orgId: string): Promise<DbMembership | null>

  /** Add a member to the current org. Admin-only at the service layer. */
  add(input: { userId: string; role: Role }): Promise<DbMembership>

  /** Update a membership's role inside the current org. Admin-only. */
  updateRole(membershipId: string, role: Role): Promise<DbMembership | null>

  /** Remove a membership from the current org. Admin-only. */
  remove(membershipId: string): Promise<boolean>
}

export function createMembershipsRepository(
  ctx: RequestContext,
  db: AnyDb,
): MembershipsRepository {
  return {
    async listForCurrentOrg() {
      return db
        .select()
        .from(memberships)
        .where(eq(memberships.orgId, ctx.orgId))
    },

    async findForCurrentUser() {
      const rows = await db
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.orgId, ctx.orgId),
            eq(memberships.userId, ctx.userId),
          )!,
        )
        .limit(1)
      return rows[0] ?? null
    },

    async findForUserAndOrg(userId, orgId) {
      const rows = await db
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.userId, userId),
            eq(memberships.orgId, orgId),
          )!,
        )
        .limit(1)
      return rows[0] ?? null
    },

    async add({ userId, role }) {
      const rows = await db
        .insert(memberships)
        .values({ orgId: ctx.orgId, userId, role })
        .returning()
      const row = rows[0]
      if (!row) throw new Error('Failed to insert membership')
      return row
    },

    async updateRole(membershipId, role) {
      const rows = await db
        .update(memberships)
        .set({ role })
        .where(
          and(
            eq(memberships.id, membershipId),
            eq(memberships.orgId, ctx.orgId),
          )!,
        )
        .returning()
      return rows[0] ?? null
    },

    async remove(membershipId) {
      const rows = await db
        .delete(memberships)
        .where(
          and(
            eq(memberships.id, membershipId),
            eq(memberships.orgId, ctx.orgId),
          )!,
        )
        .returning({ id: memberships.id })
      return rows.length > 0
    },
  }
}
