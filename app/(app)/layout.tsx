import * as React from 'react'

import { TopBar } from '@/components/app-shell/top-bar'
import { SideNav } from '@/components/app-shell/side-nav'
import { requireMembershipOrRedirect } from '@/lib/require-membership'

/**
 * Authenticated app shell layout.
 *
 * - Sticky top bar (logo + org switcher slot + user menu slot)
 * - Persistent left side nav at >= md
 * - At < md the side nav collapses into a Sheet (see `MobileNav`)
 *
 * Auth gating: middleware redirects fully-unauthenticated users to /sign-in.
 * Here we additionally short-circuit "authenticated but no membership" by
 * sending the orphan to `/onboarding/create-org` (VAL-09). Without this,
 * such a user lands on the empty shell with no path forward.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Force-resolve membership before rendering. Throws no_membership →
  // redirect to onboarding; rethrows unauthenticated → middleware handles.
  await requireMembershipOrRedirect()

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <TopBar />
      <div className="flex flex-1">
        <aside
          aria-label="Sidebar"
          className="hidden w-64 shrink-0 border-r border-border md:flex md:flex-col"
        >
          <SideNav />
        </aside>
        <main className="flex-1 px-4 py-6 md:px-8 md:py-10" id="main">
          {children}
        </main>
      </div>
    </div>
  )
}
