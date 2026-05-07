import * as React from 'react'

import { TopBar } from '@/components/app-shell/top-bar'
import { SideNav } from '@/components/app-shell/side-nav'

/**
 * Authenticated app shell layout.
 *
 * - Sticky top bar (logo + org switcher slot + user menu slot)
 * - Persistent left side nav at >= md
 * - At < md the side nav collapses into a Sheet (see `MobileNav`)
 *
 * Auth gating is `auth-agent`'s responsibility; this layout assumes the user
 * is authenticated. TODO(auth-agent): redirect unauthenticated users to
 * `/sign-in` from a server-side check above this layout.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
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
