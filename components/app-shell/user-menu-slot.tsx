import * as React from 'react'
import Link from 'next/link'
import { LogOut, User as UserIcon, Settings as SettingsIcon } from 'lucide-react'

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
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { signOutAction } from '@/app/(auth)/_components/auth-actions'

/**
 * User menu — wired (VAL-16).
 *
 * Async server component. Reads the Supabase user via the SSR client (the
 * same path `getRequestContext` uses) so the dropdown label shows the
 * actual signed-in email. Items are real interactive elements:
 *
 * - Settings → Link to `/settings` (placeholder page exists today).
 * - Sign out → submit button inside `<form action={signOutAction}>`. The
 *   action clears Supabase session + the active-org cookie + redirects
 *   to `/sign-in` (see `signOutAction` in `app/(auth)/_components/auth-actions`).
 *
 * Visual: trigger is the avatar (round). On md+ a "Signed in as <email>"
 * label appears in the dropdown header so a stuck user can confirm their
 * identity without navigating.
 */
export async function UserMenuSlot() {
  let email: string | null = null
  try {
    const supabase = await createSupabaseServerClient()
    const { data } = await supabase.auth.getUser()
    email = data.user?.email ?? null
  } catch {
    // Fall through — render the menu with "Account" fallback label.
  }
  const label = email ?? 'Account'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open user menu"
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
        <DropdownMenuItem asChild>
          <Link href="/settings" className="flex items-center gap-2">
            <SettingsIcon className="size-4" aria-hidden="true" />
            <span>Settings</span>
          </Link>
        </DropdownMenuItem>
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
  )
}
