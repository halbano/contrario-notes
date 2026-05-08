import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { makeTestDb, type TestDb } from './helpers/pglite-db'
import { createScopedServices } from '@/services'
import { createLogger } from '@/logging'
import {
  auditLog,
  files,
  memberships,
  noteShares,
  organizations,
  users,
} from '@/db/schema'
import type { RequestContext } from '@/lib/request-context'
import type { FileStorage } from '@/services/files-storage'

/**
 * Tenant-isolation harness for files. Asserts the four invariants from
 * ADR-0005 + TENANCY_INVARIANTS invariant 5:
 *
 *  1. Cross-org read of a file → 404 (no existence disclosure).
 *  2. Visibility on the parent note gates the file: a user without a
 *     `note_shares` grant cannot read a file attached to a `shared` note.
 *  3. Path enumeration grants no access — only `mintSignedUrl`'s
 *     permission check does.
 *  4. Stale URL after TTL is rejected (simulated via mocked storage).
 *
 * Plus: every read/upload/delete writes an audit_log row scoped to
 * ctx.orgId. The mock FileStorage records every call so we can assert
 * that no signed URL was minted on a denied path.
 */

let db: TestDb
let close: () => Promise<void>
const silentLogger = createLogger({ sink: () => undefined, minLevel: 'error' })

const ORG_A = '11111111-aaaa-1111-aaaa-111111111111'
const ORG_B = '22222222-bbbb-2222-bbbb-222222222222'
const USER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const USER_A2 = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const USER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

const ctxA: RequestContext = Object.freeze({ userId: USER_A, orgId: ORG_A, role: 'admin' })
const ctxA2: RequestContext = Object.freeze({ userId: USER_A2, orgId: ORG_A, role: 'member' })
const ctxB: RequestContext = Object.freeze({ userId: USER_B, orgId: ORG_B, role: 'admin' })

/**
 * In-memory storage adapter. Records every call. Supports a TTL clock so
 * we can simulate signed-URL expiry.
 */
function makeMemoryStorage(): FileStorage & {
  uploads: Map<string, { bytes: Uint8Array; mime: string }>
  signed: Array<{ path: string; ttl: number; mintedAt: number }>
  removes: string[]
  /** Verify a (mocked) URL is still within its TTL. */
  isValid(path: string, mintedAt: number, ttl: number): boolean
} {
  const uploads = new Map<string, { bytes: Uint8Array; mime: string }>()
  const signed: Array<{ path: string; ttl: number; mintedAt: number }> = []
  const removes: string[] = []
  return {
    uploads,
    signed,
    removes,
    async upload(path, bytes, mime) {
      uploads.set(path, {
        bytes: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes as ArrayBuffer),
        mime,
      })
    },
    async remove(path) {
      removes.push(path)
      uploads.delete(path)
    },
    async createSignedUrl(path, ttl) {
      if (ttl > 300) throw new Error('TTL > 300s')
      if (!uploads.has(path)) throw new Error('object missing')
      const mintedAt = Date.now()
      signed.push({ path, ttl, mintedAt })
      return `https://signed.example/${encodeURIComponent(path)}?ttl=${ttl}&t=${mintedAt}`
    },
    isValid(path, mintedAt, ttl) {
      return Date.now() - mintedAt <= ttl * 1000 && uploads.has(path)
    },
  }
}

beforeAll(async () => {
  const made = await makeTestDb()
  db = made.db
  close = made.close

  await db.insert(organizations).values([
    { id: ORG_A, slug: 'fileiso-a', name: 'FileIso A' },
    { id: ORG_B, slug: 'fileiso-b', name: 'FileIso B' },
  ])
  await db.insert(users).values([
    { id: USER_A, email: 'a@fileiso.example', displayName: 'A' },
    { id: USER_A2, email: 'a2@fileiso.example', displayName: 'A2' },
    { id: USER_B, email: 'b@fileiso.example', displayName: 'B' },
  ])
  await db.insert(memberships).values([
    { orgId: ORG_A, userId: USER_A, role: 'admin' },
    { orgId: ORG_A, userId: USER_A2, role: 'member' },
    { orgId: ORG_B, userId: USER_B, role: 'admin' },
  ])
})

