import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createScopedServices } from './index'
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_BYTES,
  buildStoragePath,
} from './files-service'
import { MAX_SIGNED_URL_TTL_SECONDS } from './files-storage'
import type { DbFile, DbNote } from '@/db/schema'
import type { RequestContext } from '@/lib/request-context'
import type { Repositories } from '@/repositories'
import { createLogger, type LogRecord } from '@/logging/logger'
import type { FileStorage } from './files-storage'

const ORG = 'org-A'
const OTHER_ORG = 'org-B'
const ME = 'user-me'
const SOMEONE = 'user-other'

function ctxOf(role: 'admin' | 'member' | 'viewer', userId = ME, orgId = ORG): RequestContext {
  return Object.freeze({ userId, orgId, role })
}

function makeNote(overrides: Partial<DbNote> = {}): DbNote {
  return {
    id: 'n-1',
    orgId: ORG,
    authorId: ME,
    title: 't',
    content: 'c',
    visibility: 'org',
    tagsText: '',
    searchTsv: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    ...overrides,
  }
}

function makeFile(overrides: Partial<DbFile> = {}): DbFile {
  return {
    id: 'f-1',
    orgId: ORG,
    noteId: 'n-1',
    uploaderId: ME,
    storagePath: 'org/org-A/note/n-1/f-1-x.png',
    filename: 'x.png',
    mimeType: 'image/png',
    sizeBytes: 100,
    createdAt: new Date('2026-01-01'),
    deletedAt: null,
    ...overrides,
  }
}

function makeFakeStorage(): FileStorage & {
  uploadCalls: Array<[string, unknown, string]>
  removed: string[]
  signedFor: Array<[string, number]>
} {
  const uploadCalls: Array<[string, unknown, string]> = []
  const removed: string[] = []
  const signedFor: Array<[string, number]> = []
  return {
    uploadCalls,
    removed,
    signedFor,
    async upload(path, bytes, mime) {
      uploadCalls.push([path, bytes, mime])
    },
    async remove(path) {
      removed.push(path)
    },
    async createSignedUrl(path, ttl) {
      signedFor.push([path, ttl])
      if (ttl > MAX_SIGNED_URL_TTL_SECONDS) throw new Error('ttl too large')
      return `https://signed.example/${path}?exp=${ttl}`
    },
  }
}

function makeRepos(opts: {
  note?: DbNote | null
  file?: DbFile | null
  files?: DbFile[]
} = {}) {
  let storedFile: DbFile | null = opts.file ?? null
  const storedNote = opts.note ?? null
  const fileList: DbFile[] = opts.files ?? (storedFile ? [storedFile] : [])
  const repos: Repositories = {
    notes: {
      findById: vi.fn(async (id: string) => {
        if (storedNote && storedNote.id === id) return storedNote
        return null
      }),
      listRecent: vi.fn(async () => []),
      listVisible: vi.fn(async () => []),
      findVisibleByIds: vi.fn(async () => []),
      create: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(async () => false),
    },
    orgs: {
      current: vi.fn(),
      listForCurrentUser: vi.fn(async () => []),
      createWithAdmin: vi.fn(),
    },
    memberships: {
      listForCurrentOrg: vi.fn(async () => []),
      findForCurrentUser: vi.fn(async () => null),
      findForUserAndOrg: vi.fn(async () => null),
      add: vi.fn(),
      updateRole: vi.fn(async () => null),
      remove: vi.fn(async () => false),
    },
    noteVersions: {
      createVersion: vi.fn(),
      listForNote: vi.fn(async () => []),
      findById: vi.fn(async () => null),
      findPair: vi.fn(async () => null),
    },
    tags: {
      listForOrg: vi.fn(async () => []),
      listForNote: vi.fn(async () => []),
      findOrCreateByName: vi.fn(),
      attachToNote: vi.fn(),
      detachFromNote: vi.fn(async () => false),
      setTagsForNote: vi.fn(async () => []),
    },
    noteShares: {
      listForNote: vi.fn(async () => []),
      listForNoteWithUsers: vi.fn(async () => []),
      listOrgMembersWithUsers: vi.fn(async () => []),
      grant: vi.fn(),
      revoke: vi.fn(async () => false),
      has: vi.fn(async () => false),
    },
    files: {
      findById: vi.fn(async (id: string) => {
        if (storedFile && storedFile.id === id && !storedFile.deletedAt) return storedFile
        return null
      }),
      listByNote: vi.fn(async () => fileList.filter((f) => !f.deletedAt)),
      listForOrg: vi.fn(async () => fileList.filter((f) => !f.deletedAt)),
      create: vi.fn(async (input) => {
        const row: DbFile = makeFile({
          id: 'f-new',
          ...input,
        })
        storedFile = row
        return row
      }),
      hardDelete: vi.fn(async () => {
        storedFile = null
        return true
      }),
      softDelete: vi.fn(async (id: string) => {
        if (storedFile && storedFile.id === id) {
          storedFile = { ...storedFile, deletedAt: new Date() }
          return true
        }
        return false
      }),
    },
    auditLog: {
      record: vi.fn(async () => ({}) as never),
      listRecent: vi.fn(async () => []),
    },
    search: {
      searchVisible: vi.fn(async () => []),
    },
    users: {
      findById: vi.fn(async () => null),
      findByEmail: vi.fn(async () => null),
      upsertMirror: vi.fn(async ({ id, email }) => ({
        id,
        email,
        displayName: null,
        createdAt: new Date(),
      })),
    },
    db: { transaction: async (fn: (tx: unknown) => unknown) => fn({}) } as never,
  }
  return { repos, peekFile: () => storedFile }
}

