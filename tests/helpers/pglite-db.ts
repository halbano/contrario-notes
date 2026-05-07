import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import * as schema from '@/db/schema'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

/**
 * Build an in-process Postgres (via pglite) with the project's migrations
 * applied. Used by the tenant-isolation harness.
 *
 * pglite is real Postgres compiled to WASM, so the SQL semantics match
 * production — including the WHERE-clause behavior we depend on for tenant
 * scoping. The `runStatement` helper below uses pglite's API (not the Node
 * child_process exec); there's no shell involved.
 */
export type TestDb = ReturnType<typeof drizzle<typeof schema>>

export async function makeTestDb(): Promise<{ db: TestDb; close: () => Promise<void> }> {
  const pg = new PGlite()
  const db = drizzle(pg, { schema })

  // Apply the generated SQL migrations directly. We don't use drizzle-kit's
  // migrator here because we want zero filesystem state and no journal.
  const dir = path.resolve(process.cwd(), 'drizzle')
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const f of files) {
    const sql = readFileSync(path.join(dir, f), 'utf8')
    // Drizzle migration files are split by `--> statement-breakpoint`.
    const statements = sql
      .split(/-->\s*statement-breakpoint/i)
      .map((s) => s.trim())
      .filter(Boolean)
    for (const stmt of statements) {
      // pglite's exec runs SQL inside the in-process WASM Postgres.
      await pg.exec(stmt)
    }
  }

  return {
    db,
    close: async () => {
      await pg.close()
    },
  }
}
