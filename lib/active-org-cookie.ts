/**
 * Active-org cookie. Server-only.
 *
 * Stores the user's currently selected organization. Cookie is httpOnly,
 * secure, sameSite=lax, and signed via the Supabase auth session — losing
 * the cookie just means we fall back to the user's default membership.
 *
 * SECURITY:
 *   The cookie value is treated as a HINT only. `buildRequestContext` MUST
 *   re-validate the value against the memberships table before producing a
 *   `RequestContext`. A tampered cookie cannot widen privileges.
 *
 *   See TENANCY_INVARIANTS.md invariant 2: `org_id` is server-controlled.
 */

import { cookies } from 'next/headers'

export const ACTIVE_ORG_COOKIE = 'contrario_active_org'

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

export async function readActiveOrgCookie(): Promise<string | undefined> {
  const store = await cookies()
  const value = store.get(ACTIVE_ORG_COOKIE)?.value
  if (!value) return undefined
  // Defensive parse — UUIDs only.
  if (!/^[0-9a-fA-F-]{32,36}$/.test(value)) return undefined
  return value
}

export async function writeActiveOrgCookie(orgId: string): Promise<void> {
  const store = await cookies()
  store.set(ACTIVE_ORG_COOKIE, orgId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
  })
}

export async function clearActiveOrgCookie(): Promise<void> {
  const store = await cookies()
  store.delete(ACTIVE_ORG_COOKIE)
}
