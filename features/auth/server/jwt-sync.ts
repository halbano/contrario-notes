import type { SupabaseClient } from '@supabase/supabase-js'
import { eq } from 'drizzle-orm'

import { getDb } from '@/db/client'
import { memberships } from '@/db/schema'
import type { AnyDb } from '@/repositories'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { LOG_EVENTS, type Logger } from '@/logging'

/**
 * DR-PROD-01 — Keep `app_metadata.org_ids` in sync with the `memberships`
 * table.
 *
 * RLS policies (`drizzle/0001_rls.sql`, `drizzle/0003_rls_note_shares.sql`)
 * key off the JWT claim `app_metadata.org_ids` (uuid[]). If that claim
 * doesn't reflect current memberships:
 *
 *   1. New member can't see org X until they sign in again (claim missing).
 *   2. Removed member retains DB access for up to JWT expiry.
 *
 * Callers MUST invoke `syncUserOrgIds(userId)` after every mutation that
 * changes (user_id, org_id) pairs (membership add / remove / org create with
 * admin). Role changes do NOT touch `org_ids` and skip the sync.
 *
 * `removeMember` callers must additionally call
 * `signOutUserGlobally(userId)` so the previously-issued JWT is revoked
 * server-side instead of waiting for it to expire.
 *
 * Reads ALL membership rows for the user via service-role to bypass RLS.
 * Writes the resulting org_ids array into the user's `app_metadata`,
 * preserving every other claim already there.
 */

type SyncDeps = {
  /** Drizzle handle override (tests). */
  db?: AnyDb
  /** Supabase admin client override (tests). */
  admin?: SupabaseClient
}

export async function syncUserOrgIds(
  userId: string,
  logger: Logger,
  deps: SyncDeps = {},
): Promise<{ orgIds: string[] }> {
  const db = deps.db ?? (getDb() as unknown as AnyDb)
  const admin = deps.admin ?? getSupabaseAdminClient()

  // Service-role bypasses RLS so we see every membership the user holds,
  // not just the ones in the caller's current ctx.
  const rows = await db
    .select({ orgId: memberships.orgId })
    .from(memberships)
    .where(eq(memberships.userId, userId))
  const orgIds = rows.map((r) => r.orgId)

  // Read existing app_metadata first; we MUST merge to avoid blowing away
  // unrelated claims (e.g. provider, providers, custom claims).
  const { data: getData, error: getErr } = await admin.auth.admin.getUserById(userId)
  if (getErr || !getData?.user) {
    const message = getErr?.message ?? 'user not found'
    logger.log(LOG_EVENTS.AUTH_JWT_SYNC_FAILED, { userId, error: message })
    throw new Error(`syncUserOrgIds: cannot read user ${userId}: ${message}`)
  }

  const existing = getData.user.app_metadata ?? {}
  const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { ...existing, org_ids: orgIds },
  })
  if (updErr) {
    logger.log(LOG_EVENTS.AUTH_JWT_SYNC_FAILED, { userId, error: updErr.message })
    throw new Error(`syncUserOrgIds: cannot update user ${userId}: ${updErr.message}`)
  }

  logger.log(LOG_EVENTS.AUTH_JWT_SYNCED, { userId, orgCount: orgIds.length })
  return { orgIds }
}

/**
 * Globally invalidate any active sessions for `userId`. Call this AFTER
 * `syncUserOrgIds` on the remove-member path so a removed user's existing
 * JWT (which still encodes the old org_ids) is rejected on next request.
 *
 * On Supabase Auth, `signOut(jwt, 'global')` revokes refresh tokens for the
 * user. Failures are logged but do NOT throw — the membership row is already
 * gone and the org_ids claim is already updated, so the worst-case window
 * shrinks back to JWT expiry (DR-PROD-02 covers tightening that to 15 min).
 */
export async function signOutUserGlobally(
  userId: string,
  logger: Logger,
  deps: { admin?: SupabaseClient } = {},
): Promise<void> {
  const admin = deps.admin ?? getSupabaseAdminClient()
  // The Supabase admin API supports `signOut(jwt, scope)`. We don't have
  // the user's JWT here; the closest server-side equivalent is to delete
  // their refresh tokens via `auth.admin.signOut`. Newer SDKs accept a
  // `userId` form; older ones expect a JWT. We attempt the user-scoped form
  // and fall back to a no-op-with-log on failure so a partially-applied
  // change is still safer than the previous "do nothing" behavior.
  type AdminWithUserSignOut = {
    auth: {
      admin: {
        signOut?: (userId: string, scope?: 'global' | 'local' | 'others') => Promise<{ error: Error | null }>
      }
    }
  }
  const adminWithSignOut = admin as unknown as AdminWithUserSignOut
  const signOutFn = adminWithSignOut.auth.admin.signOut
  if (typeof signOutFn !== 'function') {
    logger.log(LOG_EVENTS.AUTH_JWT_SYNC_FAILED, {
      userId,
      error: 'admin.signOut not available on this SDK',
    })
    return
  }
  const { error } = await signOutFn.call(adminWithSignOut.auth.admin, userId, 'global')
  if (error) {
    logger.log(LOG_EVENTS.AUTH_JWT_SYNC_FAILED, { userId, error: error.message })
    return
  }
  logger.log(LOG_EVENTS.AUTH_JWT_SYNCED, { userId, signedOut: true })
}