let _silent: ReturnType<typeof createLogger> | undefined
function silent() {
  if (!_silent) _silent = createLogger({ sink: () => undefined, minLevel: 'error' })
  return _silent
}
beforeEach(() => {
  _silent = undefined
})

describe('buildStoragePath', () => {
  it('embeds org+note+file id and strips leading dots / path separators', () => {
    const path = buildStoragePath({
      orgId: 'org-A',
      noteId: 'n-1',
      fileId: 'f-1',
      filename: '../escape/weird.txt',
    })
    expect(path).toBe('org/org-A/note/n-1/f-1-_escape_weird.txt')
  })
  it('uses standalone segment when noteId is null', () => {
    const p = buildStoragePath({ orgId: 'org-A', noteId: null, fileId: 'f-1', filename: 'x.pdf' })
    expect(p).toBe('org/org-A/standalone/f-1-x.pdf')
  })
  it('replaces spaces + other non-key-safe chars with underscores', () => {
    // Regression: Supabase Storage rejected keys containing spaces with
    // `Invalid key`. Real prod repro: macOS screenshot filename with
    // spaces + colons.
    const p = buildStoragePath({
      orgId: 'org-A',
      noteId: 'n-1',
      fileId: 'f-1',
      filename: 'Screenshot 2026-05-12 at 12.06.14 AM.png',
    })
    expect(p).toBe('org/org-A/note/n-1/f-1-Screenshot_2026-05-12_at_12.06.14_AM.png')
  })
  it('collapses repeated unsafe-char runs to a single underscore', () => {
    const p = buildStoragePath({
      orgId: 'org-A',
      noteId: 'n-1',
      fileId: 'f-1',
      filename: 'weird !!! name.pdf',
    })
    expect(p).toBe('org/org-A/note/n-1/f-1-weird_name.pdf')
  })
})

