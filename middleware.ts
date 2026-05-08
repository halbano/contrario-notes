/**
 * Next.js middleware: refresh the Supabase session on every request and
 * redirect unauthenticated users away from the (app) tree.
 *
 * Note: middleware runs in the Edge runtime; `@supabase/ssr` exposes a Edge-
 * compatible client. The cookie-rewrite shape is the canonical Supabase one.
 *
 * Auth gating policy:
 *   - Routes under `/(app)` (the authenticated shell) require a session.
 *     Unauthenticated → redirect to `/sign-in`.
 *   - The `(auth)` group (`/sign-in`, `/sign-up`, `/forgot-password`) is
 *     always public — even authenticated users can hit it (e.g. to switch
 *     accounts).
 *   - Static assets and Next.js internals are skipped via the `matcher`.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const PUBLIC_PREFIXES = ['/sign-in', '/sign-up', '/forgot-password', '/auth']

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next({ request: req })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  // If env is missing (e.g. local without secrets), don't crash — let pages
  // render their own "supabase env missing" surface.
  if (!url || !anon) return res

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value, options } of cookiesToSet) {
          res.cookies.set(name, value, options)
        }
      },
    },
  })

  // Touching the session refreshes it if needed.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = req.nextUrl
  if (!user && !isPublic(pathname)) {
    const redirectUrl = req.nextUrl.clone()
    redirectUrl.pathname = '/sign-in'
    redirectUrl.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(redirectUrl)
  }

  return res
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, robots.txt, sitemap.xml (asset)
     * - any file with an extension (.svg, .png, etc)
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)',
  ],
}
