import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { makeTestDb, type TestDb } from './helpers/pglite-db'
import { createScopedServices } from '@/services'
import { createRepositories } from '@/repositories'
import { createLogger } from '@/logging'
import { memberships, organizations, users } from '@/db/schema'
import type { RequestContext } from '@/lib/request-context'

/**
 * Tags tenant-isolation harness. Asserts:
 *  - tags are scoped per-org: tag "spec" in Org A is a different row from
 *    tag "spec" in Org B.
 *  - findOrCreateByName never returns a foreign-org row.
 *  - setTagsForNote replaces the attachment set atomically.
 *  - viewer cannot tag (no update permission on the note).
 */

let db: TestDb
let close: () => Promise<void>
const silentLogger = createLogger({ sink: () => undefined, minLevel: 'error' })

const ORG_A = '11aaaa11-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const ORG_B = '22bbbb22-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const USER_A = '33aaaa33-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const USER_B = '44bbbb44-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const VIEWER_A = '55aaaa55-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

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
const ctxViewerA: RequestContext = Object.freeze({
  userId: VIEWER_A,
  orgId: ORG_A,
  role: 'viewer',
})

beforeAll(async () => {
  const made = await makeTestDb()
  db = made.db
  close = made.close

  await db.insert(organizations).values([
    { id: ORG_A, slug: 'org-a-tags', name: 'Org A' },
    { id: ORG_B, slug: 'org-b-tags', name: 'Org B' },
  ])
  await db.insert(users).values([
    { id: USER_A, email: 'a@tags.example.com' },
    { id: USER_B, email: 'b@tags.example.com' },
    { id: VIEWER_A, email: 'v@tags.example.com' },
  ])
  await db.insert(memberships).values([
    { orgId: ORG_A, userId: USER_A, role: 'admin' },
    { orgId: ORG_B, userId: USER_B, role: 'admin' },
    { orgId: ORG_A, userId: VIEWER_A, role: 'viewer' },
  ])
})

afterAll(async () => {
  await close()
})

describe('tags — tenant isolation', () => {
  it('the same tag name in two orgs produces two distinct rows', async () => {
    const reposA = createRepositories(ctxA, db as never)
    const reposB = createRepositories(ctxB, db as never)

    const tagA = await reposA.tags.findOrCreateByName('spec')
    const tagB = await reposB.tags.findOrCreateByName('spec')
    expect(tagA.id).not.toBe(tagB.id)
    expect(tagA.orgId).toBe(ORG_A)
    expect(tagB.orgId).toBe(ORG_B)
  })

  it('listForOrg returns only the calling orgs tags', async () => {
    const reposA = createRepositories(ctxA, db as never)
    const reposB = createRepositories(ctxB, db as never)
    await reposA.tags.findOrCreateByName('a-only')
    await reposB.tags.findOrCreateByName('b-only')

    const aTags = await reposA.tags.listForOrg()
    const bTags = await reposB.tags.listForOrg()
    expect(aTags.every((t) => t.orgId === ORG_A)).toBe(true)
    expect(bTags.every((t) => t.orgId === ORG_B)).toBe(true)
    expect(aTags.find((t) => t.name === 'b-only')).toBeUndefined()
    expect(bTags.find((t) => t.name === 'a-only')).toBeUndefined()
  })

  it('setNoteTags via service replaces the tag set on the note', async () => {
    const services = createScopedServices(ctxA, {
      db: db as never,
      logger: silentLogger,
    })
    const note = await services.notes.createWithVersion({
      authorId: USER_A,
      title: 'taggy',
      content: '',
    })
    await services.notes.setNoteTags(note.id, ['alpha', 'beta', 'alpha'])
    const tags1 = await services.notes.listTagsForNote(note.id)
    expect(tags1.map((t) => t.name).sort()).toEqual(['alpha', 'beta'])

    // Replace: drop beta, add gamma.
    await services.notes.setNoteTags(note.id, ['alpha', 'gamma'])
    const tags2 = await services.notes.listTagsForNote(note.id)
    expect(tags2.map((t) => t.name).sort()).toEqual(['alpha', 'gamma'])
  })

  it('viewer cannot tag a note (no update permission)', async () => {
    const servicesAdminA = createScopedServices(ctxA, {
      db: db as never,
      logger: silentLogger,
    })
    const note = await servicesAdminA.notes.createWithVersion({
      authorId: USER_A,
      title: 'untaggable',
      content: '',
    })
    const servicesViewer = createScopedServices(ctxViewerA, {
      db: db as never,
      logger: silentLogger,
    })
    await expect(
      servicesViewer.notes.setNoteTags(note.id, ['hack']),
    ).rejects.toMatchObject({ code: 'not_found' })
  })

  it('cross-org listTagsForNote returns empty for a note in another org', async () => {
    const servicesA = createScopedServices(ctxA, {
      db: db as never,
      logger: silentLogger,
    })
    const note = await servicesA.notes.createWithVersion({
      authorId: USER_A,
      title: 'private-but-tagged',
      content: '',
      visibility: 'private',
    })
    await servicesA.notes.setNoteTags(note.id, ['secret'])

    const servicesB = createScopedServices(ctxB, {
      db: db as never,
      logger: silentLogger,
    })
    const tags = await servicesB.notes.listTagsForNote(note.id)
    expect(tags).toEqual([])
  })
})