describe('upload — validation', () => {
  it('rejects empty filename', async () => {
    const { repos } = makeRepos({ note: makeNote() })
    const storage = makeFakeStorage()
    const svc = createScopedServices(ctxOf('member'), {
      repositories: repos,
      logger: silent(),
      fileStorage: storage,
    })
    await expect(
      svc.files.upload({ noteId: 'n-1', filename: '   ', mimeType: 'image/png', bytes: new Uint8Array([1]) }),
    ).rejects.toMatchObject({ code: 'invalid_input' })
  })
  it('rejects disallowed MIME type', async () => {
    const { repos } = makeRepos({ note: makeNote() })
    const storage = makeFakeStorage()
    const svc = createScopedServices(ctxOf('member'), {
      repositories: repos,
      logger: silent(),
      fileStorage: storage,
    })
    await expect(
      svc.files.upload({ noteId: 'n-1', filename: 'x.exe', mimeType: 'application/x-msdownload', bytes: new Uint8Array([1]) }),
    ).rejects.toMatchObject({ code: 'invalid_input' })
  })
  it('rejects bytes over the size cap', async () => {
    const { repos } = makeRepos({ note: makeNote() })
    const storage = makeFakeStorage()
    const svc = createScopedServices(ctxOf('member'), {
      repositories: repos,
      logger: silent(),
      fileStorage: storage,
    })
    const tooBig = new Uint8Array(MAX_FILE_BYTES + 1)
    await expect(
      svc.files.upload({ noteId: 'n-1', filename: 'x.png', mimeType: 'image/png', bytes: tooBig }),
    ).rejects.toMatchObject({ code: 'invalid_input' })
  })
  it('allows every MIME type in the allowlist', () => {
    expect(ALLOWED_MIME_TYPES.has('image/png')).toBe(true)
    expect(ALLOWED_MIME_TYPES.has('application/pdf')).toBe(true)
    expect(ALLOWED_MIME_TYPES.has('text/markdown')).toBe(true)
  })
})

