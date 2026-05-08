import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { makeTestDb, type TestDb, seedAuthFixtures } from '../tests/helpers/pglite-db'
import { getActiveMembershipFromDb } from './auth-context'

let db: TestDb
let close: () => Promise<void>

const ORG_X = '11111111-1111-1111-1111-111111111111'
const ORG_Y = '22222222-2222-2222-2222-222222222222'
const ORG_Z = '33333333-3333-3333-3333-333333333333'
const USER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const USER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const USER_NEW = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

beforeAll(async () => {
  const made = await makeTestDb()
  db = made.db
  close = made.close

  await seedAuthFixtures(db, {
    organizations: [
      { id: ORG_X, slug: 'x', name: 'X' },
      { id: ORG_Y, slug: 'y', name: 'Y' },
      { id: ORG_Z, slug: 'z', name: 'Z' },
    ],
    users: [
      { id: USER_A, email: 'a@example.com' },
      { id: USER_B, email: 'b@example.com' },
      { id: USER_NEW, email: 'new@example.com' },
    ],
    // USER_A in X (oldest) and Y, USER_B in Y (member), USER_NEW has no memberships.
    memberships: [
      { orgId: ORG_X, userId: USER_A, role: 'admin', createdAt: new Date('2026-01-01') },
      { orgId: ORG_Y, userId: USER_A, role: 'member', createdAt: new Date('2026-02-01') },
      { orgId: ORG_Y, userId: USER_B, role: 'viewer', createdAt: new Date('2026-01-15') },
    ],
  })
})

afterAll(async () => {
  await close()
})

describe('getActiveMembershipFromDb', () => {
  it('returns null for a user with zero memberships', async () => {
    const result = await getActiveMembershipFromDb(USER_NEW, undefined, db as never)
    expect(result).toBeNull()
  })

  it('returns the requested org membership when the user is a member', async () => {
    const result = await getActiveMembershipFromDb(USER_A, ORG_Y, db as never)
    expect(result).toEqual({ orgId: ORG_Y, role: 'member' })
  })

  it('falls back to default (oldest) membership when requested org is not a member of', async () => {
    // USER_A is NOT in ORG_Z; cookie pointing at Z must NOT grant access.
    const result = await getActiveMembershipFromDb(USER_A, ORG_Z, db as never)
    expect(result).toEqual({ orgId: ORG_X, role: 'admin' })
  })

  it('returns the default oldest membership when no hint is given', async () => {
    const result = await getActiveMembershipFromDb(USER_A, undefined, db as never)
    expect(result?.orgId).toBe(ORG_X)
  })

  it('does not leak another orgs role through cross-user requests', async () => {
    // USER_B is only in ORG_Y. Attempt to request ORG_X (where USER_A is admin).
    const result = await getActiveMembershipFromDb(USER_B, ORG_X, db as never)
    // Falls back to USER_B's default — ORG_Y, role viewer. Never USER_A's admin in X.
    expect(result).toEqual({ orgId: ORG_Y, role: 'viewer' })
  })
})
