/* eslint-disable no-console */
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

async function main() {
  const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL or DATABASE_DIRECT_URL must be set to run migrations.')
    process.exit(1)
  }
  const client = postgres(url, { max: 1 })
  const db = drizzle(client)
  console.log('Running migrations...')
  await migrate(db, { migrationsFolder: './drizzle' })
  console.log('Done.')
  await client.end()
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
