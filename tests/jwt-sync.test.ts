import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { createScopedServices } from '@/services'
import {
  resetOrgsServiceJwtSyncForTests,
  setOrgsServiceJwtSyncForTests,
} from '@/services/orgs-service'
import { syncUserOrgIds } from '@/features/auth/server/jwt-sync'
import { createLogger } from '@/logging'
import type { RequestContext } from '@/lib/request-context'
import { memberships, organizations, users } from '@/db/schema'
import { eq } from 'drizzle-orm'

import { makeTestDb, type TestDb } from './helpers/pglite-db'

/**
 * DR-PROD-01 — end-to-end JWT-sync wiring exercised through the service.
 *
 * Real RLS verification requires a real Supabase project; this test stops
 * at the boundary of the Supabase admin client (mocked) and asserts that
 * the orgs-service calls into the JWT-sync helpers with the right user id
 * at the right moment, AND that the helpers themselves write the merged
 * `app_metadata.org_ids` payload computed from the real (pglite-backed)
 * memberships table.
 */

const ORG_A = '11111111-1111-1111-1111-111111111111'
const ORG_B = '22222222-2222-2222-2222-222222222222'
const USER_ADMIN = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const USER_TARGET = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

let db: TestDb
let close: () => Promise<void>
const silent = createLogger({ sink: () => undefined, minLevel: 'error' })

type AdminMock = ReturnType<typeof makeAdmin>
function makeAdmin(initialOrgIds: Record<string, string[]> = {}) {
  // Each user starts with the seeded org_ids (or empty if absent).
  const state: Record<string, { org_ids: string[]; provider: string }> = {}
  for (const [uid, ids] of Object.entries(initialOrgIds)) {
    state[uid] = { org_ids: [...ids], provider: 'email' }
  }
  const getUserById = vi.fn(async (uid: string) => ({
    data: {
      user: {
        id: uid,
        app_metadata: state[uid] ?? { provider: 'email' },
      },
    },
    error: null,
  }))
  const updateUserById = vi.fn(async (
    uid: string,
    payload: { app_metadata: { org_ids: string[]; provider?: string } },
  ) => {
    state[uid] = {
      provider: payload.app_metadata.provider ?? state[uid]?.provider ?? 'email',
      org_ids: payload.app_metadata.org_ids,
    }
    return { data: { user: null }, error: null }
  })
  const signOut = vi.fn(async () => ({ error: null }))
  return {
    state,
    auth: {
      admin: { getUserById, updateUserById, signOut },
    },
    spies: { getUserById, updateUserById, signOut },
  }
}

let adminMock: AdminMock

const ctxAdminInA: RequestContext = Object.freeze({
  userId: USER_ADMIN,
  orgId: ORG_A,
  role: 'admin',
})

beforeAll(async () => {
  const made = await makeTestDb()
  db = made.db
  close = made.close

  await db.insert(organizations).values([
    { id: ORG_A, slug: 'org-a', name: 'Org A' },
    { id: ORG_B, slug: 'org-b', name: 'Org B' },
  ])
  await db.insert(users).values([
    { id: USER_ADMIN, email: 'admin@example.com' },
    { id: USER_TARGET, email: 'target@example.com' },
  ])
  // ADMIN owns A; TARGET starts in A only (so addMember can put them in B).
  await db.insert(memberships).values([
    { orgId: ORG_A, userId: USER_ADMIN, role: 'admin' },
    { orgId: ORG_B, userId: USER_ADMIN, role: 'admin' },
    { orgId: ORG_A, userId: USER_TARGET, role: 'member' },
  ])
})

afterAll(async () => {
  resetOrgsServiceJwtSyncForTests()
  await close()
})

beforeEach(() => {
  adminMock = makeAdmin({ [USER_TARGET]: [ORG_A] })
  // Re-route the service's syncUserOrgIds + signOutUserGlobally so the
  // pglite db handle and our mocked admin are used end-to-end.
  setOrgsServiceJwtSyncForTests({
    syncUserOrgIds: ((uid: string, log: typeof silent) =>
      syncUserOrgIds(uid, log, {
        db: db as never,
        admin: adminMock as never,
      })) as never,
    signOutUserGlobally: (async (uid: string) => {
      await (adminMock.auth.admin.signOut as unknown as (
        u: string,
        scope: string,
      ) => Promise<{ error: null }>)(uid, 'global')
    }) as never,
  })
})

