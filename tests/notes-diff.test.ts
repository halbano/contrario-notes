import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { makeTestDb, type TestDb } from './helpers/pglite-db'
import { createScopedServices } from '@/services'
import { createLogger } from '@/logging'
import { memberships, organizations, users } from '@/db/schema'
import type { RequestContext } from '@/lib/request-context'

/**
 * Version-diff endpoint coverage. Asserts:
 *  - diffVersions returns null for unknown ids / forbidden notes
 *  - diff segments correctly mark added / removed / equal lines
 *  - cross-org callers cannot diff another orgs versions
 */

let db: TestDb
let close: () => Promise<void>
const silentLogger = createLogger({ sink: () => undefined, minLevel: 'error' })

const ORG_A = 'aaaaaaaa-d1ff-d1ff-d1ff-aaaaaaaaaaaa'
const ORG_B = 'bbbbbbbb-d2ff-d2ff-d2ff-bbbbbbbbbbbb'
const USER_A = 'aaaaaaaa-aaaa-d1ff-aaaa-aaaaaaaaaaaa'
const USER_B = 'bbbbbbbb-bbbb-d2ff-bbbb-bbbbbbbbbbbb'

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
    { id: ORG_A, slug: 'org-a-diff', name: 'Org A' },
    { id: ORG_B, slug: 'org-b-diff', name: 'Org B' },
  ])
  await db.insert(users).values([
    { id: USER_A, email: 'a@d.example.com' },
    { id: USER_B, email: 'b@d.example.com' },
  ])
  await db.insert(memberships).values([
    { orgId: ORG_A, userId: USER_A, role: 'admin' },
    { orgId: ORG_B, userId: USER_B, role: 'admin' },
  ])
})

afterAll(async () => {
  await close()
})

describe('diffVersions', () => {
  it('returns segments marking added/removed/equal lines', async () => {
    const services = createScopedServices(ctxA, {
      db: db as never,
      logger: silentLogger,
    })
    const note = await services.notes.createWithVersion({
      authorId: USER_A,
      title: 'old',
      content: 'line 1\nline 2\nline 3',
    })
    const v1 = (await services.notes.listVersions(note.id))[0]!
    await services.notes.updateWithVersion(note.id, {
      title: 'new',
      content: 'line 1\nline two\nline 3',
    })
    const versions = await services.notes.listVersions(note.id)
    const v2 = versions.find((v) => v.version === 2)!

    const diff = await services.notes.diffVersions(note.id, v1.id, v2.id)
    expect(diff).not.toBeNull()
    expect(diff!.versionA.version).toBe(1)
    expect(diff!.versionB.version).toBe(2)

    // Title changed entirely.
    const titleKinds = diff!.title.map((s) => s.kind)
    expect(titleKinds).toContain('removed')
    expect(titleKinds).toContain('added')

    // Content has both an "equal" segment (line 1 / line 3) and changes.
    const contentKinds = diff!.content.map((s) => s.kind)
    expect(contentKinds).toContain('equal')
    expect(contentKinds).toContain('removed')
    expect(contentKinds).toContain('added')
  })

  it('returns null when either version id is unknown', async () => {
    const services = createScopedServices(ctxA, {
      db: db as never,
      logger: silentLogger,
    })
    const note = await services.notes.createWithVersion({
      authorId: USER_A,
      title: 't',
      content: 'c',
    })
    const v1 = (await services.notes.listVersions(note.id))[0]!
    const out = await services.notes.diffVersions(
      note.id,
      v1.id,
      '00000000-0000-0000-0000-000000000000',
    )
    expect(out).toBeNull()
  })

  it('cross-org caller receives null (note invisible from another org)', async () => {
    const servicesA = createScopedServices(ctxA, {
      db: db as never,
      logger: silentLogger,
    })
    const note = await servicesA.notes.createWithVersion({
      authorId: USER_A,
      title: 'orig',
      content: 'a',
    })
    await servicesA.notes.updateWithVersion(note.id, { content: 'b' })
    const versions = await servicesA.notes.listVersions(note.id)
    const [v1, v2] = versions

    const servicesB = createScopedServices(ctxB, {
      db: db as never,
      logger: silentLogger,
    })
    const out = await servicesB.notes.diffVersions(note.id, v1!.id, v2!.id)
    expect(out).toBeNull()
  })
})
