'use server'

/**
 * Server actions for organization create / list / switch.
 *
 * Every action:
 *   - Builds a fresh `RequestContext` via `getRequestContext()` — never trusts
 *     org_id from the request body/query/header.
 *   - Logs auth events (org_created / org_switch / org_switch_denied / membership_changed).
 *   - On org-switch success, writes the active-org cookie, then revalidates
 *     so any in-flight RSC cache is invalidated (see auth-context cache
 *     invalidation strategy in NOTES.md).
 *
 * For first-org creation (a brand-new user with no memberships), we do NOT
 * call `getRequestContext()` first — there's no membership yet. Instead, we
 * use a session-only flow that creates the org and the admin membership in
 * the same transaction. See `createFirstOrgAction`.
 */

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getRequestContext } from '@/lib/auth-context'
import { writeActiveOrgCookie } from '@/lib/active-org-cookie'
import { createScopedServices } from '@/services'
import { createOrgsRepository } from '@/repositories/orgs-repository'
import { getDb } from '@/db/client'
import { AppError } from '@/lib/errors'
import { logger, LOG_EVENTS } from '@/logging'

export type OrgActionResult =
  | { ok: true }
  | { ok: false; message: string; code?: string }

/**
 * Create the first organization for a brand-new user.
 *
 * This action is intentionally NOT gated by `getRequestContext()` because
 * a brand-new user has no membership yet — the function exists precisely
 * to create their first one. It still requires an authenticated Supabase
 * session, which establishes user identity.
 */
export async function createFirstOrgAction(formData: FormData): Promise<OrgActionResult> {
  const slug = String(formData.get('slug') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'Not authenticated.' }

  // Build a synthetic ctx for the orgs repository. The repo's
  // `createWithAdmin` uses `ctx.userId` for the admin membership; orgId on
  // ctx is irrelevant because the new row defines its own.
  const ctx = Object.freeze({
    userId: user.id,
    orgId: '00000000-0000-0000-0000-000000000000',
    role: 'admin' as const,
  })
  const repo = createOrgsRepository(ctx, getDb() as never)
  try {
    const org = await repo.createWithAdmin({ slug, name })
    await writeActiveOrgCookie(org.id)
    logger.log(LOG_EVENTS.AUTH_ORG_CREATED, { orgId: org.id, userId: user.id })
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      message: (err as Error).message ?? 'Failed to create organization.',
    }
  }
}

/**
 * Create a new organization for an existing member. Goes through the
 * service layer (validates input, emits events).
 */
export async function createOrgAction(formData: FormData): Promise<OrgActionResult> {
  const slug = String(formData.get('slug') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()

  let ctx
  try {
    ctx = await getRequestContext()
  } catch {
    // No membership yet — defer to the first-org flow.
    return createFirstOrgAction(formData)
  }
  const services = createScopedServices(ctx)
  try {
    const org = await services.orgs.createOrg({ slug, name })
    await writeActiveOrgCookie(org.id)
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (err) {
    if (err instanceof AppError) {
      return { ok: false, code: err.code, message: err.message }
    }
    return { ok: false, message: 'Failed to create organization.' }
  }
}

/**
 * Switch the active organization.
 *
 * Validates membership BEFORE writing the cookie. Failure surfaces as a 404
 * (`AppError('not_found')`) — never a permission_denied — to avoid leaking
 * the existence of orgs the user is not a member of.
 *
 * On success, calls `revalidatePath('/', 'layout')` so any RSC cache built
 * with the previous org's `RequestContext` is invalidated.
 */
export async function switchOrgAction(formData: FormData): Promise<OrgActionResult> {
  const targetOrgId = String(formData.get('orgId') ?? '').trim()
  if (!/^[0-9a-fA-F-]{32,36}$/.test(targetOrgId)) {
    return { ok: false, code: 'invalid_input', message: 'Invalid org id.' }
  }

  const ctx = await getRequestContext()
  const services = createScopedServices(ctx)
  try {
    const validated = await services.orgs.validateOrgSwitch(targetOrgId)
    await writeActiveOrgCookie(validated.orgId)
    // Bust the RSC tree cache so the next render builds with the new ctx.
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (err) {
    if (err instanceof AppError) {
      return { ok: false, code: err.code, message: err.message }
    }
    return { ok: false, message: 'Unable to switch organization.' }
  }
}

/** Convenience: switch + redirect (used by the org-switcher menu). */
export async function switchOrgAndRedirect(formData: FormData): Promise<void> {
  const result = await switchOrgAction(formData)
  if (result.ok) redirect('/')
  // On failure we still redirect home — not_found is opaque to the user.
  redirect('/')
}