afterAll(async () => {
  await close()
})

describe('files isolation — cross-org read denial', () => {
  it("user from org A cannot mintSignedUrl for a file in org B (404, no signed URL minted)", async () => {
    const storage = makeMemoryStorage()
    const svcB = createScopedServices(ctxB, {
      db: db as never,
      logger: silentLogger,
      fileStorage: storage,
    })
    const svcA = createScopedServices(ctxA, {
      db: db as never,
      logger: silentLogger,
      fileStorage: storage,
    })

    // B creates a note + file in org B.
    const noteB = await svcB.notes.create({
      authorId: USER_B,
      title: 'B note',
      content: '',
      visibility: 'org',
    })
    const fileB = await svcB.files.upload({
      noteId: noteB.id,
      filename: 'b.txt',
      mimeType: 'text/plain',
      bytes: new Uint8Array([1, 2, 3]),
    })
    expect(fileB.orgId).toBe(ORG_B)

    // From A's perspective: 404, and storage was never called.
    const baseline = storage.signed.length
    await expect(svcA.files.mintSignedUrl(fileB.id)).rejects.toMatchObject({
      code: 'not_found',
    })
    expect(storage.signed.length).toBe(baseline)
  })
})

describe('files isolation — parent-note visibility', () => {
  it("non-grantee in same org cannot read a file attached to a 'shared' note", async () => {
    const storage = makeMemoryStorage()
    const svcOwner = createScopedServices(ctxA, {
      db: db as never,
      logger: silentLogger,
      fileStorage: storage,
    })
    const svcPeer = createScopedServices(ctxA2, {
      db: db as never,
      logger: silentLogger,
      fileStorage: storage,
    })

    const sharedNote = await svcOwner.notes.create({
      authorId: USER_A,
      title: 'shared',
      content: '',
      visibility: 'shared',
    })
    const file = await svcOwner.files.upload({
      noteId: sharedNote.id,
      filename: 'secret.txt',
      mimeType: 'text/plain',
      bytes: new Uint8Array([9, 9, 9]),
    })

    // Peer with no note_shares grant → 404.
    const baseline = storage.signed.length
    await expect(svcPeer.files.mintSignedUrl(file.id)).rejects.toMatchObject({
      code: 'not_found',
    })
    expect(storage.signed.length).toBe(baseline)

    // Grant peer access; now they can read.
    await svcOwner.notes.shareNote({
      noteId: sharedNote.id,
      userId: USER_A2,
      canEdit: false,
    })
    const out = await svcPeer.files.mintSignedUrl(file.id)
    expect(out.url).toContain('/signed.example/')
    expect(storage.signed.length).toBe(baseline + 1)

    // Revoke; back to 404.
    await svcOwner.notes.unshareNote(sharedNote.id, USER_A2)
    await expect(svcPeer.files.mintSignedUrl(file.id)).rejects.toMatchObject({
      code: 'not_found',
    })

    // Cleanup the shares row to keep test state tidy.
    await db.delete(noteShares).where(eq(noteShares.noteId, sharedNote.id))
  })
})

describe('files isolation — path enumeration grants no access', () => {
  it("knowing the storage path does not yield a signed URL — only mintSignedUrl + permission check does", async () => {
    const storage = makeMemoryStorage()
    const svcOwner = createScopedServices(ctxA, {
      db: db as never,
      logger: silentLogger,
      fileStorage: storage,
    })
    const svcPeer = createScopedServices(ctxA2, {
      db: db as never,
      logger: silentLogger,
      fileStorage: storage,
    })

    // Owner makes a private note + file.
    const privNote = await svcOwner.notes.create({
      authorId: USER_A,
      title: 'private',
      content: '',
      visibility: 'private',
    })
    const file = await svcOwner.files.upload({
      noteId: privNote.id,
      filename: 'priv.txt',
      mimeType: 'text/plain',
      bytes: new Uint8Array([1]),
    })

    // The bytes ARE in storage at a known path.
    expect(storage.uploads.has(file.storagePath)).toBe(true)

    // The peer might know the path (it embeds org+note+file id) — that
    // knowledge alone gives them nothing. There is no API to bypass
    // mintSignedUrl, and mintSignedUrl returns 404 for them.
    const baseline = storage.signed.length
    await expect(svcPeer.files.mintSignedUrl(file.id)).rejects.toMatchObject({
      code: 'not_found',
    })
    expect(storage.signed.length).toBe(baseline)
    // Knowing the file_id without going through mintSignedUrl yields no
    // metadata either.
    expect(await svcPeer.files.findById(file.id)).toBeNull()
  })
})

