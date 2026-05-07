import { createBrowserClient } from '@supabase/ssr'

/**
 * Browser-side Supabase client. Anon key only. NEVER include the service-role
 * key here. Returns a singleton — Supabase's SSR helpers are happy with that
 * pattern in the browser.
 */
let _client: ReturnType<typeof createBrowserClient> | undefined

export function getSupabaseBrowserClient() {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) {
    throw new Error('Supabase env vars missing. See .env.example.')
  }
  _client = createBrowserClient(url, anon)
  return _client
}
