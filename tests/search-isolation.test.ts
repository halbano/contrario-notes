import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { makeTestDb, type TestDb } from './helpers/pglite-db'
import { createScopedServices } from '@/services'
import { createLogger } from '@/logging'
import { memberships, organizations, users } from '@/db/schema'
import type { RequestContext } from '@/lib/request-context'

/**
 * Search tenant-isolation + visibility harness.
 *
 * Asserts that the FTS query in `repositories/search-repository.ts`:
 *  1. Cannot return notes from another organization.
 *  2. Cannot return private notes the caller does not own.
 *  3. Cannot return shared notes the caller has not been granted.
 *  4. CAN return shared notes once the caller has been granted.
 *  5. Returns matches ordered by ts_rank (higher relevance first).
 *
 * All filtering MUST happen at SQL level (TENANCY_INVARIANTS invariant 4).
 * If you find this test passing while the repo post-filters in JS, that is
 * a bug — the SQL itself must refuse to surface forbidden rows.
 */

let db: TestDb
let close: () => Promise<void>
const silentLogger = createLogger({ sink: () => undefined, minLevel: 'error' })

const ORG_A = '11aaaaaa-1111-1111-1111-111111111111'
const ORG_B = '22bbbbbb-2222-2222-2222-222222222222'

const ALICE_A = 'aaaa1111-1111-1111-1111-111111111111'
const BOB_A = 'bbbb1111-1111-1111-1111-111111111111'
const CARL_A = 'cccc1111-1111-1111-1111-111111111111'
const DREW_B = 'dddd2222-2222-2222-2222-222222222222'

const ctxAlice: RequestContext = Object.freeze({
  userId: ALICE_A,
  orgId: ORG_A,
  role: 'member',
})
const ctxBob: RequestContext = Object.freeze({
  userId: BOB_A,
  orgId: ORG_A,
  role: 'member',
})
const ctxCarl: RequestContext = Object.freeze({
  userId: CARL_A,
  orgId: ORG_A,
  role: 'admin',
})
const ctxDrew: RequestContext = Object.freeze({
  userId: DREW_B,
  orgId: ORG_B,
  role: 'admin',
})

beforeAll(async () => {
  const made = await makeTestDb()
  db = made.db
  close = made.close

  await db.insert(organizations).values([
    { id: ORG_A, slug: 'org-a-search', name: 'Org A' },
    { id: ORG_B, slug: 'org-b-search', name: 'Org B' },
  ])
  await db.insert(users).values([
    { id: ALICE_A, email: 'alice@s.example.com' },
    { id: BOB_A, email: 'bob@s.example.com' },
    { id: CARL_A, email: 'carl@s.example.com' },
    { id: DREW_B, email: 'drew@s.example.com' },
  ])
  await db.insert(memberships).values([
    { orgId: ORG_A, userId: ALICE_A, role: 'member' },
    { orgId: ORG_A, userId: BOB_A, role: 'member' },
    { orgId: ORG_A, userId: CARL_A, role: 'admin' },
    { orgId: ORG_B, userId: DREW_B, role: 'admin' },
  ])
})

afterAll(async () => {
  await close()
})

describe('search — tenant isolation + visibility', () => {
  it('cross-org: a query in org A cannot find a note in org B', async () => {
    const sB = createScopedServices(ctxDrew, { db: db as never, logger: silentLogger })
    await sB.notes.createWithVersion({
      authorId: DREW_B,
      title: 'org-b-only',
      content: 'pineapple ridge confidential',
      visibility: 'org',
    })
    const sA = createScopedServices(ctxAlice, { db: db as never, logger: silentLogger })
    const results = await sA.search.query({ query: 'pineapple', limit: 50 })
    expect(results.find((r) => r.title === 'org-b-only')).toBeUndefined()
  })

  it('private: user A cannot find content of a private note owned by B in same org', async () => {
    const sB = createScopedServices(ctxBob, { db: db as never, logger: silentLogger })
    await sB.notes.createWithVersion({
      authorId: BOB_A,
      title: 'bob-private',
      content: 'banana sundae blueprint',
      visibility: 'private',
    })
    const sA = createScopedServices(ctxAlice, { db: db as never, logger: silentLogger })
    const results = await sA.search.query({ query: 'banana', limit: 50 })
    expect(results.find((r) => r.title === 'bob-private')).toBeUndefined()
  })

  it('shared: user without a note_shares grant cannot find content of a shared note', async () => {
    const sBob = createScopedServices(ctxBob, { db: db as never, logger: silentLogger })
    await sBob.notes.createWithVersion({
      authorId: BOB_A,
      title: 'bob-shared',
      content: 'kiwi turbine schematic',
      visibility: 'shared',
    })
    const sAlice = createScopedServices(ctxAlice, { db: db as never, logger: silentLogger })
    const results = await sAlice.search.query({ query: 'kiwi', limit: 50 })
    expect(results.find((r) => r.title === 'bob-shared')).toBeUndefined()
  })

  it('shared: user WITH a grant CAN find content of a shared note', async () => {
    const sBob = createScopedServices(ctxBob, { db: db as never, logger: silentLogger })
    const note = await sBob.notes.createWithVersion({
      authorId: BOB_A,
      title: 'bob-shared-grant',
      content: 'tangerine signal flux',
      visibility: 'shared',
    })
    // Bob shares with Alice.
    await sBob.notes.shareNote({ noteId: note.id, userId: ALICE_A, canEdit: false })

    const sAlice = createScopedServices(ctxAlice, { db: db as never, logger: silentLogger })
    const results = await sAlice.search.query({ query: 'tangerine', limit: 50 })
    expect(results.find((r) => r.id === note.id)).toBeDefined()
  })

  it('rank: the more-relevant match comes first when multiple notes hit', async () => {
    const sCarl = createScopedServices(ctxCarl, { db: db as never, logger: silentLogger })
    // High-relevance: term in title + content + tags-ish (denormalized as words).
    await sCarl.notes.createWithVersion({
      authorId: CARL_A,
      title: 'mango mango notes',
      content: 'mango mango mango mango farming',
      visibility: 'org',
    })
    // Lower-relevance: single mention.
    await sCarl.notes.createWithVersion({
      authorId: CARL_A,
      title: 'fruit miscellany',
      content: 'one mango cameo',
      visibility: 'org',
    })
    const results = await sCarl.search.query({ query: 'mango', limit: 50 })
    const titles = results.map((r) => r.title)
    expect(titles[0]).toBe('mango mango notes')
    expect(titles).toContain('fruit miscellany')
  })

  it('input validation: empty query is rejected', async () => {
    const sAlice = createScopedServices(ctxAlice, { db: db as never, logger: silentLogger })
    await expect(sAlice.search.query({ query: '', limit: 50 })).rejects.toMatchObject({
      code: 'invalid_input',
    })
  })

  it('input validation: limit is capped at 50', async () => {
    const sAlice = createScopedServices(ctxAlice, { db: db as never, logger: silentLogger })
    // 999 should be rejected (zod schema enforces a max).
    await expect(
      sAlice.search.query({ query: 'mango', limit: 999 }),
    ).rejects.toMatchObject({ code: 'invalid_input' })
  })
})
