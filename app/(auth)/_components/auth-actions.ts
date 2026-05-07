'use server'

/**
 * Auth server actions (stubs).
 *
 * These return shaped results so the UI can surface validation surfaces today
 * without auth being wired. Replace the `TODO(auth-agent)` blocks with the
 * Supabase calls. Do not change the input schemas (in `auth-schemas.ts`)
 * without coordinating with `auth-agent`.
 */

import type { AuthActionResult } from './auth-schemas'

export async function signInAction(_formData: FormData): Promise<AuthActionResult> {
  // TODO(auth-agent): wire to Supabase server-side auth (signInWithPassword)
  // and redirect to `/` on success. Validate with `signInSchema` server-side
  // first; return `fieldErrors` on validation failure.
  return {
    ok: false,
    message: 'Sign-in is not yet wired. The auth-agent will enable this flow.',
  }
}

export async function signUpAction(_formData: FormData): Promise<AuthActionResult> {
  // TODO(auth-agent): wire to Supabase server-side auth (signUp) and redirect
  // to email-confirmation flow on success. Validate with `signUpSchema`
  // server-side first; return `fieldErrors` on validation failure.
  return {
    ok: false,
    message: 'Sign-up is not yet wired. The auth-agent will enable this flow.',
  }
}

export async function requestPasswordReset(
  _formData: FormData
): Promise<AuthActionResult> {
  // TODO(auth-agent): wire to Supabase `resetPasswordForEmail` (server-side).
  // Validate with `forgotPasswordSchema` server-side first; return
  // `fieldErrors` on validation failure. On success, return `{ ok: true }` so
  // the UI shows the "Check your inbox" confirmation. Do NOT leak whether the
  // email is registered — always respond with success once validation passes.
  return {
    ok: false,
    message:
      'Password reset is not yet wired. The auth-agent will enable this flow.',
  }
}
