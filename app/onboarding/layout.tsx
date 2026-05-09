import * as React from 'react'

import { Logo } from '@/components/brand/logo'

/**
 * Onboarding layout (VAL-09).
 *
 * Authenticated user who has zero memberships lands here from
 * `requireMembershipOrRedirect`. Visually identical to the auth shell
 * (centred card on a calm background) — no top bar, no side nav, because
 * those depend on a `RequestContext` the user does not yet have.
 */
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between px-4 py-4 md:px-8">
        <Logo />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">{children}</div>
      </main>
      <footer className="px-4 py-6 text-center text-micro text-muted-foreground md:px-8">
        Contrario Notes
      </footer>
    </div>
  )
}
