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
 */
export function MobileNav() {
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
      <SheetContent side="left" className="w-72 p-0">
        <SheetHeader className="border-b p-4 text-left">
          <SheetTitle asChild>
            <Logo />
          </SheetTitle>
        </SheetHeader>
        <SideNav onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}
