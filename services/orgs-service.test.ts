import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createScopedServices } from './index'
import {
  resetOrgsServiceAdminClientForTests,
  resetOrgsServiceJwtSyncForTests,
  setOrgsServiceAdminClientForTests,
  setOrgsServiceJwtSyncForTests,
} from './orgs-service'
import type { DbMembership, DbOrganization } from '@/db/schema'
import type { RequestContext } from '@/lib/request-context'
import type { Repositories } from '@/repositories'
import { createLogger, type LogRecord } from '@/logging/logger'

const ORG = '00000000-0000-0000-0000-000000000001'
const NEW_ORG = '00000000-0000-0000-0000-000000000002'
const ME = '00000000-0000-0000-0000-0000000000aa'
const OTHER = '00000000-0000-0000-0000-0000000000bb'

function ctxOf(role: 'admin' | 'member' | 'viewer'): RequestContext {
  return Object.freeze({ userId: ME, orgId: ORG, role })
}

function org(overrides: Partial<DbOrganization> = {}): DbOrganization {
  return {
    id: NEW_ORG,
    slug: 'new-org',
    name: 'New Org',
    createdAt: new Date(),
    ...overrides,
  }
}

function membership(
  overrides: Partial<DbMembership> = {},
): DbMembership {
  return {
    id: 'm-1',
    orgId: ORG,
    userId: ME,
    role: 'member',
    createdAt: new Date(),
    ...overrides,
  }
}

function makeRepos(): Repositories {
  return {
    notes: {
      findById: vi.fn(),
      listRecent: vi.fn(),
      listVisible: vi.fn(),
      findVisibleByIds: vi.fn(async () => []),
      create: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
    },
    orgs: {
      current: vi.fn(async () => null),
      listForCurrentUser: vi.fn(async () => []),
      createWithAdmin: vi.fn(async ({ slug, name }) =>
        org({ id: NEW_ORG, slug, name }),
      ),
    },
    memberships: {
      listForCurrentOrg: vi.fn(async () => []),
      findForCurrentUser: vi.fn(async () => null),
      findForUserAndOrg: vi.fn(async () => null),
      add: vi.fn(async ({ userId, role }) =>
        membership({ userId, role, id: 'm-new' }),
      ),
      addIfMissing: vi.fn(async ({ userId, role }) =>
        membership({ userId, role, id: 'm-idem' }),
      ),
      updateRole: vi.fn(async (id, role) => membership({ id, role })),
      remove: vi.fn(async () => true),
      findById: vi.fn(async (id) => membership({ id })),
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
      findById: vi.fn(async () => null),
      listByNote: vi.fn(async () => []),
      listForOrg: vi.fn(async () => []),
      create: vi.fn(),
      hardDelete: vi.fn(async () => false),
      softDelete: vi.fn(async () => false),
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
}

let _silent: ReturnType<typeof createLogger> | undefined
function silent() {
  if (!_silent) _silent = createLogger({ sink: () => undefined, minLevel: 'error' })
  return _silent
}

let syncSpy: ReturnType<typeof vi.fn>
let signOutSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  _silent = undefined
  syncSpy = vi.fn(async () => ({ orgIds: [] }))
  signOutSpy = vi.fn(async () => undefined)
  setOrgsServiceJwtSyncForTests({
    syncUserOrgIds: syncSpy as never,
    signOutUserGlobally: signOutSpy as never,
  })
})

afterEach(() => {
  resetOrgsServiceJwtSyncForTests()
  resetOrgsServiceAdminClientForTests()
})

describe('orgs-service.createOrg', () => {
  it('creates an org and member can do it (role gate is open)', async () => {
    const repos = makeRepos()
    const svc = createScopedServices(ctxOf('member'), { repositories: repos, logger: silent() })
    const row = await svc.orgs.createOrg({ slug: 'team-alpha', name: 'Team Alpha' })
    expect(row.slug).toBe('team-alpha')
    expect(repos.orgs.createWithAdmin).toHaveBeenCalledWith({
      slug: 'team-alpha',
      name: 'Team Alpha',
    })
  })

  it('rejects invalid slug (uppercase)', async () => {
    const svc = createScopedServices(ctxOf('member'), { repositories: makeRepos(), logger: silent() })
    await expect(
      svc.orgs.createOrg({ slug: 'BadSlug', name: 'Some Name' }),
    ).rejects.toMatchObject({ code: 'invalid_input' })
  })

  it('rejects too-short slug', async () => {
    const svc = createScopedServices(ctxOf('member'), { repositories: makeRepos(), logger: silent() })
    await expect(
      svc.orgs.createOrg({ slug: 'a', name: 'Name' }),
    ).rejects.toMatchObject({ code: 'invalid_input' })
  })

  it('rejects too-short name', async () => {
    const svc = createScopedServices(ctxOf('member'), { repositories: makeRepos(), logger: silent() })
    await expect(
      svc.orgs.createOrg({ slug: 'okay', name: 'a' }),
    ).rejects.toMatchObject({ code: 'invalid_input' })
  })

  it('logs auth.org_created on success', async () => {
    const records: LogRecord[] = []
    const log = createLogger({ sink: (r) => records.push(r), minLevel: 'trace' })
    const repos = makeRepos()
    const svc = createScopedServices(ctxOf('member'), { repositories: repos, logger: log })
    await svc.orgs.createOrg({ slug: 'team-bravo', name: 'Team Bravo' })
    expect(records.some((r) => r.event === 'auth.org_created')).toBe(true)
  })
})

