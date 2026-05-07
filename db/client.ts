import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

/**
 * Drizzle client. ONLY repositories/ and db/ may import this module.
 *
 * The client lazily reads `DATABASE_URL` from env at first use so that build
 * steps that don't need the DB (e.g. Next.js linting, unit tests with mocked
 * deps) don't fail to import this module.
 */

let _client: ReturnType<typeof postgres> | undefined
let _db: ReturnType<typeof drizzle<typeof schema>> | undefined

function getClient() {
  if (_client) return _client
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error('DATABASE_URL is not set. See .env.example.')
  }
  _client = postgres(url, { prepare: false, max: 10 })
  return _client
}

export function getDb() {
  if (_db) return _db
  _db = drizzle(getClient(), { schema })
  return _db
}

/**
 * Test-only: replace the underlying client. Used by the tenant-isolation
 * harness which spins up a transactional fake.
 */
export function __setDbForTests(db: ReturnType<typeof drizzle<typeof schema>>) {
  _db = db
}

export { schema }
export type Database = ReturnType<typeof getDb>