describe('DR-PROD-01 — end-to-end through orgs-service', () => {
  it('addMember updates org_ids to include both A and B', async () => {
    const services = createScopedServices(ctxAdminInA, {
      db: db as never,
      logger: silent,
    })
    // ORG_B's ctx for the call (admin is admin of B too — see seed).
    const ctxAdminInB: RequestContext = Object.freeze({
      userId: USER_ADMIN,
      orgId: ORG_B,
      role: 'admin',
    })
    const inB = createScopedServices(ctxAdminInB, {
      db: db as never,
      logger: silent,
    })
    await inB.orgs.addMember({ userId: USER_TARGET, role: 'member' })

    expect(adminMock.spies.updateUserById).toHaveBeenCalledOnce()
    const [uid, payload] = adminMock.spies.updateUserById.mock.calls[0] as unknown as [
      string,
      { app_metadata: { org_ids: string[] } },
    ]
    expect(uid).toBe(USER_TARGET)
    expect(new Set(payload.app_metadata.org_ids)).toEqual(new Set([ORG_A, ORG_B]))
    expect(adminMock.spies.signOut).not.toHaveBeenCalled()
    // Silence unused-var lint.
    void services
  })

  it('removeMember updates org_ids to drop A AND signs the user out globally', async () => {
    // Find the membership row for TARGET in A, then remove via the service.
    const targetMembership = (
      await db
        .select()
        .from(memberships)
        .where(eq(memberships.userId, USER_TARGET))
    ).find((m) => m.orgId === ORG_A)
    expect(targetMembership).toBeTruthy()

    const services = createScopedServices(ctxAdminInA, {
      db: db as never,
      logger: silent,
    })
    await services.orgs.removeMember(targetMembership!.id)

    // The sync was called with the removed user.
    expect(adminMock.spies.updateUserById).toHaveBeenCalledOnce()
    const [uid, payload] = adminMock.spies.updateUserById.mock.calls[0] as unknown as [
      string,
      { app_metadata: { org_ids: string[] } },
    ]
    expect(uid).toBe(USER_TARGET)
    // Pre-add (this test runs after the previous one, but the seed only put
    // TARGET in ORG_A, and addMember in the prior test added them to ORG_B.
    // After removing from A, only B remains).
    expect(payload.app_metadata.org_ids).toEqual([ORG_B])

    // signOut MUST have been called for the removed user, scope=global.
    expect(adminMock.spies.signOut).toHaveBeenCalledOnce()
    expect(adminMock.spies.signOut).toHaveBeenCalledWith(USER_TARGET, 'global')

    // Order: sync (updateUserById) before signOut.
    const updOrder = adminMock.spies.updateUserById.mock.invocationCallOrder[0]!
    const soOrder = adminMock.spies.signOut.mock.invocationCallOrder[0]!
    expect(updOrder).toBeLessThan(soOrder)
  })

  it('the existing app_metadata claims (provider, providers) survive the sync', async () => {
    // Seed the admin mock with a richer initial app_metadata for TARGET.
    adminMock = makeAdmin({})
    adminMock.state[USER_TARGET] = {
      org_ids: [ORG_A],
      provider: 'google',
    }
    setOrgsServiceJwtSyncForTests({
      syncUserOrgIds: ((uid: string, log: typeof silent) =>
        syncUserOrgIds(uid, log, {
          db: db as never,
          admin: adminMock as never,
        })) as never,
      signOutUserGlobally: (async (uid: string) => {
        await (adminMock.auth.admin.signOut as unknown as (
          u: string,
          scope: string,
        ) => Promise<{ error: null }>)(uid, 'global')
      }) as never,
    })

    // Add TARGET back to ORG_A so we have something to sync.
    const ctxAdminInB: RequestContext = Object.freeze({
      userId: USER_ADMIN,
      orgId: ORG_A,
      role: 'admin',
    })
    const inA = createScopedServices(ctxAdminInB, {
      db: db as never,
      logger: silent,
    })
    await inA.orgs.addMember({ userId: USER_TARGET, role: 'member' })

    // The mock's getUserById returned the existing { org_ids, provider }.
    // The updateUserById payload must preserve `provider: 'google'`.
    const [, payload] = adminMock.spies.updateUserById.mock.calls[0] as unknown as [
      string,
      { app_metadata: { provider?: string; org_ids: string[] } },
    ]
    expect(payload.app_metadata.provider).toBe('google')
    expect(new Set(payload.app_metadata.org_ids)).toEqual(new Set([ORG_A, ORG_B]))
  })
})
