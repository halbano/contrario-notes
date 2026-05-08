import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { makeTestDb, type TestDb } from './helpers/pglite-db'
import { createScopedServices } from '@/services'
import { createLogger } from '@/logging'
import type { RequestContext } from '@/lib/request-context'
import { memberships, organizations, users } from '@/db/schema'
import { eq, and } from 'drizzle-orm'

/**
 * Auth-flow tenant-isolation tests.
 *
 * Verifies that the auth-agent's surfaces do not leak across orgs:
 *
 *   - Cross-org membership lookup (user A in org X cannot list memberships
 *     of org Y).
 *   - Switch attempt to a non-member org → not_found (404).
 *   - Creating an org does not grant access to any *other* org.
 *
 * The don't-leak-existence rule for password reset is asserted in
 * `features/auth/server/auth-server.test.ts` (no DB needed there).
 */

let db: TestDb
let close: () => Promise<void>
const silent = createLogger({ sink: () => undefined, minLevel: 'error' })

const ORG_X = '11111111-1111-1111-1111-111111111111'
const ORG_Y = '22222222-2222-2222-2222-222222222222'
const ORG_Z_FOREIGN = '33333333-3333-3333-3333-333333333333'
const USER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const USER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

const ctxAinX: RequestContext = Object.freeze({
  userId: USER_A,
  orgId: ORG_X,
  role: 'admin',
})
const ctxBinY: RequestContext = Object.freeze({
  userId: USER_B,
  orgId: ORG_Y,
  role: 'admin',
})

beforeAll(async () => {
  const made = await makeTestDb()
  db = made.db
  close = made.close

  await db.insert(organizations).values([
    { id: ORG_X, slug: 'x', name: 'X' },
    { id: ORG_Y, slug: 'y', name: 'Y' },
    { id: ORG_Z_FOREIGN, slug: 'z', name: 'Z (no membership)' },
  ])
  await db.insert(users).values([
    { id: USER_A, email: 'a@example.com' },
    { id: USER_B, email: 'b@example.com' },
  ])
  await db.insert(memberships).values([
    { orgId: ORG_X, userId: USER_A, role: 'admin' },
    { orgId: ORG_Y, userId: USER_B, role: 'admin' },
    // Add USER_A to ORG_Y as a viewer to make sure listings are scoped to ctx, not user.
    { orgId: ORG_Y, userId: USER_A, role: 'viewer' },
  ])
})

afterAll(async () => {
  await close()
})

describe('auth-flow tenant isolation — memberships', () => {
  it('listMemberships in org X never returns memberships of org Y', async () => {
    const services = createScopedServices(ctxAinX, { db: db as never, logger: silent })
    const memberships = await services.orgs.listMemberships()
    expect(memberships.length).toBeGreaterThan(0)
    expect(memberships.every((m) => m.orgId === ORG_X)).toBe(true)
    expect(memberships.some((m) => m.orgId === ORG_Y)).toBe(false)
  })

  it('listMemberships in org Y is independent and exhaustive for that org', async () => {
    const services = createScopedServices(ctxBinY, { db: db as never, logger: silent })
    const result = await services.orgs.listMemberships()
    expect(result.length).toBeGreaterThanOrEqual(2) // USER_A (viewer) + USER_B (admin)
    expect(result.every((m) => m.orgId === ORG_Y)).toBe(true)
  })
})

describe('auth-flow tenant isolation — org switch', () => {
  it('switch attempt to a non-member org throws not_found (404)', async () => {
    const services = createScopedServices(ctxAinX, { db: db as never, logger: silent })
    await expect(
      services.orgs.validateOrgSwitch(ORG_Z_FOREIGN),
    ).rejects.toMatchObject({ code: 'not_found' })
  })

  it('switch attempt to a member org returns the role from THAT org', async () => {
    // USER_A is admin in X but viewer in Y. Switch should yield viewer.
    const services = createScopedServices(ctxAinX, { db: db as never, logger: silent })
    const out = await services.orgs.validateOrgSwitch(ORG_Y)
    expect(out).toEqual({ orgId: ORG_Y, role: 'viewer' })
  })
})

describe('auth-flow tenant isolation — org create', () => {
  it('createOrg adds an admin membership ONLY for the creator and ONLY in the new org', async () => {
    const services = createScopedServices(ctxAinX, { db: db as never, logger: silent })
    const newOrg = await services.orgs.createOrg({
      slug: 'fresh-org',
      name: 'Fresh Org',
    })

    // USER_B was not auto-added.
    const otherUserMembership = await db
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.orgId, newOrg.id),
          eq(memberships.userId, USER_B),
        )!,
      )
    expect(otherUserMembership.length).toBe(0)

    // USER_A's existing membership in ORG_X is unchanged.
    const xMemberships = await db
      .select()
      .from(memberships)
      .where(
        and(eq(memberships.orgId, ORG_X), eq(memberships.userId, USER_A))!,
      )
    expect(xMemberships.length).toBe(1)
    expect(xMemberships[0]?.role).toBe('admin')

    // USER_A IS admin of new org.
    const newMembership = await db
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.orgId, newOrg.id),
          eq(memberships.userId, USER_A),
        )!,
      )
    expect(newMembership.length).toBe(1)
    expect(newMembership[0]?.role).toBe('admin')
  })
})
