'use client'

import * as React from 'react'
import { Menu } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { SideNav } from './side-nav'
import { Logo } from '@/components/brand/logo'

/**
 * Mobile nav drawer. Wraps the same `SideNav` content used at desktop
 * inside a shadcn `Sheet`. Trap-focus + Esc close are provided by Radix
 * (DESIGN_INVARIANTS.md invariant 8).
 *
 * Layout: header (logo) -> org switcher slot -> primary nav -> secondary
 * (Settings) pinned to bottom via the inner `SideNav` flex column.
 *
 * `orgSwitcher` is passed as a prop because it's an async server component
 * (data-driven dropdown — VAL-14); client components can't render those
 * directly, but can render them as children.
 */
export function MobileNav({ orgSwitcher }: { orgSwitcher: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open navigation menu"
          className="md:hidden"
        >
          <Menu className="size-5" aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="flex w-72 flex-col gap-0 p-0"
      >
        <SheetHeader className="space-y-0 border-b border-border p-4 text-left">
          <SheetTitle asChild>
            <Logo />
          </SheetTitle>
        </SheetHeader>
        <div className="border-b border-border p-3">{orgSwitcher}</div>
        <SideNav onNavigate={() => setOpen(false)} className="flex-1" />
      </SheetContent>
    </Sheet>
  )
}
