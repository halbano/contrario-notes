import * as React from 'react'

import { Logo } from '@/components/brand/logo'
import { MobileNav } from './mobile-nav'
import { OrgSwitcherSlot } from './org-switcher-slot'
import { UserMenuSlot } from './user-menu-slot'

/**
 * Top bar for the authenticated app shell.
 *
 * Slots:
 * - logo (always visible)
 * - org switcher slot — wired by `auth-agent`
 * - user menu slot — wired by `auth-agent`
 *
 * Mobile: shows hamburger trigger that opens `MobileNav`.
 */
export function TopBar() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/75 md:px-6">
      <MobileNav />
      <div className="flex flex-1 items-center gap-3">
        <div className="hidden md:flex">
          <Logo />
        </div>
        <div className="md:hidden">
          <Logo />
        </div>
        <div className="ml-2 hidden md:block">
          <OrgSwitcherSlot />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="md:hidden">
          <OrgSwitcherSlot />
        </div>
        <UserMenuSlot />
      </div>
    </header>
  )
}