describe('upload — permission gating', () => {
  it('viewer cannot upload', async () => {
    const { repos } = makeRepos({ note: makeNote() })
    const storage = makeFakeStorage()
    const svc = createScopedServices(ctxOf('viewer'), {
      repositories: repos,
      logger: silent(),
      fileStorage: storage,
    })
    await expect(
      svc.files.upload({ noteId: 'n-1', filename: 'x.png', mimeType: 'image/png', bytes: new Uint8Array([1]) }),
    ).rejects.toMatchObject({ code: 'not_found' })
    expect(repos.files.create).not.toHaveBeenCalled()
    expect(storage.uploadCalls).toHaveLength(0)
  })
  it("member cannot upload to someone else's private note (404, no existence disclosure)", async () => {
    const { repos } = makeRepos({ note: makeNote({ authorId: SOMEONE, visibility: 'private' }) })
    const storage = makeFakeStorage()
    const svc = createScopedServices(ctxOf('member'), {
      repositories: repos,
      logger: silent(),
      fileStorage: storage,
    })
    await expect(
      svc.files.upload({ noteId: 'n-1', filename: 'x.png', mimeType: 'image/png', bytes: new Uint8Array([1]) }),
    ).rejects.toMatchObject({ code: 'not_found' })
    expect(storage.uploadCalls).toHaveLength(0)
  })
  it('upload to a missing note → 404', async () => {
    const { repos } = makeRepos({ note: null })
    const storage = makeFakeStorage()
    const svc = createScopedServices(ctxOf('member'), {
      repositories: repos,
      logger: silent(),
      fileStorage: storage,
    })
    await expect(
      svc.files.upload({ noteId: 'missing', filename: 'x.png', mimeType: 'image/png', bytes: new Uint8Array([1]) }),
    ).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('upload — happy path & rollback', () => {
  it('creates the row, uploads bytes, and writes audit', async () => {
    const { repos } = makeRepos({ note: makeNote() })
    const storage = makeFakeStorage()
    const svc = createScopedServices(ctxOf('member'), {
      repositories: repos,
      logger: silent(),
      fileStorage: storage,
    })
    const row = await svc.files.upload({
      noteId: 'n-1',
      filename: 'hello.png',
      mimeType: 'image/png',
      bytes: new Uint8Array([1, 2, 3]),
    })
    expect(row.id).toBeDefined()
    expect(repos.files.create).toHaveBeenCalled()
    expect(storage.uploadCalls).toHaveLength(1)
    expect(storage.uploadCalls[0]?.[0]).toMatch(/^org\/org-A\/note\/n-1\//)
    expect(repos.auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'file.uploaded' }),
    )
  })
  it('rolls back the row on storage failure', async () => {
    const { repos } = makeRepos({ note: makeNote() })
    const storage: FileStorage = {
      upload: vi.fn(async () => {
        throw new Error('s3 down')
      }),
      remove: vi.fn(),
      createSignedUrl: vi.fn(),
    }
    const svc = createScopedServices(ctxOf('member'), {
      repositories: repos,
      logger: silent(),
      fileStorage: storage,
    })
    await expect(
      svc.files.upload({ noteId: 'n-1', filename: 'x.png', mimeType: 'image/png', bytes: new Uint8Array([1]) }),
    ).rejects.toMatchObject({ code: 'internal' })
    expect(repos.files.hardDelete).toHaveBeenCalled()
  })
})

describe('mintSignedUrl — permission gating + TTL', () => {
  it('returns a signed URL with TTL ≤ 5min when allowed', async () => {
    const file = makeFile()
    const { repos } = makeRepos({ note: makeNote(), file })
    const storage = makeFakeStorage()
    const svc = createScopedServices(ctxOf('member'), {
      repositories: repos,
      logger: silent(),
      fileStorage: storage,
    })
    const out = await svc.files.mintSignedUrl(file.id)
    expect(out.url).toContain(file.storagePath)
    expect(storage.signedFor[0]?.[1]).toBeLessThanOrEqual(300)
    expect(out.expiresAt.getTime() - Date.now()).toBeGreaterThan(0)
    expect(out.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(300_000 + 1000)
  })

  it('clamps an over-budget TTL request down to 300s', async () => {
    const file = makeFile()
    const { repos } = makeRepos({ note: makeNote(), file })
    const storage = makeFakeStorage()
    const svc = createScopedServices(ctxOf('member'), {
      repositories: repos,
      logger: silent(),
      fileStorage: storage,
    })
    await svc.files.mintSignedUrl(file.id, { ttlSeconds: 100_000 })
    expect(storage.signedFor[0]?.[1]).toBe(300)
  })

  it("denies cross-org → 404 (no existence disclosure)", async () => {
    const file = makeFile({ orgId: OTHER_ORG, storagePath: 'org/org-B/note/n-1/f-1-x.png' })
    // findById is org-scoped in real life — fake the scoping by returning null.
    const { repos } = makeRepos({ note: null, file: null })
    const storage = makeFakeStorage()
    const svc = createScopedServices(ctxOf('member', ME, ORG), {
      repositories: repos,
      logger: silent(),
      fileStorage: storage,
    })
    await expect(svc.files.mintSignedUrl(file.id)).rejects.toMatchObject({ code: 'not_found' })
    expect(storage.signedFor).toHaveLength(0)
  })

  it("denies a private parent note read by non-author → 404", async () => {
    const note = makeNote({ authorId: SOMEONE, visibility: 'private' })
    const file = makeFile({ uploaderId: SOMEONE })
    const { repos } = makeRepos({ note, file })
    const storage = makeFakeStorage()
    const svc = createScopedServices(ctxOf('member', ME, ORG), {
      repositories: repos,
      logger: silent(),
      fileStorage: storage,
    })
    await expect(svc.files.mintSignedUrl(file.id)).rejects.toMatchObject({ code: 'not_found' })
    expect(storage.signedFor).toHaveLength(0)
  })

  it('audits the read', async () => {
    const file = makeFile()
    const { repos } = makeRepos({ note: makeNote(), file })
    const storage = makeFakeStorage()
    const svc = createScopedServices(ctxOf('member'), {
      repositories: repos,
      logger: silent(),
      fileStorage: storage,
    })
    await svc.files.mintSignedUrl(file.id)
    expect(repos.auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'file.read', entityId: file.id }),
    )
  })

  it('logs permission.denied when blocked', async () => {
    const note = makeNote({ authorId: SOMEONE, visibility: 'private' })
    const file = makeFile({ uploaderId: SOMEONE })
    const records: LogRecord[] = []
    const log = createLogger({ sink: (r) => records.push(r), minLevel: 'trace' })
    const { repos } = makeRepos({ note, file })
    const storage = makeFakeStorage()
    const svc = createScopedServices(ctxOf('member', ME, ORG), {
      repositories: repos,
      logger: log,
      fileStorage: storage,
    })
    await svc.files.mintSignedUrl(file.id).catch(() => undefined)
    expect(records.some((r) => r.event === 'permission.denied')).toBe(true)
  })
})

describe('remove', () => {
  it('soft-deletes the row and removes bytes for the author', async () => {
    const file = makeFile()
    const { repos } = makeRepos({ note: makeNote(), file })
    const storage = makeFakeStorage()
    const svc = createScopedServices(ctxOf('member'), {
      repositories: repos,
      logger: silent(),
      fileStorage: storage,
    })
    await svc.files.remove(file.id)
    expect(storage.removed).toContain(file.storagePath)
    expect(repos.files.softDelete).toHaveBeenCalledWith(file.id)
    expect(repos.auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'file.deleted' }),
    )
  })

  it("denies remove from non-author non-admin", async () => {
    const note = makeNote({ authorId: SOMEONE })
    const file = makeFile({ uploaderId: SOMEONE })
    const { repos } = makeRepos({ note, file })
    const storage = makeFakeStorage()
    const svc = createScopedServices(ctxOf('member', ME, ORG), {
      repositories: repos,
      logger: silent(),
      fileStorage: storage,
    })
    await expect(svc.files.remove(file.id)).rejects.toMatchObject({ code: 'not_found' })
    expect(storage.removed).toHaveLength(0)
    expect(repos.files.softDelete).not.toHaveBeenCalled()
  })

  it('still soft-deletes the row when storage.remove fails', async () => {
    const file = makeFile()
    const { repos } = makeRepos({ note: makeNote(), file })
    const storage: FileStorage = {
      upload: vi.fn(),
      remove: vi.fn(async () => {
        throw new Error('storage 500')
      }),
      createSignedUrl: vi.fn(),
    }
    const svc = createScopedServices(ctxOf('member'), {
      repositories: repos,
      logger: silent(),
      fileStorage: storage,
    })
    await svc.files.remove(file.id)
    expect(repos.files.softDelete).toHaveBeenCalled()
  })
})

