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

/**
 * Resolve the public-facing origin for redirect Location headers.
 *
 * Behind Railway's proxy, `req.url` resolves to the internal container
 * hostname (e.g. `https://ce26f473040c:8080`) which the browser cannot
 * follow. Prefer the explicit `NEXT_PUBLIC_APP_URL`; fall back to
 * forwarded headers, then to the request URL as a last resort.
 */
function getPublicOrigin(req: Request): string {
  const env = process.env.NEXT_PUBLIC_APP_URL
  if (env) return env.replace(/\/$/, '')
  const forwardedHost = req.headers.get('x-forwarded-host')
  const forwardedProto = req.headers.get('x-forwarded-proto') ?? 'https'
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`
  return new URL(req.url).origin
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const redirectTo = safeRedirect(url.searchParams.get('redirectTo'))
  const origin = getPublicOrigin(req)

  if (!code) {
    return NextResponse.redirect(new URL('/sign-in?error=callback_failed', origin), 303)
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(new URL('/sign-in?error=callback_failed', origin), 303)
  }

  return NextResponse.redirect(new URL(redirectTo, origin), 303)
}