describe('orgs-service.validateOrgSwitch', () => {
  it('throws not_found (404) when the user is not a member of the target org', async () => {
    const records: LogRecord[] = []
    const log = createLogger({ sink: (r) => records.push(r), minLevel: 'trace' })
    const repos = makeRepos()
    repos.memberships.findForUserAndOrg = vi.fn(async () => null)
    const svc = createScopedServices(ctxOf('admin'), { repositories: repos, logger: log })
    await expect(svc.orgs.validateOrgSwitch(NEW_ORG)).rejects.toMatchObject({
      code: 'not_found',
    })
    expect(records.some((r) => r.event === 'auth.org_switch_denied')).toBe(true)
  })

  it('returns the membership role when the user is a member of the target org', async () => {
    const records: LogRecord[] = []
    const log = createLogger({ sink: (r) => records.push(r), minLevel: 'trace' })
    const repos = makeRepos()
    repos.memberships.findForUserAndOrg = vi.fn(async () => membership({ orgId: NEW_ORG, role: 'admin' }))
    const svc = createScopedServices(ctxOf('member'), { repositories: repos, logger: log })
    const out = await svc.orgs.validateOrgSwitch(NEW_ORG)
    expect(out).toEqual({ orgId: NEW_ORG, role: 'admin' })
    expect(records.some((r) => r.event === 'auth.org_switch')).toBe(true)
  })
})

describe('orgs-service membership management — admin gating', () => {
  it('member cannot addMember (404 surface)', async () => {
    const svc = createScopedServices(ctxOf('member'), { repositories: makeRepos(), logger: silent() })
    await expect(
      svc.orgs.addMember({ userId: OTHER, role: 'member' }),
    ).rejects.toMatchObject({ code: 'not_found' })
  })

  it('viewer cannot addMember', async () => {
    const svc = createScopedServices(ctxOf('viewer'), { repositories: makeRepos(), logger: silent() })
    await expect(
      svc.orgs.addMember({ userId: OTHER, role: 'member' }),
    ).rejects.toMatchObject({ code: 'not_found' })
  })

  it('admin can addMember and emits membership_changed log', async () => {
    const records: LogRecord[] = []
    const log = createLogger({ sink: (r) => records.push(r), minLevel: 'trace' })
    const repos = makeRepos()
    const svc = createScopedServices(ctxOf('admin'), { repositories: repos, logger: log })
    const row = await svc.orgs.addMember({ userId: OTHER, role: 'member' })
    expect(row.userId).toBe(OTHER)
    expect(records.some((r) => r.event === 'auth.membership_changed')).toBe(true)
  })

  it('member cannot changeRole', async () => {
    const svc = createScopedServices(ctxOf('member'), { repositories: makeRepos(), logger: silent() })
    await expect(svc.orgs.changeRole('m-1', 'admin')).rejects.toMatchObject({
      code: 'not_found',
    })
  })

  it('admin changeRole on missing membership → not_found', async () => {
    const repos = makeRepos()
    repos.memberships.updateRole = vi.fn(async () => null)
    const svc = createScopedServices(ctxOf('admin'), { repositories: repos, logger: silent() })
    await expect(svc.orgs.changeRole('does-not-exist', 'admin')).rejects.toMatchObject({
      code: 'not_found',
    })
  })

  it('admin can removeMember', async () => {
    const repos = makeRepos()
    const svc = createScopedServices(ctxOf('admin'), { repositories: repos, logger: silent() })
    await expect(svc.orgs.removeMember('m-1')).resolves.toBeUndefined()
    expect(repos.memberships.remove).toHaveBeenCalledWith('m-1')
  })

  it('member cannot removeMember', async () => {
    const svc = createScopedServices(ctxOf('member'), { repositories: makeRepos(), logger: silent() })
    await expect(svc.orgs.removeMember('m-1')).rejects.toMatchObject({
      code: 'not_found',
    })
  })

  it('removeMember on missing membership → not_found and no sync/signOut', async () => {
    const repos = makeRepos()
    repos.memberships.findById = vi.fn(async () => null)
    const svc = createScopedServices(ctxOf('admin'), { repositories: repos, logger: silent() })
    await expect(svc.orgs.removeMember('does-not-exist')).rejects.toMatchObject({
      code: 'not_found',
    })
    expect(syncSpy).not.toHaveBeenCalled()
    expect(signOutSpy).not.toHaveBeenCalled()
  })
})

