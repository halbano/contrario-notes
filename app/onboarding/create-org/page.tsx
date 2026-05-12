import { redirect } from 'next/navigation'

import { AuthCard } from '@/app/(auth)/_components/auth-card'
import { CreateFirstOrgForm } from './create-first-org-form'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// Page reads Supabase session at render time. Cannot be statically
// prerendered — env vars aren't available in CI build.
export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Create organization · Contrario Notes',
}

/**
 * Create-organization page (VAL-09 + VAL-14).
 *
 * Serves two entry paths:
 *   1. Orphan onboarding — authenticated user with zero memberships is
 *      pushed here by the layout-level `requireMembershipOrRedirect` guard.
 *   2. Additional-org creation — existing members reach this via the
 *      "Create organization" item inside the org-switcher dropdown.
 *
 * Both paths render the same form. `createFirstOrgAction` works for
 * either case (it always creates an org + admin membership for the
 * caller; existing memberships don't conflict).
 *
 * Server-side guard:
 *   - No session → bounce to /sign-in. (Middleware already does this
 *     for the /onboarding/* tree, but defence-in-depth is cheap here.)
 */
export default async function CreateOrgPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  return (
    <AuthCard
      title="Create organization"
      description="Set up a workspace for you and your team. You can invite members once it's ready."
    >
      <CreateFirstOrgForm />
    </AuthCard>
  )
}