describe('listVisible / listForNote', () => {
  it('listForNote returns nothing if the caller cannot read the note', async () => {
    const note = makeNote({ authorId: SOMEONE, visibility: 'private' })
    const file = makeFile({ uploaderId: SOMEONE })
    const { repos } = makeRepos({ note, file, files: [file] })
    const storage = makeFakeStorage()
    const svc = createScopedServices(ctxOf('member', ME, ORG), {
      repositories: repos,
      logger: silent(),
      fileStorage: storage,
    })
    expect(await svc.files.listForNote(note.id)).toEqual([])
  })

  it("listVisible filters out files whose parent note is private to someone else", async () => {
    const myNote = makeNote({ id: 'n-mine', authorId: ME, visibility: 'org' })
    const theirNote = makeNote({
      id: 'n-theirs',
      authorId: SOMEONE,
      visibility: 'private',
    })
    const myFile = makeFile({ id: 'f-mine', noteId: 'n-mine' })
    const theirFile = makeFile({
      id: 'f-theirs',
      noteId: 'n-theirs',
      uploaderId: SOMEONE,
      storagePath: 'org/org-A/note/n-theirs/f-theirs-x.png',
    })
    const repos: Repositories = makeRepos({ files: [myFile, theirFile] }).repos
    // Custom multi-note resolver.
    repos.notes.findById = vi.fn(async (id: string) => {
      if (id === myNote.id) return myNote
      if (id === theirNote.id) return theirNote
      return null
    })
    repos.files.listForOrg = vi.fn(async () => [myFile, theirFile])
    const storage = makeFakeStorage()
    const svc = createScopedServices(ctxOf('member', ME, ORG), {
      repositories: repos,
      logger: silent(),
      fileStorage: storage,
    })
    const visible = await svc.files.listVisible()
    const ids = visible.map((f) => f.id)
    expect(ids).toContain('f-mine')
    expect(ids).not.toContain('f-theirs')
  })
})
