import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { makeTestDb, type TestDb } from './helpers/pglite-db'
import { createScopedServices } from '@/services'
import { createLogger } from '@/logging'
import { memberships, organizations, users } from '@/db/schema'
import type { RequestContext } from '@/lib/request-context'

/**
 * note_shares CRUD + permission harness. Asserts:
 *  - Only the note's author or an org admin may share / unshare.
 *  - Cross-org share grants are rejected: target user is not a member.
 *  - viewer cannot create OR share.
 *  - Granting a `shared` note to a peer makes it appear in their listVisible.
 *  - Cross-org cannot read share rows (listShares is org-scoped + permission-checked).
 */

let db: TestDb
let close: () => Promise<void>
const silentLogger = createLogger({ sink: () => undefined, minLevel: 'error' })

const ORG_A = '11111111-aaaa-aaaa-aaaa-111111111111'
const ORG_B = '22222222-bbbb-bbbb-bbbb-222222222222'

const ADMIN_A = '33333333-aaaa-aaaa-aaaa-333333333333'
const MEMBER_A = '44444444-aaaa-aaaa-aaaa-444444444444'
const MEMBER_A2 = '55555555-aaaa-aaaa-aaaa-555555555555'
const VIEWER_A = '66666666-aaaa-aaaa-aaaa-666666666666'
const ADMIN_B = '77777777-bbbb-bbbb-bbbb-777777777777'

const ctxAdminA: RequestContext = Object.freeze({
  userId: ADMIN_A,
  orgId: ORG_A,
  role: 'admin',
})
const ctxMemberA: RequestContext = Object.freeze({
  userId: MEMBER_A,
  orgId: ORG_A,
  role: 'member',
})
const ctxMemberA2: RequestContext = Object.freeze({
  userId: MEMBER_A2,
  orgId: ORG_A,
  role: 'member',
})
const ctxViewerA: RequestContext = Object.freeze({
  userId: VIEWER_A,
  orgId: ORG_A,
  role: 'viewer',
})
const ctxAdminB: RequestContext = Object.freeze({
  userId: ADMIN_B,
  orgId: ORG_B,
  role: 'admin',
})

beforeAll(async () => {
  const made = await makeTestDb()
  db = made.db
  close = made.close

  await db.insert(organizations).values([
    { id: ORG_A, slug: 'org-a-shares', name: 'Org A' },
    { id: ORG_B, slug: 'org-b-shares', name: 'Org B' },
  ])
  await db.insert(users).values([
    { id: ADMIN_A, email: 'admin-a@s.example.com' },
    { id: MEMBER_A, email: 'member-a@s.example.com' },
    { id: MEMBER_A2, email: 'member-a2@s.example.com' },
    { id: VIEWER_A, email: 'viewer-a@s.example.com' },
    { id: ADMIN_B, email: 'admin-b@s.example.com' },
  ])
  await db.insert(memberships).values([
    { orgId: ORG_A, userId: ADMIN_A, role: 'admin' },
    { orgId: ORG_A, userId: MEMBER_A, role: 'member' },
    { orgId: ORG_A, userId: MEMBER_A2, role: 'member' },
    { orgId: ORG_A, userId: VIEWER_A, role: 'viewer' },
    { orgId: ORG_B, userId: ADMIN_B, role: 'admin' },
  ])
})

afterAll(async () => {
  await close()
})

