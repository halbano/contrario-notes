import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { users } from '@/db/schema'
import { makeTestDb, type TestDb } from '@/tests/helpers/pglite-db'
import { createUsersRepository } from './users-repository'

const ID_A = '00000000-0000-0000-0000-0000000000a1'
const ID_B = '00000000-0000-0000-0000-0000000000a2'

let db: TestDb
let close: () => Promise<void>

beforeAll(async () => {
  const harness = await makeTestDb()
  db = harness.db
  close = harness.close
})

afterAll(async () => {
  await close()
})

beforeEach(async () => {
  await db.delete(users)
})

describe('users-repository.findByEmail', () => {
  it('returns null when no user with that email exists', async () => {
    const repo = createUsersRepository(db as never)
    const row = await repo.findByEmail('nobody@example.com')
    expect(row).toBeNull()
  })

  it('returns the user when an exact match exists', async () => {
    await db.insert(users).values({ id: ID_A, email: 'alice@example.com' })
    const repo = createUsersRepository(db as never)
    const row = await repo.findByEmail('alice@example.com')
    expect(row?.id).toBe(ID_A)
  })

  it('is case-insensitive on the lookup side', async () => {
    await db.insert(users).values({ id: ID_A, email: 'alice@example.com' })
    const repo = createUsersRepository(db as never)
    const row = await repo.findByEmail('ALICE@Example.COM')
    expect(row?.id).toBe(ID_A)
  })

  it('trims surrounding whitespace from the query string', async () => {
    await db.insert(users).values({ id: ID_A, email: 'alice@example.com' })
    const repo = createUsersRepository(db as never)
    const row = await repo.findByEmail('   alice@example.com   ')
    expect(row?.id).toBe(ID_A)
  })

  it('returns null on empty input (no row matches the empty string)', async () => {
    const repo = createUsersRepository(db as never)
    expect(await repo.findByEmail('')).toBeNull()
    expect(await repo.findByEmail('   ')).toBeNull()
  })
})

describe('users-repository.upsertMirror', () => {
  it('inserts a fresh row when none exists', async () => {
    const repo = createUsersRepository(db as never)
    const row = await repo.upsertMirror({ id: ID_B, email: 'bob@example.com' })
    expect(row.id).toBe(ID_B)
    expect(row.email).toBe('bob@example.com')
  })

  it('is idempotent: a second call with the same id leaves the row intact', async () => {
    const repo = createUsersRepository(db as never)
    await repo.upsertMirror({ id: ID_B, email: 'bob@example.com' })
    const second = await repo.upsertMirror({
      id: ID_B,
      email: 'bob+changed@example.com',
    })
    // ON CONFLICT DO NOTHING — original row wins.
    expect(second.email).toBe('bob@example.com')
  })
})
