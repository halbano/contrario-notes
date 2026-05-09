import { redirect } from 'next/navigation'

import { AuthCard } from '@/app/(auth)/_components/auth-card'
import { CreateFirstOrgForm } from './create-first-org-form'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { findAllMembershipsForUser } from '@/repositories/memberships-repository'
import type { AnyDb } from '@/repositories'

// Page reads Supabase session + memberships at render time. Cannot be
// statically prerendered — env vars aren't available in CI build.
export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Create your organization · Contrario Notes',
}

/**
 * First-org onboarding page (VAL-09).
 *
 * Server-side guard:
 *   - No session → bounce to /sign-in. (Middleware already does this for the
 *     /onboarding/* tree, but defence-in-depth is cheap here.)
 *   - Already has memberships → bounce to / so we don't show "create your
 *     first org" to someone who already has one.
 */
export default async function CreateOrgPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const memberships = await findAllMembershipsForUser(user.id, undefined as unknown as AnyDb)
  if (memberships.length > 0) redirect('/')

  return (
    <AuthCard
      title="Create your organization"
      description="Set up a workspace for you and your team. You can invite members once it's ready."
    >
      <CreateFirstOrgForm />
    </AuthCard>
  )
}
