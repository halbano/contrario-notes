/**
 * Supabase auth callback (VAL-01).
 *
 * Email-based flows (sign-up confirmation, password recovery, magic links)
 * point at this route. Supabase appends a `code` query param the client must
 * exchange for a session BEFORE rendering any authenticated route — otherwise
 * `getUser()` returns null and the user is bounced back to /sign-in.
 *
 * Failure paths redirect to `/sign-in?error=callback_failed` with a generic
 * error code, never leaking whether the code was malformed, expired, or
 * already consumed (TENANCY_INVARIANTS — error messages do not disclose state
 * the user shouldn't infer).
 *
 * Open-redirect protection: `redirectTo` is honoured only when it is a
 * same-origin absolute path (`/something`). Any value that could resolve to
 * an external host (`//evil.com/x`, `https://evil.com/x`) is rejected and
 * falls back to `/`.
 */

import { NextResponse } from 'next/server'

import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Sanitise the `redirectTo` query param.
 *
 * Returns the original path when it is a SAFE same-origin path; otherwise `/`.
 * Safe means: starts with a single `/` AND not a protocol-relative `//` URL.
 */
function safeRedirect(target: string | null): string {
  if (!target) return '/'
  if (!target.startsWith('/')) return '/'
  if (target.startsWith('//')) return '/'
  return target
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const redirectTo = safeRedirect(url.searchParams.get('redirectTo'))

  if (!code) {
    return NextResponse.redirect(new URL('/sign-in?error=callback_failed', url.origin), 303)
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(new URL('/sign-in?error=callback_failed', url.origin), 303)
  }

  return NextResponse.redirect(new URL(redirectTo, url.origin), 303)
}
