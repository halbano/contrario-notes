import * as React from 'react'
import { LogOut, User as UserIcon } from 'lucide-react'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Logo } from '@/components/brand/logo'
import { signOutAction } from '@/app/(auth)/_components/auth-actions'

/**
 * Onboarding top bar (VAL-13).
 *
 * Slim shell-tier bar shown above the "Create your first organization" card.
 * The user is authenticated but has zero memberships — there is nothing to
 * navigate to, so there is no side nav and no org switcher. The bar exists
 * for ONE reason: give the user an escape hatch (sign out) when they get
 * stuck (e.g. an FK error, a typo'd slug, or simply changing their mind).
 *
 * Visual: softer / less saturated than the in-app TopBar — see the calm
 * `border-border/50` and absence of the sticky/blur backdrop. The
 * underlying layout sits on `bg-background`, matching the AuthCard tier.
 *
 * The email is rendered VISIBLY next to the avatar (not hidden inside the
 * dropdown). A stuck user shouldn't have to discover the menu to confirm
 * which account they're on — that's the whole point of the escape hatch.
 */
export function OnboardingTopBar({ email }: { email: string | null }) {
  const label = email ?? 'Account'
  return (
    <header className="flex h-14 items-center gap-3 border-b border-border/50 bg-background px-4 md:px-6">
      <div className="flex flex-1 items-center gap-3">
        <Logo />
      </div>
      <div className="flex items-center gap-3">
        <span
          className="hidden text-sm text-muted-foreground sm:inline"
          data-testid="onboarding-account-email"
        >
          Signed in as <span className="text-foreground">{label}</span>
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Open account menu"
              className="rounded-full"
            >
              <Avatar className="size-8">
                <AvatarFallback aria-hidden="true">
                  <UserIcon className="size-4" />
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
              Signed in as
              <div className="truncate text-sm font-medium text-foreground">
                {label}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {/* Sign out posts directly to the existing server action. Wrapped
                in a form so the click works without any client JS — keeps
                this dropdown safe on the no-membership escape path. */}
            <DropdownMenuItem asChild>
              <form action={signOutAction} className="w-full">
                <button
                  type="submit"
                  className="flex w-full items-center gap-2 text-left"
                >
                  <LogOut className="size-4" aria-hidden="true" />
                  <span>Sign out</span>
                </button>
              </form>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {/* Defence-in-depth: a no-JS user (or a Radix portal hiccup) still
            needs an escape hatch. The visually-hidden form keeps Sign out
            reachable via assistive tech / forced submission. */}
        <form action={signOutAction} className="sr-only">
          <button type="submit">Sign out</button>
        </form>
      </div>
    </header>
  )
}