// -----------------------------------------------------------------------------
// DR-PROD-01: JWT-sync wiring
// -----------------------------------------------------------------------------
describe('orgs-service — DR-PROD-01 JWT sync wiring', () => {
  it('createOrg syncs the creator after the membership row is written', async () => {
    const repos = makeRepos()
    const svc = createScopedServices(ctxOf('member'), { repositories: repos, logger: silent() })
    await svc.orgs.createOrg({ slug: 'team-c', name: 'Team C' })
    expect(syncSpy).toHaveBeenCalledOnce()
    expect(syncSpy).toHaveBeenCalledWith(ME, expect.anything())
    expect(signOutSpy).not.toHaveBeenCalled()
  })

  it('addMember syncs the TARGET user (not the caller)', async () => {
    const repos = makeRepos()
    const svc = createScopedServices(ctxOf('admin'), { repositories: repos, logger: silent() })
    await svc.orgs.addMember({ userId: OTHER, role: 'member' })
    expect(syncSpy).toHaveBeenCalledOnce()
    expect(syncSpy).toHaveBeenCalledWith(OTHER, expect.anything())
    expect(signOutSpy).not.toHaveBeenCalled()
  })

  it('changeRole does NOT sync (role-only change cannot affect org_ids)', async () => {
    const repos = makeRepos()
    const svc = createScopedServices(ctxOf('admin'), { repositories: repos, logger: silent() })
    await svc.orgs.changeRole('m-1', 'admin')
    expect(syncSpy).not.toHaveBeenCalled()
    expect(signOutSpy).not.toHaveBeenCalled()
  })

  it('removeMember syncs the removed user AND signs them out globally', async () => {
    const repos = makeRepos()
    repos.memberships.findById = vi.fn(async () => membership({ userId: OTHER }))
    repos.memberships.remove = vi.fn(async () => true)
    const svc = createScopedServices(ctxOf('admin'), { repositories: repos, logger: silent() })
    await svc.orgs.removeMember('m-1')
    expect(syncSpy).toHaveBeenCalledWith(OTHER, expect.anything())
    expect(signOutSpy).toHaveBeenCalledWith(OTHER, expect.anything())
    // Order: sync MUST run before signOut so the next sign-in finds the
    // refreshed claim already in place.
    const syncOrder = syncSpy.mock.invocationCallOrder[0]!
    const signOutOrder = signOutSpy.mock.invocationCallOrder[0]!
    expect(syncOrder).toBeLessThan(signOutOrder)
  })
})

// -----------------------------------------------------------------------------
// VAL-18: invite-by-email
// -----------------------------------------------------------------------------
function makeAdminMock(opts: {
  inviteResult?: { data: { user: { id: string } } | null; error: { message: string } | null }
} = {}) {
  const invite = vi.fn(async () =>
    opts.inviteResult ?? {
      data: { user: { id: '00000000-0000-0000-0000-000000000099' } },
      error: null,
    },
  )
  return {
    invite,
    getter: () =>
      ({
        auth: {
          admin: {
            inviteUserByEmail: invite,
          },
        },
      }) as never,
  }
}

