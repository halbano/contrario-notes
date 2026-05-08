import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createScopedServices } from './index'
import type { DbNote } from '@/db/schema'
import type { RequestContext } from '@/lib/request-context'
import type { Repositories } from '@/repositories'
import { createLogger, type LogRecord } from '@/logging/logger'

const ORG = 'org-A'
const OTHER_ORG = 'org-B'
const ME = 'user-me'
const SOMEONE = 'user-other'

function makeNote(overrides: Partial<DbNote> = {}): DbNote {
  return {
    id: 'n-1',
    orgId: ORG,
    authorId: ME,
    title: 't',
    content: 'c',
    visibility: 'org',
    tagsText: '',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    ...overrides,
  }
}

function makeRepos(initialNote: DbNote | null) {
  let store: DbNote | null = initialNote
  const repos: Repositories = {
    notes: {
      findById: vi.fn(async (_id: string) => store),
      listRecent: vi.fn(async () => (store ? [store] : [])),
      listVisible: vi.fn(async () => (store ? [store] : [])),
      create: vi.fn(async (input) => {
        store = makeNote({ ...input, orgId: ORG, id: 'n-new' })
        return store
      }),
      update: vi.fn(async (_id, patch) => {
        if (!store) return null
        store = { ...store, ...patch, updatedAt: new Date() }
        return store
      }),
      softDelete: vi.fn(async () => {
        if (!store) return false
        store = { ...store, deletedAt: new Date() }
        return true
      }),
    },
    orgs: {
      current: vi.fn(async () => null),
      listForCurrentUser: vi.fn(async () => []),
      createWithAdmin: vi.fn(async () => {
        throw new Error('not used')
      }),
    },
    memberships: {
      listForCurrentOrg: vi.fn(async () => []),
      findForCurrentUser: vi.fn(async () => null),
      findForUserAndOrg: vi.fn(async () => null),
      add: vi.fn(async () => {
        throw new Error('not used')
      }),
      updateRole: vi.fn(async () => null),
      remove: vi.fn(async () => false),
    },
    noteVersions: {
      createVersion: vi.fn(async () => {
        throw new Error('not used in unit tests')
      }),
      listForNote: vi.fn(async () => []),
      findById: vi.fn(async () => null),
      findPair: vi.fn(async () => null),
    },
    tags: {
      listForOrg: vi.fn(async () => []),
      listForNote: vi.fn(async () => []),
      findOrCreateByName: vi.fn(async () => {
        throw new Error('not used')
      }),
      attachToNote: vi.fn(async () => {
        throw new Error('not used')
      }),
      detachFromNote: vi.fn(async () => false),
      setTagsForNote: vi.fn(async () => []),
    },
    noteShares: {
      listForNote: vi.fn(async () => []),
      listForNoteWithUsers: vi.fn(async () => []),
      listOrgMembersWithUsers: vi.fn(async () => []),
      grant: vi.fn(async () => {
        throw new Error('not used')
      }),
      revoke: vi.fn(async () => false),
      has: vi.fn(async () => false),
    },
    // The unit tests don't drive the transactional path; provide a stub
    // that simply runs the callback against the same fake handle.
    db: { transaction: async (fn: (tx: unknown) => unknown) => fn({}) } as never,
  }
  return { repos, peek: () => store }
}

function ctxOf(role: 'admin' | 'member' | 'viewer', userId = ME, orgId = ORG): RequestContext {
  return Object.freeze({ userId, orgId, role })
}

describe('createScopedServices().notes — read & permission', () => {
  it('returns a visible note', async () => {
    const { repos } = makeRepos(makeNote({ authorId: ME, visibility: 'org' }))
    const svc = createScopedServices(ctxOf('member'), { repositories: repos, logger: silentLogger() })
    const out = await svc.notes.findById('n-1')
    expect(out?.id).toBe('n-1')
  })

  it('returns null for a private note authored by another user (no existence disclosure)', async () => {
    const { repos } = makeRepos(makeNote({ authorId: SOMEONE, visibility: 'private' }))
    const svc = createScopedServices(ctxOf('member'), { repositories: repos, logger: silentLogger() })
    const out = await svc.notes.findById('n-1')
    expect(out).toBeNull()
  })
})