describe('files isolation — TTL semantics', () => {
  it('mint clamps TTL to 300s and the simulated storage rejects expired URLs', async () => {
    const storage = makeMemoryStorage()
    const svcOwner = createScopedServices(ctxA, {
      db: db as never,
      logger: silentLogger,
      fileStorage: storage,
    })

    const note = await svcOwner.notes.create({
      authorId: USER_A,
      title: 'ttl',
      content: '',
      visibility: 'org',
    })
    const file = await svcOwner.files.upload({
      noteId: note.id,
      filename: 't.txt',
      mimeType: 'text/plain',
      bytes: new Uint8Array([1]),
    })

    const out = await svcOwner.files.mintSignedUrl(file.id, { ttlSeconds: 100_000 })
    expect(out.url).toBeDefined()
    const last = storage.signed[storage.signed.length - 1]!
    expect(last.ttl).toBe(300)

    // Same URL is "still valid" right after minting.
    expect(storage.isValid(last.path, last.mintedAt, last.ttl)).toBe(true)

    // Simulate the URL aging past its TTL.
    const expiredMintedAt = Date.now() - 301 * 1000
    expect(storage.isValid(last.path, expiredMintedAt, last.ttl)).toBe(false)
  })
})

describe('files isolation — audit_log coverage', () => {
  it('every successful upload, read, and delete writes an org-scoped audit_log row', async () => {
    const storage = makeMemoryStorage()
    const svc = createScopedServices(ctxA, {
      db: db as never,
      logger: silentLogger,
      fileStorage: storage,
    })

    const note = await svc.notes.create({
      authorId: USER_A,
      title: 'audit',
      content: '',
      visibility: 'org',
    })
    const file = await svc.files.upload({
      noteId: note.id,
      filename: 'a.txt',
      mimeType: 'text/plain',
      bytes: new Uint8Array([1]),
    })
    await svc.files.mintSignedUrl(file.id)
    await svc.files.remove(file.id)

    // Pull every audit row for org A and check the expected events landed.
    const rows = await db.select().from(auditLog).where(eq(auditLog.orgId, ORG_A))
    const events = rows.map((r) => r.event)
    expect(events).toContain('file.uploaded')
    expect(events).toContain('file.read')
    expect(events).toContain('file.deleted')
    // Every row is scoped to ctx.orgId.
    for (const r of rows) {
      expect(r.orgId).toBe(ORG_A)
    }
  })

  it("a denied read does NOT write file.read to audit_log (no signed URL → no read event)", async () => {
    const storage = makeMemoryStorage()
    const svcOwner = createScopedServices(ctxA, {
      db: db as never,
      logger: silentLogger,
      fileStorage: storage,
    })
    const svcOther = createScopedServices(ctxB, {
      db: db as never,
      logger: silentLogger,
      fileStorage: storage,
    })

    const privNote = await svcOwner.notes.create({
      authorId: USER_A,
      title: 'private-denied',
      content: '',
      visibility: 'private',
    })
    const file = await svcOwner.files.upload({
      noteId: privNote.id,
      filename: 'priv.txt',
      mimeType: 'text/plain',
      bytes: new Uint8Array([1]),
    })

    // Snapshot file.read events for ORG_A before the denied attempt.
    const before = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.orgId, ORG_A))
    const beforeReads = before.filter((r) => r.event === 'file.read').length

    // Attempt cross-org read from B.
    await expect(svcOther.files.mintSignedUrl(file.id)).rejects.toMatchObject({
      code: 'not_found',
    })

    // No new file.read row in ORG_A (the denied attempt didn't see the file).
    const after = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.orgId, ORG_A))
    const afterReads = after.filter((r) => r.event === 'file.read').length
    expect(afterReads).toBe(beforeReads)
  })
})
