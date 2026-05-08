/**
 * Truncate every seed-managed table in dependency-safe order. Used by
 * `npm run seed:reset`.
 *
 * Order matters: child rows first (audit_log, files, note_shares,
 * note_tags, tags, note_versions, notes), then memberships, then
 * public.users, then organizations.
 *
 * NOTE: this only touches `public.users`. Wiping `auth.users` is out of
 * scope — it would orphan real Supabase logins. Cloud-runs against a
 * shared project should reset auth users out-of-band via the Supabase
 * dashboard.
 */
import { sql } from 'drizzle-orm'
import type { AnyDb } from '@/repositories'

const TABLES_IN_ORDER = [
  'audit_log',
  'files',
  'note_shares',
  'note_tags',
  'tags',
  'note_versions',
  'notes',
  'memberships',
  'users',
  'organizations',
] as const

export async function resetTables(db: AnyDb): Promise<void> {
  for (const t of TABLES_IN_ORDER) {
    await db.execute(sql.raw(`TRUNCATE TABLE "${t}" RESTART IDENTITY CASCADE;`))
  }
}
