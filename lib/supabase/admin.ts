import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Admin Supabase client. Uses the service-role key. Bypasses RLS.
 *
 * RULES (defense in depth — primary scoping is still RequestContext +
 * repositories per ADR-0001):
 *  - Server-only. Importing this file from a client bundle should fail.
 *  - Never expose the resulting client (or its tokens) to the browser.
 *  - Use only for: signed-URL minting, storage admin tasks, and operational
 *    scripts. Day-to-day reads/writes go through the user-scoped server
 *    client + the repositories.
 */
let _admin: SupabaseClient | undefined

export function getSupabaseAdminClient(): SupabaseClient {
  if (typeof window !== 'undefined') {
    throw new Error('getSupabaseAdminClient must not be called in the browser.')
  }
  if (_admin) return _admin
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRole) {
    throw new Error('Supabase admin env vars missing. See .env.example.')
  }
  _admin = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return _admin
}
