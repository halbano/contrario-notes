/**
 * Layout-level orphan redirect (VAL-09).
 *
 * `getRequestContext()` throws `no_membership` when the user is authenticated
 * but holds zero memberships. Before VAL-09, this surfaced as a generic
 * "Unable to load notes" error — middleware bounced the user back to
 * `/sign-in`, which then accepted the (still-valid) session and dropped them
 * back at the empty shell. Loop.
 *
 * `requireMembershipOrRedirect` short-circuits that loop:
 *   - On success: returns the resolved `RequestContext`.
 *   - On `no_membership`: redirects to `/onboarding/create-org` so the user
 *     can create their first org and bootstrap a membership.
 *   - On `unauthenticated`: defers to middleware (which already redirects to
 *     `/sign-in`) by re-throwing.
 *
 * Pulled out of `app/(app)/layout.tsx` so it's unit-testable without a
 * server-component harness — the layout calls this helper.
 */

import { redirect } from 'next/navigation'

import { AppError } from './errors'
import type { RequestContext } from './request-context'
import { getRequestContext as defaultGetRequestContext } from './auth-context'

export type RequireMembershipDeps = {
  getRequestContext: () => Promise<RequestContext>
  redirect: (path: string) => never
}

const defaultDeps: RequireMembershipDeps = {
  getRequestContext: defaultGetRequestContext,
  redirect: ((path: string) => {
    redirect(path)
    // `redirect()` already throws; this `throw` only narrows the return type.
    throw new Error(`unreachable: redirect(${path})`)
  }) as RequireMembershipDeps['redirect'],
}

export async function requireMembershipOrRedirect(
  deps: Partial<RequireMembershipDeps> = {},
): Promise<RequestContext> {
  const { getRequestContext, redirect: doRedirect } = { ...defaultDeps, ...deps }
  try {
    return await getRequestContext()
  } catch (err) {
    if (err instanceof AppError && err.code === 'no_membership') {
      doRedirect('/onboarding/create-org')
    }
    // `unauthenticated` (and anything else) bubbles up so middleware /
    // outer error boundaries handle it. We do not want to swallow these.
    throw err
  }
}
