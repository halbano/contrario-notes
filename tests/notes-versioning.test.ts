import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { makeTestDb, type TestDb } from './helpers/pglite-db'
import { createScopedServices } from '@/services'
import { createRepositories } from '@/repositories'
import { createLogger } from '@/logging'
import { memberships, noteVersions, organizations, users } from '@/db/schema'
import type { RequestContext } from '@/lib/request-context'

/**
 * Versioning write-path harness. Asserts that:
 *  - Every successful create produces exactly one note_versions row (v=1).
 *  - Every successful update appends a new row (v+=1) atomically.
 *  - Cross-org reads of note_versions return zero rows.
 *  - Updates that would fail roll back the version row too (transactional).
 */

let db: TestDb
let close: () => Promise<void>
const silentLogger = createLogger({ sink: () => undefined, minLevel: 'error' })

const ORG_A = 'aaaaaaaa-1111-1111-1111-111111111111'
const ORG_B = 'bbbbbbbb-2222-2222-2222-222222222222'
const USER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const USER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

const ctxA: RequestContext = Object.freeze({
  userId: USER_A,
  orgId: ORG_A,
  role: 'admin',
})
const ctxB: RequestContext = Object.freeze({
  userId: USER_B,
  orgId: ORG_B,
  role: 'admin',
})

beforeAll(async () => {
  const made = await makeTestDb()
  db = made.db
  close = made.close

  await db.insert(organizations).values([
    { id: ORG_A, slug: 'org-a-vers', name: 'Org A' },
    { id: ORG_B, slug: 'org-b-vers', name: 'Org B' },
  ])
  await db.insert(users).values([
    { id: USER_A, email: 'a@v.example.com', displayName: 'A' },
    { id: USER_B, email: 'b@v.example.com', displayName: 'B' },
  ])
  await db.insert(memberships).values([
    { orgId: ORG_A, userId: USER_A, role: 'admin' },
    { orgId: ORG_B, userId: USER_B, role: 'admin' },
  ])
})

afterAll(async () => {
  await close()
})

describe('versioning — write-path', () => {
  it('createWithVersion writes exactly one v=1 row', async () => {
    const services = createScopedServices(ctxA, {
      db: db as never,
      logger: silentLogger,
    })
    const note = await services.notes.createWithVersion({
      authorId: USER_A,
      title: 'first',
      content: 'hello',
    })

    const versions = await db
      .select()
      .from(noteVersions)
      .where(eq(noteVersions.noteId, note.id))
    expect(versions).toHaveLength(1)
    expect(versions[0]?.version).toBe(1)
    expect(versions[0]?.title).toBe('first')
    expect(versions[0]?.content).toBe('hello')
    expect(versions[0]?.orgId).toBe(ORG_A)
  })

  it('updateWithVersion appends a v=2 row reflecting the new state', async () => {
    const services = createScopedServices(ctxA, {
      db: db as never,
      logger: silentLogger,
    })
    const note = await services.notes.createWithVersion({
      authorId: USER_A,
      title: 't1',
      content: 'c1',
    })
    const updated = await services.notes.updateWithVersion(note.id, {
      title: 't2',
      content: 'c2',
    })
    expect(updated.title).toBe('t2')

    const versions = await db
      .select()
      .from(noteVersions)
      .where(eq(noteVersions.noteId, note.id))
    expect(versions).toHaveLength(2)
    const sorted = versions.sort((a, b) => a.version - b.version)
    expect(sorted[0]?.version).toBe(1)
    expect(sorted[0]?.title).toBe('t1')
    expect(sorted[1]?.version).toBe(2)
    expect(sorted[1]?.title).toBe('t2')
    expect(sorted[1]?.content).toBe('c2')
  })

  it('cross-org cannot read another orgs version rows', async () => {
    const servicesA = createScopedServices(ctxA, {
      db: db as never,
      logger: silentLogger,
    })
    const servicesB = createScopedServices(ctxB, {
      db: db as never,
      logger: silentLogger,
    })
    const aNote = await servicesA.notes.createWithVersion({
      authorId: USER_A,
      title: 'a-secret',
      content: 'a',
      visibility: 'org',
    })

    // From B's repository perspective, no version rows for that note id.
    const reposB = createRepositories(ctxB, db as never)
    const versions = await reposB.noteVersions.listForNote(aNote.id)
    expect(versions).toEqual([])
  })

  it('updateWithVersion on a foreign-org note throws not_found and writes no version', async () => {
    const servicesA = createScopedServices(ctxA, {
      db: db as never,
      logger: silentLogger,
    })
    const servicesB = createScopedServices(ctxB, {
      db: db as never,
      logger: silentLogger,
    })
    const aNote = await servicesA.notes.createWithVersion({
      authorId: USER_A,
      title: 'tx-roll',
      content: 'orig',
    })
    await expect(
      servicesB.notes.updateWithVersion(aNote.id, { title: 'HACKED' }),
    ).rejects.toMatchObject({ code: 'not_found' })

    // Still exactly one version, and the note title is unchanged.
    const versions = await db
      .select()
      .from(noteVersions)
      .where(eq(noteVersions.noteId, aNote.id))
    expect(versions).toHaveLength(1)
    const fresh = await servicesA.notes.findById(aNote.id)
    expect(fresh?.title).toBe('tx-roll')
  })
})