describe('createScopedServices().notes — create', () => {
  it('viewer cannot create', async () => {
    const { repos } = makeRepos(null)
    const svc = createScopedServices(ctxOf('viewer'), { repositories: repos, logger: silentLogger() })
    await expect(
      svc.notes.create({ authorId: ME, title: 't', content: 'c' }),
    ).rejects.toMatchObject({ code: 'permission_denied' })
    expect(repos.notes.create).not.toHaveBeenCalled()
  })

  it('member can create — service stamps ctx.userId as author', async () => {
    const { repos } = makeRepos(null)
    const svc = createScopedServices(ctxOf('member'), { repositories: repos, logger: silentLogger() })
    const row = await svc.notes.create({ authorId: 'will-be-overwritten', title: 't', content: 'c' })
    expect(row.authorId).toBe(ME)
    expect(repos.notes.create).toHaveBeenCalledWith(
      expect.objectContaining({ authorId: ME }),
    )
  })
})

describe('createScopedServices().notes — update / delete', () => {
  it('throws not_found when note is missing OR forbidden (404 surface)', async () => {
    const { repos } = makeRepos(makeNote({ authorId: SOMEONE, visibility: 'private' }))
    const svc = createScopedServices(ctxOf('member'), { repositories: repos, logger: silentLogger() })
    await expect(svc.notes.update('n-1', { title: 'x' })).rejects.toMatchObject({
      code: 'not_found',
    })
  })

  it('member can delete own note', async () => {
    const { repos } = makeRepos(makeNote({ authorId: ME, visibility: 'org' }))
    const svc = createScopedServices(ctxOf('member'), { repositories: repos, logger: silentLogger() })
    await expect(svc.notes.remove('n-1')).resolves.toBeUndefined()
    expect(repos.notes.softDelete).toHaveBeenCalled()
  })

  it('cross-org context never reaches the note (data isolation at service layer)', async () => {
    // Even if the underlying repo returned a foreign-org row by mistake,
    // the service must reject it via permissions.
    const { repos } = makeRepos(makeNote({ authorId: ME, orgId: OTHER_ORG, visibility: 'org' }))
    const svc = createScopedServices(ctxOf('member', ME, ORG), {
      repositories: repos,
      logger: silentLogger(),
    })
    expect(await svc.notes.findById('n-1')).toBeNull()
  })
})

describe('createScopedServices().notes — logging', () => {
  it('logs note.created on successful create', async () => {
    const records: LogRecord[] = []
    const log = createLogger({ sink: (r) => records.push(r), minLevel: 'trace' })
    const { repos } = makeRepos(null)
    const svc = createScopedServices(ctxOf('member'), { repositories: repos, logger: log })
    await svc.notes.create({ authorId: ME, title: 't', content: 'c' })
    expect(records.some((r) => r.event === 'note.created')).toBe(true)
  })

  it('logs permission.denied when an unauthorized user tries to create', async () => {
    const records: LogRecord[] = []
    const log = createLogger({ sink: (r) => records.push(r), minLevel: 'trace' })
    const { repos } = makeRepos(null)
    const svc = createScopedServices(ctxOf('viewer'), { repositories: repos, logger: log })
    await svc.notes
      .create({ authorId: ME, title: 't', content: 'c' })
      .catch(() => undefined)
    expect(records.some((r) => r.event === 'permission.denied')).toBe(true)
  })
})

let _silent: ReturnType<typeof createLogger> | undefined
function silentLogger() {
  if (!_silent) _silent = createLogger({ sink: () => undefined, minLevel: 'error' })
  return _silent
}

beforeEach(() => {
  _silent = undefined
})
