import { sql } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { users, type DbUser } from '@/db/schema'
import type { AnyDb } from './notes-repository'

/**
 * Users repository.
 *
 * `users` is the auth-identity mirror — NOT tenant-scoped — so this repo
 * deliberately does NOT accept a `RequestContext`. It exists so callers
 * (e.g. the invite-by-email flow) don't reach into `db/` directly.
 *
 * Allowed access patterns:
 *   - lookup by id (joins / display)
 *   - lookup by email (invite resolution — case-insensitive)
 *   - insert mirror row (sign-up + invite-acceptance flows)
 *
 * Broader queries are a smell — surface them through a service first.
 */
export type UsersRepository = {
  findById(id: string): Promise<DbUser | null>
  /** Case-insensitive email lookup. Returns null when no row matches. */
  findByEmail(email: string): Promise<DbUser | null>
  /**
   * Idempotent mirror insert. If a row with `id` already exists the existing
   * row is returned unchanged. Mirrors the pattern used by `signUp` and by
   * `OrgsRepository.createWithAdmin`'s self-heal branch.
   */
  upsertMirror(input: { id: string; email: string; displayName?: string | null }): Promise<DbUser>
}

export function createUsersRepository(db: AnyDb = getDb() as unknown as AnyDb): UsersRepository {
  return {
    async findById(id) {
      const rows = await db
        .select()
        .from(users)
        .where(sql`${users.id} = ${id}`)
        .limit(1)
      return rows[0] ?? null
    },

    async findByEmail(email) {
      const normalized = email.trim().toLowerCase()
      if (!normalized) return null
      const rows = await db
        .select()
        .from(users)
        .where(sql`lower(${users.email}) = ${normalized}`)
        .limit(1)
      return rows[0] ?? null
    },

    async upsertMirror({ id, email, displayName }) {
      // ON CONFLICT (id) DO NOTHING — matches the self-heal pattern in
      // OrgsRepository.createWithAdmin; if the row exists we re-fetch.
      const inserted = await db
        .insert(users)
        .values({ id, email, displayName: displayName ?? null })
        .onConflictDoNothing({ target: users.id })
        .returning()
      if (inserted[0]) return inserted[0]
      const existing = await db
        .select()
        .from(users)
        .where(sql`${users.id} = ${id}`)
        .limit(1)
      const row = existing[0]
      if (!row) throw new Error('upsertMirror: row missing after insert')
      return row
    },
  }
}