describe('orgs-service.inviteByEmail — existing user branch', () => {
  it('admin invites an existing user → membership added + JWT synced (target user)', async () => {
    const repos = makeRepos()
    repos.users.findByEmail = vi.fn(async () => ({
      id: OTHER,
      email: 'other@example.com',
      displayName: null,
      createdAt: new Date(),
    }))
    repos.memberships.findForUserAndOrg = vi.fn(async () => null)
    const { invite, getter } = makeAdminMock()
    setOrgsServiceAdminClientForTests(getter)
    const svc = createScopedServices(ctxOf('admin'), {
      repositories: repos,
      logger: silent(),
    })
    const result = await svc.orgs.inviteByEmail({
      email: 'other@example.com',
      role: 'member',
    })
    expect(result).toMatchObject({ status: 'added', userId: OTHER })
    expect(repos.memberships.add).toHaveBeenCalledWith({
      userId: OTHER,
      role: 'member',
    })
    expect(syncSpy).toHaveBeenCalledWith(OTHER, expect.anything())
    expect(invite).not.toHaveBeenCalled()
  })

  it('returns already_member when the existing user is already in the current org', async () => {
    const repos = makeRepos()
    repos.users.findByEmail = vi.fn(async () => ({
      id: OTHER,
      email: 'other@example.com',
      displayName: null,
      createdAt: new Date(),
    }))
    repos.memberships.findForUserAndOrg = vi.fn(async () =>
      membership({ userId: OTHER, role: 'member' }),
    )
    const svc = createScopedServices(ctxOf('admin'), {
      repositories: repos,
      logger: silent(),
    })
    const result = await svc.orgs.inviteByEmail({
      email: 'OTHER@example.com',
      role: 'member',
    })
    expect(result).toMatchObject({ status: 'already_member', userId: OTHER })
    expect(repos.memberships.add).not.toHaveBeenCalled()
    expect(syncSpy).not.toHaveBeenCalled()
  })
})

describe('orgs-service.inviteByEmail — new-user (Supabase invite) branch', () => {
  it('calls Supabase admin.inviteUserByEmail with org+role metadata and upserts the user mirror', async () => {
    const repos = makeRepos()
    repos.users.findByEmail = vi.fn(async () => null)
    const newUserId = '00000000-0000-0000-0000-0000000000cc'
    const { invite, getter } = makeAdminMock({
      inviteResult: { data: { user: { id: newUserId } }, error: null },
    })
    setOrgsServiceAdminClientForTests(getter)
    const svc = createScopedServices(ctxOf('admin'), {
      repositories: repos,
      logger: silent(),
    })
    const result = await svc.orgs.inviteByEmail({
      email: 'newcomer@example.com',
      role: 'admin',
    })
    expect(result).toEqual({ status: 'invited', userId: newUserId })
    expect(invite).toHaveBeenCalledTimes(1)
    const [email, options] = invite.mock.calls[0] as unknown as [
      string,
      { data?: Record<string, unknown> },
    ]
    expect(email).toBe('newcomer@example.com')
    expect(options.data).toMatchObject({
      invited_org_id: ORG,
      invited_role: 'admin',
      invited_by: ME,
    })
    expect(repos.users.upsertMirror).toHaveBeenCalledWith({
      id: newUserId,
      email: 'newcomer@example.com',
    })
    // No membership row written until the user accepts.
    expect(repos.memberships.add).not.toHaveBeenCalled()
  })

  it('translates a Supabase admin failure into AppError(internal) without leaking the underlying message', async () => {
    const repos = makeRepos()
    repos.users.findByEmail = vi.fn(async () => null)
    const { getter } = makeAdminMock({
      inviteResult: {
        data: null,
        error: { message: 'rate limit hit (smtp)' },
      },
    })
    setOrgsServiceAdminClientForTests(getter)
    const svc = createScopedServices(ctxOf('admin'), {
      repositories: repos,
      logger: silent(),
    })
    await expect(
      svc.orgs.inviteByEmail({
        email: 'newcomer@example.com',
        role: 'member',
      }),
    ).rejects.toMatchObject({ code: 'internal' })
  })
})

describe('orgs-service.inviteByEmail — gating & validation', () => {
  it('non-admin caller gets not_found (existence non-disclosure)', async () => {
    const svc = createScopedServices(ctxOf('member'), {
      repositories: makeRepos(),
      logger: silent(),
    })
    await expect(
      svc.orgs.inviteByEmail({ email: 'x@example.com', role: 'member' }),
    ).rejects.toMatchObject({ code: 'not_found' })
  })

  it('rejects a malformed email with invalid_input', async () => {
    const svc = createScopedServices(ctxOf('admin'), {
      repositories: makeRepos(),
      logger: silent(),
    })
    await expect(
      svc.orgs.inviteByEmail({ email: 'not-an-email', role: 'member' }),
    ).rejects.toMatchObject({ code: 'invalid_input' })
  })

  it('rejects an unknown role with invalid_input', async () => {
    const svc = createScopedServices(ctxOf('admin'), {
      repositories: makeRepos(),
      logger: silent(),
    })
    await expect(
      svc.orgs.inviteByEmail({
        email: 'x@example.com',
        role: 'superuser' as never,
      }),
    ).rejects.toMatchObject({ code: 'invalid_input' })
  })
})