describe('note_shares — permissions', () => {
  it('viewer cannot create a note (cannot share what they cannot create)', async () => {
    const services = createScopedServices(ctxViewerA, {
      db: db as never,
      logger: silentLogger,
    })
    await expect(
      services.notes.createWithVersion({
        authorId: VIEWER_A,
        title: 'no',
        content: '',
      }),
    ).rejects.toMatchObject({ code: 'permission_denied' })
  })

  it('a non-author non-admin member cannot share another members note', async () => {
    const servicesAuthor = createScopedServices(ctxMemberA, {
      db: db as never,
      logger: silentLogger,
    })
    const note = await servicesAuthor.notes.createWithVersion({
      authorId: MEMBER_A,
      title: 'mine',
      content: '',
      visibility: 'shared',
    })
    const servicesPeer = createScopedServices(ctxMemberA2, {
      db: db as never,
      logger: silentLogger,
    })
    await expect(
      servicesPeer.notes.shareNote({
        noteId: note.id,
        userId: MEMBER_A2,
        canEdit: false,
      }),
    ).rejects.toMatchObject({ code: 'not_found' })
  })

  it('the author may grant; an admin may also grant', async () => {
    const servicesAuthor = createScopedServices(ctxMemberA, {
      db: db as never,
      logger: silentLogger,
    })
    const note = await servicesAuthor.notes.createWithVersion({
      authorId: MEMBER_A,
      title: 'shared-by-author',
      content: '',
      visibility: 'shared',
    })
    await servicesAuthor.notes.shareNote({
      noteId: note.id,
      userId: MEMBER_A2,
      canEdit: false,
    })

    // Admin in same org can also grant.
    const servicesAdmin = createScopedServices(ctxAdminA, {
      db: db as never,
      logger: silentLogger,
    })
    const note2 = await servicesAdmin.notes.createWithVersion({
      authorId: ADMIN_A,
      title: 'shared-by-admin',
      content: '',
      visibility: 'shared',
    })
    await servicesAdmin.notes.shareNote({
      noteId: note2.id,
      userId: MEMBER_A,
      canEdit: false,
    })

    const grants1 = await servicesAuthor.notes.listShares(note.id)
    const grants2 = await servicesAdmin.notes.listShares(note2.id)
    expect(grants1.length).toBe(1)
    expect(grants2.length).toBe(1)
  })

  it('cannot grant to a user who is not a member of the notes org', async () => {
    const services = createScopedServices(ctxAdminA, {
      db: db as never,
      logger: silentLogger,
    })
    const note = await services.notes.createWithVersion({
      authorId: ADMIN_A,
      title: 'reject-foreign',
      content: '',
      visibility: 'shared',
    })
    await expect(
      services.notes.shareNote({
        noteId: note.id,
        userId: ADMIN_B, // org B
        canEdit: false,
      }),
    ).rejects.toMatchObject({ code: 'invalid_input' })
  })

  it('granting a shared note makes it appear in the grantees listVisible', async () => {
    const author = createScopedServices(ctxMemberA, {
      db: db as never,
      logger: silentLogger,
    })
    const note = await author.notes.createWithVersion({
      authorId: MEMBER_A,
      title: 'visible-after-grant',
      content: '',
      visibility: 'shared',
    })
    const peer = createScopedServices(ctxMemberA2, {
      db: db as never,
      logger: silentLogger,
    })
    // Before grant — peer cannot see the shared note.
    const before = await peer.notes.listVisible({ limit: 200 })
    expect(before.find((n) => n.id === note.id)).toBeUndefined()

    await author.notes.shareNote({
      noteId: note.id,
      userId: MEMBER_A2,
      canEdit: false,
    })

    const after = await peer.notes.listVisible({ limit: 200 })
    expect(after.find((n) => n.id === note.id)).toBeDefined()
  })

  it('unshareNote revokes the grant and removes visibility', async () => {
    const author = createScopedServices(ctxMemberA, {
      db: db as never,
      logger: silentLogger,
    })
    const note = await author.notes.createWithVersion({
      authorId: MEMBER_A,
      title: 'revoke-me',
      content: '',
      visibility: 'shared',
    })
    await author.notes.shareNote({
      noteId: note.id,
      userId: MEMBER_A2,
      canEdit: false,
    })
    await author.notes.unshareNote(note.id, MEMBER_A2)

    const peer = createScopedServices(ctxMemberA2, {
      db: db as never,
      logger: silentLogger,
    })
    const after = await peer.notes.listVisible({ limit: 200 })
    expect(after.find((n) => n.id === note.id)).toBeUndefined()
  })

  it('cross-org listShares returns 404 (note invisible from another org)', async () => {
    const servicesA = createScopedServices(ctxAdminA, {
      db: db as never,
      logger: silentLogger,
    })
    const note = await servicesA.notes.createWithVersion({
      authorId: ADMIN_A,
      title: 'cross-org-shares',
      content: '',
      visibility: 'shared',
    })
    const servicesB = createScopedServices(ctxAdminB, {
      db: db as never,
      logger: silentLogger,
    })
    await expect(servicesB.notes.listShares(note.id)).rejects.toMatchObject({
      code: 'not_found',
    })
  })
})
