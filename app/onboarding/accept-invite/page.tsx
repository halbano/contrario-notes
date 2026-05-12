import { redirect } from 'next/navigation'

import { resolveAcceptInvite } from '@/features/orgs/server/accept-invite-handler'

// Page resolves the invite during render (reads cookies / writes DB) — cannot
// be statically prerendered.
export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Accept invite · Contrario Notes',
}

/**
 * Accept-invite landing (VAL-18). The flow is:
 *
 *   1. Supabase email link → `/auth/callback?redirectTo=/onboarding/accept-invite`
 *   2. callback route exchanges the code for a session, then 303s here
 *   3. this page reads `user_metadata.invited_*`, writes the membership,
 *      syncs the JWT claim, sets the active-org cookie, and clears the
 *      consumed `invited_*` keys
 *   4. final redirect to `/` (or fallback paths on any miss)
 *
 * All writes happen during render — `redirect()` is the only thing the
 * component returns. We rely on the layout-level `OnboardingTopBar` for the
 * fallback UI shell.
 */
export default async function AcceptInvitePage() {
  const outcome = await resolveAcceptInvite()
  redirect(outcome.redirectTo)
}
