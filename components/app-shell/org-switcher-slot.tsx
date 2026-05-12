import * as React from 'react'
import Link from 'next/link'
import { ChevronDown, Building2, Check, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getRequestContext } from '@/lib/auth-context'
import { createScopedServices } from '@/services'
import { switchOrgAndRedirect } from '@/features/orgs/server/orgs-actions'

/**
 * Org switcher — data-driven dropdown (VAL-14).
 *
 * - Lists every organization the current user has a membership in.
 * - Active org marked with a check + disabled row.
 * - Picking another org posts to `switchOrgAndRedirect` (server-side cookie
 *   rewrite + `revalidatePath('/', 'layout')` + redirect to `/`).
 * - Final item: "Create organization" → `/onboarding/create-org`.
 *
 * Fallback: auth lookup fails OR zero memberships → render legacy
 * "Create organization" CTA (orphan path; layout-level redirect should
 * have caught this — defence-in-depth).
 */
export async function OrgSwitcherSlot() {
  let activeOrgId: string | null = null
  let orgs: { id: string; name: string; slug: string }[] = []
  try {
    const ctx = await getRequestContext()
    activeOrgId = ctx.orgId
    const services = createScopedServices(ctx)
    const list = await services.orgs.listForCurrentUser()
    orgs = list.map((o) => ({ id: o.id, name: o.name, slug: o.slug }))
  } catch {
    // Fall through to the fallback CTA.
  }

  if (orgs.length === 0) {
    return (
      <Button
        asChild
        variant="outline"
        size="sm"
        className="w-full justify-between gap-2 md:w-auto md:justify-start"
      >
        <Link href="/onboarding/create-org" aria-label="Create organization">
          <span className="flex min-w-0 items-center gap-2">
            <Building2 className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate md:max-w-[18ch]">Create organization</span>
          </span>
          <ChevronDown className="size-4 shrink-0 opacity-60" aria-hidden="true" />
        </Link>
      </Button>
    )
  }

  const activeOrg = orgs.find((o) => o.id === activeOrgId) ?? orgs[0]!

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-between gap-2 md:w-auto md:justify-start"
          aria-label="Switch organization"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Building2 className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate md:max-w-[18ch]">{activeOrg.name}</span>
          </span>
          <ChevronDown className="size-4 shrink-0 opacity-60" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[14rem]">
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {orgs.map((o) => {
          const isActive = o.id === activeOrgId
          if (isActive) {
            return (
              <DropdownMenuItem key={o.id} disabled className="flex items-center justify-between gap-2">
                <span className="truncate">{o.name}</span>
                <Check className="size-4 shrink-0 opacity-80" aria-hidden="true" />
              </DropdownMenuItem>
            )
          }
          return (
            <DropdownMenuItem key={o.id} asChild>
              <form action={switchOrgAndRedirect} className="w-full">
                <input type="hidden" name="orgId" value={o.id} />
                <button
                  type="submit"
                  className="flex w-full items-center justify-between gap-2 text-left"
                >
                  <span className="truncate">{o.name}</span>
                </button>
              </form>
            </DropdownMenuItem>
          )
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/onboarding/create-org" className="flex items-center gap-2">
            <Plus className="size-4 shrink-0" aria-hidden="true" />
            <span>Create organization</span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
