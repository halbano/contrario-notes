/**
 * Open the Drizzle handle the seed pipeline writes through. Two modes:
 *
 *  - `postgres-js`: real Postgres (local or — with explicit override — cloud
 *    Supabase). Mirrors the production runtime (`db/client.ts`).
 *  - `pglite`: in-process WASM Postgres. The default for the test harness
 *    and `SEED_PROFILE=small` smoke runs that should never touch a real DB.
 *
 * The seed CLI picks `pglite` when `SEED_TARGET=pglite`; everything else
 * goes through `postgres-js` and is gated by the cloud-guard.
 */
import postgres from 'postgres'
import { drizzle as pgDrizzle } from 'drizzle-orm/postgres-js'
import { drizzle as pgliteDrizzle } from 'drizzle-orm/pglite'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import * as schema from '@/db/schema'
import type { AnyDb } from '@/repositories'

export type SeedDbHandle = {
  db: AnyDb
  raw: AnyDb
  close: () => Promise<void>
  driver: 'postgres-js' | 'pglite'
}

export async function openPostgresDb(databaseUrl: string): Promise<SeedDbHandle> {
  const client = postgres(databaseUrl, { prepare: false, max: 4 })
  const db = pgDrizzle(client, { schema })
  return {
    db: db as unknown as AnyDb,
    raw: db as unknown as AnyDb,
    driver: 'postgres-js',
    close: async () => {
      await client.end({ timeout: 5 })
    },
  }
}

/**
 * Spin up an in-process pglite, apply every drizzle migration in order, and
 * return the handle. Used by tests/seed.test.ts and any local dry-run.
 *
 * Some 0001_rls statements reference Supabase auth helpers that don't exist
 * inside pglite; we tolerate those errors because the seed runs as the
 * service-role equivalent (RLS bypass) — same approach the tenant-isolation
 * helper uses.
 */
export async function openPgliteDb(): Promise<SeedDbHandle & { pg: PGlite }> {
  const pg = new PGlite()
  const db = pgliteDrizzle(pg, { schema })

  const dir = path.resolve(process.cwd(), 'drizzle')
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const f of files) {
    const sql = readFileSync(path.join(dir, f), 'utf8')
    const statements = sql
      .split(/-->\s*statement-breakpoint/i)
      .map((s) => s.trim())
      .filter(Boolean)
    for (const stmt of statements) {
      try {
        await pg.exec(stmt)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (!/auth\.|jwt|set_config|policy|role|does not exist/i.test(msg)) {
          throw err
        }
      }
    }
  }
  return {
    db: db as unknown as AnyDb,
    raw: db as unknown as AnyDb,
    pg,
    driver: 'pglite',
    close: async () => {
      await pg.close()
    },
  }
}
