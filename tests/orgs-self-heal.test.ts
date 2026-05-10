/**
 * VAL-11 — `createOrgWithAdmin` self-heal coverage.
 *
 * The bug: `memberships.user_id` references `users.id`. If the `public.users`
 * mirror was wiped (dev `seed --reset` cascade leaves `auth.users`
 * orphaned), the membership insert FK-fails and the brand-new user is stuck
 * — no membership, no org, no path forward.
 *
 * The fix: when `createWithAdmin` is called from the first-org flow we pass
 * the user's email; the repo then runs
 * `INSERT INTO users (id, email) ... ON CONFLICT (id) DO NOTHING`
 * inside the same transaction, BEFORE the membership write.
 *
 * Tests use pglite (real Postgres semantics, including FK enforcement) — a
 * mocked `db` cannot reproduce the FK error, so a unit test against the
 * service layer would silently pass even if the fix were absent.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { makeTestDb, type TestDb } from './helpers/pglite-db'
import { createOrgsRepository } from '@/repositories/orgs-repository'
import { memberships, organizations, users } from '@/db/schema'
import type { RequestContext } from '@/lib/request-context'

const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'
const USER_EMAIL = 'orphan@example.com'

const ctx: RequestContext = Object.freeze({
  userId: USER_ID,
  // synthetic placeholder — createWithAdmin uses the brand-new org id for
  // the membership row, not ctx.orgId.
  orgId: '00000000-0000-0000-0000-000000000000',
  role: 'admin',
})

let db: TestDb
let close: () => Promise<void>

beforeAll(async () => {
  const made = await makeTestDb()
  db = made.db
  close = made.close
})

afterAll(async () => {
  await close()
})

beforeEach(async () => {
  // Clean slate per test — wipe in FK-safe order.
  await db.delete(memberships)
  await db.delete(organizations)
  await db.delete(users)
})

describe('VAL-11 — orgs-repository.createWithAdmin self-heal', () => {
  it('inserts the public.users mirror when missing and creates org + membership in one tx', async () => {
    // Precondition: orphan auth — no public.users row.
    const before = await db.select().from(users).where(eq(users.id, USER_ID))
    expect(before).toHaveLength(0)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repo = createOrgsRepository(ctx, db as any)
    const org = await repo.createWithAdmin({
      slug: 'orphan-org',
      name: 'Orphan Org',
      selfHealUserEmail: USER_EMAIL,
    })

    expect(org.slug).toBe('orphan-org')

    const userRows = await db.select().from(users).where(eq(users.id, USER_ID))
    expect(userRows).toHaveLength(1)
    expect(userRows[0]!.email).toBe(USER_EMAIL)

    const memberRows = await db
      .select()
      .from(memberships)
      .where(eq(memberships.userId, USER_ID))
    expect(memberRows).toHaveLength(1)
    expect(memberRows[0]!.orgId).toBe(org.id)
    expect(memberRows[0]!.role).toBe('admin')
  })

  it('is idempotent — existing public.users row is preserved (no overwrite, no error)', async () => {
    // Pre-existing mirror with a DIFFERENT email — on-conflict-do-nothing
    // must leave it intact (no upsert, no double-write).
    const ORIGINAL_EMAIL = 'real@example.com'
    await db.insert(users).values({ id: USER_ID, email: ORIGINAL_EMAIL })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repo = createOrgsRepository(ctx, db as any)
    await repo.createWithAdmin({
      slug: 'second-org',
      name: 'Second Org',
      selfHealUserEmail: 'should-not-overwrite@example.com',
    })

    const userRows = await db.select().from(users).where(eq(users.id, USER_ID))
    expect(userRows).toHaveLength(1)
    expect(userRows[0]!.email).toBe(ORIGINAL_EMAIL)
  })

  it('without selfHealUserEmail and missing mirror, the membership insert FK-fails (regression guard)', async () => {
    // This guards against accidentally turning the self-heal on for ALL
    // callers. The default path stays strict: no auto-mirror, FK enforced.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repo = createOrgsRepository(ctx, db as any)
    await expect(
      repo.createWithAdmin({ slug: 'strict-org', name: 'Strict Org' }),
    ).rejects.toThrow()

    // Transactional: org row should NOT exist if the membership FK-failed.
    const orgRows = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, 'strict-org'))
    expect(orgRows).toHaveLength(0)
  })

  it('healthy path — mirror present + selfHealUserEmail also present is a no-op for users', async () => {
    await db.insert(users).values({ id: USER_ID, email: USER_EMAIL })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repo = createOrgsRepository(ctx, db as any)
    const org = await repo.createWithAdmin({
      slug: 'healthy-org',
      name: 'Healthy Org',
      selfHealUserEmail: USER_EMAIL,
    })

    const userRows = await db.select().from(users).where(eq(users.id, USER_ID))
    expect(userRows).toHaveLength(1) // not duplicated
    const memberRows = await db
      .select()
      .from(memberships)
      .where(eq(memberships.orgId, org.id))
    expect(memberRows).toHaveLength(1)
  })
})

// -----------------------------------------------------------------------------
// VAL-11 plumbing: `createFirstOrgAction` must forward the Supabase user's
// email to the repo so the self-heal can run. A unit-style assertion that
// guards the wiring — the repo-layer test above proves the SQL semantics,
// this test proves the action calls it with the right shape.
// -----------------------------------------------------------------------------

import { vi } from 'vitest'

describe('VAL-11 — createFirstOrgAction forwards the Supabase email', () => {
  it('passes user.email as selfHealUserEmail to repo.createWithAdmin', async () => {
    vi.resetModules()

    const createWithAdmin = vi.fn(async ({ slug, name }: { slug: string; name: string }) => ({
      id: 'org-123',
      slug,
      name,
      createdAt: new Date(),
    }))

    vi.doMock('@/repositories/orgs-repository', () => ({
      createOrgsRepository: () => ({
        current: async () => null,
        listForCurrentUser: async () => [],
        createWithAdmin,
      }),
    }))
    vi.doMock('@/lib/supabase/server', () => ({
      createSupabaseServerClient: async () => ({
        auth: {
          getUser: async () => ({
            data: {
              user: { id: 'user-aaa', email: 'first@example.com' },
            },
            error: null,
          }),
        },
      }),
    }))
    vi.doMock('@/db/client', () => ({ getDb: () => ({}) }))
    vi.doMock('@/lib/active-org-cookie', () => ({
      writeActiveOrgCookie: vi.fn(async () => undefined),
    }))
    vi.doMock('@/features/auth/server/jwt-sync', () => ({
      syncUserOrgIds: vi.fn(async () => ({ orgIds: [] })),
      signOutUserGlobally: vi.fn(async () => undefined),
    }))
    vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }))

    const { createFirstOrgAction } = await import('@/features/orgs/server/orgs-actions')
    const fd = new FormData()
    fd.set('slug', 'first-org')
    fd.set('name', 'First Org')

    const result = await createFirstOrgAction(fd)
    expect(result).toEqual({ ok: true })
    expect(createWithAdmin).toHaveBeenCalledOnce()
    expect(createWithAdmin).toHaveBeenCalledWith({
      slug: 'first-org',
      name: 'First Org',
      selfHealUserEmail: 'first@example.com',
    })

    vi.doUnmock('@/repositories/orgs-repository')
    vi.doUnmock('@/lib/supabase/server')
    vi.doUnmock('@/db/client')
    vi.doUnmock('@/lib/active-org-cookie')
    vi.doUnmock('@/features/auth/server/jwt-sync')
    vi.doUnmock('next/cache')
  })
})
