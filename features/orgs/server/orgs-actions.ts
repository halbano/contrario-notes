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
import { z } from 'zod'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getRequestContext } from '@/lib/auth-context'
import { writeActiveOrgCookie } from '@/lib/active-org-cookie'
import { createScopedServices } from '@/services'
import { createOrgsRepository } from '@/repositories/orgs-repository'
import { getDb } from '@/db/client'
import { AppError } from '@/lib/errors'
import { logger, LOG_EVENTS } from '@/logging'
import { syncUserOrgIds } from '@/features/auth/server/jwt-sync'

export type OrgActionResult =
  | { ok: true }
  | { ok: false; message: string; code?: string }

/**
 * Distinct shape for invite-by-email: the form needs to render a
 * status-specific message ("added" vs "invited" vs "already_member") so we
 * surface the underlying service status rather than the generic ok-boolean.
 */
export type InviteByEmailActionResult =
  | { ok: true; status: 'added' | 'invited' | 'already_member'; userId: string }
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
    // VAL-11: pass the Supabase email so the repo can self-heal the
    // public.users mirror in the same transaction if it was wiped (dev
    // `seed --reset` cascade can leave auth.users orphaned). Idempotent —
    // ON CONFLICT DO NOTHING leaves an existing mirror untouched.
    const org = await repo.createWithAdmin({
      slug,
      name,
      selfHealUserEmail: user.email ?? undefined,
    })
    // DR-PROD-01: this path bypasses orgs-service so the JWT-sync there
    // doesn't fire automatically. Sync explicitly so RLS recognises the
    // brand-new org on the user's next request.
    await syncUserOrgIds(user.id, logger)
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

const INVITE_FORM_SCHEMA = z.object({
  email: z.string().trim().min(1, 'Email is required'),
  role: z.enum(['admin', 'member', 'viewer']),
})

/**
 * Invite a member by email (VAL-18). Form action invoked from the
 * /settings/members panel.
 *
 * The action itself only parses + delegates — `services.orgs.inviteByEmail`
 * holds all the business logic (admin gating, existing-vs-new branch, audit,
 * JWT sync). On success we revalidate `/settings/members` so the freshly
 * added membership (or pending invite) shows up on the next render.
 */
const CHANGE_ROLE_SCHEMA = z.object({
  membershipId: z.string().uuid(),
  role: z.enum(['admin', 'member', 'viewer']),
})

/**
 * Change a member's role in the current org. Admin-only at the service layer.
 * Form action for the members panel.
 */
export async function changeMemberRoleAction(
  formData: FormData,
): Promise<OrgActionResult> {
  const parsed = CHANGE_ROLE_SCHEMA.safeParse({
    membershipId: formData.get('membershipId'),
    role: formData.get('role'),
  })
  if (!parsed.success) {
    return { ok: false, code: 'invalid_input', message: 'Invalid input.' }
  }
  const ctx = await getRequestContext()
  const services = createScopedServices(ctx)
  try {
    await services.orgs.changeRole(parsed.data.membershipId, parsed.data.role)
    revalidatePath('/settings/members')
    return { ok: true }
  } catch (err) {
    if (err instanceof AppError) {
      return { ok: false, code: err.code, message: err.message }
    }
    return { ok: false, message: 'Failed to change role.' }
  }
}

const REMOVE_MEMBER_SCHEMA = z.object({
  membershipId: z.string().uuid(),
})

/**
 * Remove a member from the current org. Admin-only at the service layer.
 */
export async function removeMemberAction(
  formData: FormData,
): Promise<OrgActionResult> {
  const parsed = REMOVE_MEMBER_SCHEMA.safeParse({
    membershipId: formData.get('membershipId'),
  })
  if (!parsed.success) {
    return { ok: false, code: 'invalid_input', message: 'Invalid input.' }
  }
  const ctx = await getRequestContext()
  const services = createScopedServices(ctx)
  try {
    await services.orgs.removeMember(parsed.data.membershipId)
    revalidatePath('/settings/members')
    return { ok: true }
  } catch (err) {
    if (err instanceof AppError) {
      return { ok: false, code: err.code, message: err.message }
    }
    return { ok: false, message: 'Failed to remove member.' }
  }
}

export async function inviteMemberByEmailAction(
  formData: FormData,
): Promise<InviteByEmailActionResult> {
  const parsed = INVITE_FORM_SCHEMA.safeParse({
    email: formData.get('email'),
    role: formData.get('role'),
  })
  if (!parsed.success) {
    return {
      ok: false,
      code: 'invalid_input',
      message: parsed.error.issues[0]?.message ?? 'Invalid input.',
    }
  }
  const ctx = await getRequestContext()
  const services = createScopedServices(ctx)
  try {
    const result = await services.orgs.inviteByEmail(parsed.data)
    revalidatePath('/settings/members')
    return { ok: true, status: result.status, userId: result.userId }
  } catch (err) {
    if (err instanceof AppError) {
      return { ok: false, code: err.code, message: err.message }
    }
    return { ok: false, message: 'Failed to send invite.' }
  }
}
