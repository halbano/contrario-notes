import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'

import { memberships, organizations, users } from '@/db/schema'
import { makeTestDb, type TestDb } from '@/tests/helpers/pglite-db'
import { createLogger } from '@/logging/logger'
import { createMembershipsRepository } from '@/repositories/memberships-repository'
import { createOrgsRepository } from '@/repositories/orgs-repository'
import {
  resolveAcceptInvite,
  type AcceptInviteDeps,
} from './accept-invite-handler'

const ORG = '00000000-0000-0000-0000-000000000001'
const MISSING_ORG = '00000000-0000-0000-0000-0000000000ff'
const USER_ID = '00000000-0000-0000-0000-0000000000aa'

let db: TestDb
let close: () => Promise<void>

beforeAll(async () => {
  const harness = await makeTestDb()
  db = harness.db
  close = harness.close
})

afterAll(async () => {
  await close()
})

beforeEach(async () => {
  // pglite is shared across tests in this file — clean the rows we touch.
  await db.delete(memberships)
  await db.delete(organizations)
  await db.delete(users)
  await db.insert(organizations).values({
    id: ORG,
    slug: 'team-a',
    name: 'Team A',
  })
  await db.insert(users).values({
    id: USER_ID,
    email: 'invitee@example.com',
  })
})

function userWith(metadata: Record<string, unknown>): User {
  return {
    id: USER_ID,
    app_metadata: {},
    user_metadata: metadata,
    aud: 'authenticated',
    email: 'invitee@example.com',
  } as unknown as User
}

function makeDeps(overrides: Partial<AcceptInviteDeps> = {}): AcceptInviteDeps & {
  updateUserById: ReturnType<typeof vi.fn>
  writeActiveOrgCookie: ReturnType<typeof vi.fn>
  syncUserOrgIds: ReturnType<typeof vi.fn>
} {
  const updateUserById = vi.fn(async () => ({ data: { user: {} }, error: null }))
  const writeActiveOrgCookie = vi.fn(async () => undefined)
  const syncUserOrgIds = vi.fn(async () => ({ orgIds: [] }))
  return {
    getUser: async () => null,
    getAdmin: () =>
      ({
        auth: { admin: { updateUserById } },
      }) as never,
    buildRepos: ((ctx) => ({
      memberships: createMembershipsRepository(ctx, db as never),
      orgs: createOrgsRepository(ctx, db as never),
    })) as AcceptInviteDeps['buildRepos'],
    writeActiveOrgCookie,
    syncUserOrgIds,
    logger: createLogger({ sink: () => undefined, minLevel: 'error' }),
    updateUserById,
    ...overrides,
  } as never
}

describe('accept-invite-handler', () => {
  it('redirects unauthenticated callers to /sign-in', async () => {
    const deps = makeDeps({ getUser: async () => null })
    const out = await resolveAcceptInvite(deps)
    expect(out).toEqual({ redirectTo: '/sign-in' })
  })

  it('redirects to /onboarding/create-org when invited_* metadata is absent', async () => {
    const deps = makeDeps({ getUser: async () => userWith({}) })
    const out = await resolveAcceptInvite(deps)
    expect(out).toEqual({ redirectTo: '/onboarding/create-org' })
    // No DB writes — membership table stays empty.
    const rows = await db.select().from(memberships)
    expect(rows).toHaveLength(0)
  })

  it('redirects to /onboarding/create-org when invited_role is not a known role', async () => {
    const deps = makeDeps({
      getUser: async () =>
        userWith({ invited_org_id: ORG, invited_role: 'superuser' }),
    })
    const out = await resolveAcceptInvite(deps)
    expect(out).toEqual({ redirectTo: '/onboarding/create-org' })
    const rows = await db.select().from(memberships)
    expect(rows).toHaveLength(0)
  })

  it('redirects to /onboarding/create-org when invited_org_id is not a UUID', async () => {
    const deps = makeDeps({
      getUser: async () =>
        userWith({ invited_org_id: 'not-a-uuid', invited_role: 'member' }),
    })
    const out = await resolveAcceptInvite(deps)
    expect(out).toEqual({ redirectTo: '/onboarding/create-org' })
  })

  it('redirects to /onboarding/create-org when the target org no longer exists', async () => {
    const deps = makeDeps({
      getUser: async () =>
        userWith({ invited_org_id: MISSING_ORG, invited_role: 'member' }),
    })
    const out = await resolveAcceptInvite(deps)
    expect(out).toEqual({ redirectTo: '/onboarding/create-org' })
    const rows = await db.select().from(memberships)
    expect(rows).toHaveLength(0)
  })

  it('happy path: inserts membership, syncs JWT, writes cookie, clears invited_* keys', async () => {
    const deps = makeDeps({
      getUser: async () =>
        userWith({
          invited_org_id: ORG,
          invited_role: 'member',
          invited_by: '00000000-0000-0000-0000-0000000000bb',
          some_other_claim: 'keep-me',
        }),
    })
    const out = await resolveAcceptInvite(deps)
    expect(out).toEqual({ redirectTo: '/', orgId: ORG })

    const rows = await db.select().from(memberships)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.orgId).toBe(ORG)
    expect(rows[0]?.userId).toBe(USER_ID)
    expect(rows[0]?.role).toBe('member')

    expect(deps.syncUserOrgIds).toHaveBeenCalledWith(USER_ID, expect.anything())
    expect(deps.writeActiveOrgCookie).toHaveBeenCalledWith(ORG)

    // Cleared invited_* keys; preserved unrelated metadata.
    expect(deps.updateUserById).toHaveBeenCalledTimes(1)
    const [updatedId, payload] = deps.updateUserById.mock.calls[0] as [
      string,
      { user_metadata: Record<string, unknown> },
    ]
    expect(updatedId).toBe(USER_ID)
    expect(payload.user_metadata).toEqual({ some_other_claim: 'keep-me' })
  })

  it('replaying the link is a no-op (ON CONFLICT DO NOTHING — no duplicate row)', async () => {
    const deps = makeDeps({
      getUser: async () =>
        userWith({ invited_org_id: ORG, invited_role: 'member' }),
    })
    await resolveAcceptInvite(deps)
    await resolveAcceptInvite(deps)
    const rows = await db.select().from(memberships)
    expect(rows).toHaveLength(1)
  })
})
