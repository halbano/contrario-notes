import * as React from 'react'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { OnboardingTopBar } from './_components/onboarding-top-bar'

/**
 * Onboarding layout (VAL-09 / VAL-13).
 *
 * Authenticated user who has zero memberships lands here from
 * `requireMembershipOrRedirect`. We render a slim shell-tier top bar above
 * a centred card so the user always has an escape hatch (sign out) — VAL-13
 * fixes the dead-end where a stuck user (FK error, slug typo) had no way
 * out.
 *
 * Deliberately NO side nav and NO org switcher: the user has no
 * memberships, so there is nothing to switch to and nothing to navigate to.
 * The visual tier matches `AuthCard` — calm background, no sticky blur.
 *
 * Layout is async because we read the Supabase session to surface the
 * "Signed in as <email>" label. Middleware already gates the /onboarding
 * tree behind authentication, so a missing user here is a defence-in-depth
 * fallback (we render the bar with a generic label rather than crash).
 */
export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <OnboardingTopBar email={user?.email ?? null} />
      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">{children}</div>
      </main>
      <footer className="px-4 py-6 text-center text-micro text-muted-foreground md:px-8">
        Contrario Notes
      </footer>
    </div>
  )
}
