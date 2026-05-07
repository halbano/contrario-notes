import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Server-side Supabase client. Uses the anon key + the user's cookie session,
 * so RLS policies see the real authenticated user. Use this for any
 * server-rendered page or route that needs to act AS the user.
 *
 * Do NOT use this for migrations or admin tasks — use `adminClient` instead.
 */
export async function createSupabaseServerClient() {
  const url = required('NEXT_PUBLIC_SUPABASE_URL')
  const anon = required('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  const cookieStore = await cookies()
  return createServerClient(url, anon, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet: { name: string; value: string; options?: Parameters<typeof cookieStore.set>[2] }[]) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Setting cookies fails in pure Server Components; ignore.
          // The middleware path is responsible for refreshing the session.
        }
      },
    },
  })
}

function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not set. See .env.example.`)
  return v
}
