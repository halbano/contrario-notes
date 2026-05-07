import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { makeTestDb, type TestDb } from './helpers/pglite-db'
import { createScopedServices } from '@/services'
import { createRepositories } from '@/repositories'
import { createLogger } from '@/logging'
import type { RequestContext } from '@/lib/request-context'
import { memberships, organizations, users } from '@/db/schema'

/**
 * Tenant-isolation harness. The single most important test in the repo.
 *
 * Asserts, against a real (in-process) Postgres with the project schema,
 * that:
 *
 *   - A request scoped to org A cannot read notes from org B.
 *   - A request scoped to org A cannot UPDATE or DELETE notes in org B.
 *   - A request scoped to org A cannot INSERT a note tagged with org B's id
 *     (the repository must reject the foreign orgId).
 *   - A scoped repository's findById returns null for a foreign-org id —
 *     not 403, to avoid existence disclosure.
 *
 * If any of these flips, tenancy is broken and the build must fail.
 */

let db: TestDb
let close: () => Promise<void>
const silentLogger = createLogger({ sink: () => undefined, minLevel: 'error' })

const ORG_A = '11111111-1111-1111-1111-111111111111'
const ORG_B = '22222222-2222-2222-2222-222222222222'
const USER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const USER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

const ctxA: RequestContext = Object.freeze({ userId: USER_A, orgId: ORG_A, role: 'admin' })
const ctxB: RequestContext = Object.freeze({ userId: USER_B, orgId: ORG_B, role: 'admin' })

beforeAll(async () => {
  const made = await makeTestDb()
  db = made.db
  close = made.close

  // Seed two orgs, one user each, one membership each.
  await db.insert(organizations).values([
    { id: ORG_A, slug: 'org-a', name: 'Org A' },
    { id: ORG_B, slug: 'org-b', name: 'Org B' },
  ])
  await db.insert(users).values([
    { id: USER_A, email: 'a@example.com', displayName: 'A' },
    { id: USER_B, email: 'b@example.com', displayName: 'B' },
  ])
  await db.insert(memberships).values([
    { orgId: ORG_A, userId: USER_A, role: 'admin' },
    { orgId: ORG_B, userId: USER_B, role: 'admin' },
  ])
})

afterAll(async () => {
  await close()
})

describe('tenant isolation — repositories layer', () => {
  it('repo.findById returns null for a note that lives in another org', async () => {
    const reposA = createRepositories(ctxA, db as never)
    const reposB = createRepositories(ctxB, db as never)

    // Create a note in org B.
    const created = await reposB.notes.create({
      authorId: USER_B,
      title: 'B-only secret',
      content: 'should never reach A',
    })
    expect(created.orgId).toBe(ORG_B)

    // From org A's perspective, the row does not exist.
    const stolen = await reposA.notes.findById(created.id)
    expect(stolen).toBeNull()
  })

  it('repo.listRecent never returns rows from another org', async () => {
    const reposA = createRepositories(ctxA, db as never)
    const reposB = createRepositories(ctxB, db as never)

    await reposA.notes.create({ authorId: USER_A, title: 'A-1', content: '' })
    await reposB.notes.create({ authorId: USER_B, title: 'B-1', content: '' })

    const aResults = await reposA.notes.listRecent({ limit: 100 })
    const bResults = await reposB.notes.listRecent({ limit: 100 })

    expect(aResults.every((r) => r.orgId === ORG_A)).toBe(true)
    expect(bResults.every((r) => r.orgId === ORG_B)).toBe(true)
    expect(aResults.some((r) => r.orgId === ORG_B)).toBe(false)
    expect(bResults.some((r) => r.orgId === ORG_A)).toBe(false)
  })

  it('repo.update silently no-ops on a note from another org (returns null)', async () => {
    const reposA = createRepositories(ctxA, db as never)
    const reposB = createRepositories(ctxB, db as never)

    const target = await reposB.notes.create({
      authorId: USER_B,
      title: 'do not touch',
      content: '',
    })

    const updated = await reposA.notes.update(target.id, { title: 'HACKED' })
    expect(updated).toBeNull()

    const fresh = await reposB.notes.findById(target.id)
    expect(fresh?.title).toBe('do not touch')
  })

  it('repo.softDelete silently no-ops on a note from another org', async () => {
    const reposA = createRepositories(ctxA, db as never)
    const reposB = createRepositories(ctxB, db as never)

    const target = await reposB.notes.create({
      authorId: USER_B,
      title: 'persist',
      content: '',
    })

    const ok = await reposA.notes.softDelete(target.id)
    expect(ok).toBe(false)

    const fresh = await reposB.notes.findById(target.id)
    expect(fresh).not.toBeNull()
    expect(fresh?.deletedAt).toBeNull()
  })

  it('repo.create rejects a payload that supplies a foreign orgId', async () => {
    const reposA = createRepositories(ctxA, db as never)
    await expect(
      reposA.notes.create({
        authorId: USER_A,
        title: 't',
        content: '',
        // @ts-expect-error — typed-out, but the structural check at runtime
        // is what we're asserting here.
        orgId: ORG_B,
      }),
    ).rejects.toThrow(/foreign orgId/i)
  })
})

describe('tenant isolation — services layer (404 surface)', () => {
  it('service.findById returns null (not 403) when accessing another orgs note', async () => {
    const reposB = createRepositories(ctxB, db as never)
    const target = await reposB.notes.create({
      authorId: USER_B,
      title: 'B private',
      content: '',
      visibility: 'private',
    })

    const services = createScopedServices(ctxA, { db: db as never, logger: silentLogger })
    const out = await services.notes.findById(target.id)
    expect(out).toBeNull()
  })

  it('service.update on another-org note throws not_found (404), never permission_denied', async () => {
    const reposB = createRepositories(ctxB, db as never)
    const target = await reposB.notes.create({
      authorId: USER_B,
      title: 'B owned',
      content: '',
    })
    const services = createScopedServices(ctxA, { db: db as never, logger: silentLogger })
    await expect(services.notes.update(target.id, { title: 'X' })).rejects.toMatchObject({
      code: 'not_found',
    })
  })
})
