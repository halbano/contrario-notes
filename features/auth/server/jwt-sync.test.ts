import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'

import { signOutUserGlobally, syncUserOrgIds } from './jwt-sync'
import { createLogger, type LogRecord } from '@/logging'
import { makeTestDb, type TestDb } from '@/tests/helpers/pglite-db'
import {
  memberships,
  organizations,
  users,
} from '@/db/schema'

const ORG_X = '11111111-1111-1111-1111-111111111111'
const ORG_Y = '22222222-2222-2222-2222-222222222222'
const USER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const USER_GHOST = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

let db: TestDb
let close: () => Promise<void>

beforeAll(async () => {
  const made = await makeTestDb()
  db = made.db
  close = made.close

  await db.insert(organizations).values([
    { id: ORG_X, slug: 'x', name: 'Org X' },
    { id: ORG_Y, slug: 'y', name: 'Org Y' },
  ])
  await db.insert(users).values([
    { id: USER_A, email: 'a@example.com' },
  ])
  await db.insert(memberships).values([
    { orgId: ORG_X, userId: USER_A, role: 'admin' },
    { orgId: ORG_Y, userId: USER_A, role: 'member' },
  ])
})

afterAll(async () => {
  await close()
})

function makeAdmin(opts: {
  appMetadata?: Record<string, unknown>
  getError?: { message: string } | null
  updateError?: { message: string } | null
  signOutError?: { message: string } | null
} = {}) {
  const getById = vi.fn(async () => {
    if (opts.getError) return { data: { user: null }, error: opts.getError }
    return {
      data: {
        user: {
          id: USER_A,
          app_metadata: opts.appMetadata ?? { provider: 'email', providers: ['email'] },
        },
      },
      error: null,
    }
  })
  const updateById = vi.fn(async () => ({
    data: { user: null },
    error: opts.updateError ?? null,
  }))
  const signOut = vi.fn(async () => ({
    error: opts.signOutError ?? null,
  }))
  return {
    auth: {
      admin: {
        getUserById: getById,
        updateUserById: updateById,
        signOut,
      },
    },
    _spies: { getById, updateById, signOut },
  }
}

function silentLogger() {
  return createLogger({ sink: () => undefined, minLevel: 'error' })
}

describe('syncUserOrgIds', () => {
  it('reads memberships, then merges org_ids into existing app_metadata', async () => {
    const admin = makeAdmin({
      appMetadata: { provider: 'email', providers: ['email'], custom: 'keep-me' },
    })
    const out = await syncUserOrgIds(USER_A, silentLogger(), {
      db: db as never,
      admin: admin as never,
    })

    expect(new Set(out.orgIds)).toEqual(new Set([ORG_X, ORG_Y]))

    // get → update sequence
    expect(admin._spies.getById).toHaveBeenCalledOnce()
    expect(admin._spies.getById).toHaveBeenCalledWith(USER_A)
    expect(admin._spies.updateById).toHaveBeenCalledOnce()

    const call = admin._spies.updateById.mock.calls[0] as unknown as [
      string,
      { app_metadata: Record<string, unknown> & { org_ids: string[] } },
    ]
    expect(call[0]).toBe(USER_A)
    const payload = call[1]
    // Existing claims preserved; org_ids set; nothing else dropped.
    expect(payload.app_metadata).toMatchObject({
      provider: 'email',
      providers: ['email'],
      custom: 'keep-me',
    })
    expect(new Set(payload.app_metadata.org_ids)).toEqual(new Set([ORG_X, ORG_Y]))
  })

  it('emits auth.jwt_synced on success with the right org count', async () => {
    const records: LogRecord[] = []
    const log = createLogger({ sink: (r) => records.push(r), minLevel: 'trace' })
    const admin = makeAdmin()
    await syncUserOrgIds(USER_A, log, { db, admin: admin as never })
    const synced = records.find((r) => r.event === 'auth.jwt_synced')
    expect(synced).toBeTruthy()
    expect(synced?.context.orgCount).toBe(2)
  })

  it('writes an empty array when the user has no memberships', async () => {
    const admin = makeAdmin()
    const out = await syncUserOrgIds(USER_GHOST, silentLogger(), {
      db: db as never,
      admin: admin as never,
    })
    expect(out.orgIds).toEqual([])
    const call = admin._spies.updateById.mock.calls[0] as unknown as [
      string,
      { app_metadata: { org_ids: string[] } },
    ]
    expect(call[1].app_metadata.org_ids).toEqual([])
  })

  it('throws and logs auth.jwt_sync_failed when getUserById fails', async () => {
    const records: LogRecord[] = []
    const log = createLogger({ sink: (r) => records.push(r), minLevel: 'trace' })
    const admin = makeAdmin({ getError: { message: 'auth backend down' } })
    await expect(
      syncUserOrgIds(USER_A, log, { db, admin: admin as never }),
    ).rejects.toThrow(/cannot read user/)
    expect(records.some((r) => r.event === 'auth.jwt_sync_failed')).toBe(true)
    expect(admin._spies.updateById).not.toHaveBeenCalled()
  })

  it('throws and logs auth.jwt_sync_failed when updateUserById fails', async () => {
    const records: LogRecord[] = []
    const log = createLogger({ sink: (r) => records.push(r), minLevel: 'trace' })
    const admin = makeAdmin({ updateError: { message: 'rate limited' } })
    await expect(
      syncUserOrgIds(USER_A, log, { db, admin: admin as never }),
    ).rejects.toThrow(/cannot update user/)
    expect(records.some((r) => r.event === 'auth.jwt_sync_failed')).toBe(true)
  })

  it('reflects current memberships after a row is removed', async () => {
    // Remove ORG_Y for USER_A, sync again, expect [ORG_X] only.
    const admin = makeAdmin()
    await db
      .delete(memberships)
      .where(eq(memberships.userId, USER_A))
    await db.insert(memberships).values([
      { orgId: ORG_X, userId: USER_A, role: 'admin' },
    ])
    const out = await syncUserOrgIds(USER_A, silentLogger(), {
      db: db as never,
      admin: admin as never,
    })
    expect(out.orgIds).toEqual([ORG_X])
  })
})

describe('signOutUserGlobally', () => {
  it('calls admin.signOut(userId, "global") and emits a sync log', async () => {
    const records: LogRecord[] = []
    const log = createLogger({ sink: (r) => records.push(r), minLevel: 'trace' })
    const admin = makeAdmin()
    await signOutUserGlobally(USER_A, log, { admin: admin as never })
    expect(admin._spies.signOut).toHaveBeenCalledWith(USER_A, 'global')
    expect(records.some((r) => r.event === 'auth.jwt_synced')).toBe(true)
  })

  it('logs and swallows when signOut returns an error (does not throw)', async () => {
    const records: LogRecord[] = []
    const log = createLogger({ sink: (r) => records.push(r), minLevel: 'trace' })
    const admin = makeAdmin({ signOutError: { message: 'boom' } })
    await expect(
      signOutUserGlobally(USER_A, log, { admin: admin as never }),
    ).resolves.toBeUndefined()
    expect(records.some((r) => r.event === 'auth.jwt_sync_failed')).toBe(true)
  })
})
