import * as React from 'react'
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

/**
 * Presentation-only user menu placeholder.
 * Real wiring (current user, sign-out action) is owned by `auth-agent`.
 *
 * TODO(auth-agent): Hydrate label / initials from the authenticated session
 * and wire the sign-out item to the Supabase server action.
 */
export function UserMenuSlot() {
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
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Account</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <SettingsIcon className="size-4" aria-hidden="true" />
          <span>Settings</span>
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
          <LogOut className="size-4" aria-hidden="true" />
          <span>Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
