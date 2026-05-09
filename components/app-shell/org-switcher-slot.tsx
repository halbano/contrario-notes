import * as React from 'react'
import Link from 'next/link'
import { ChevronDown, Building2 } from 'lucide-react'

import { Button } from '@/components/ui/button'

/**
 * Presentation-only placeholder for the org switcher.
 * Real wiring (org list fetch, switching, cache invalidation) is owned
 * by `auth-agent` per agent specs.
 *
 * VAL-09 fallback: when no membership is available (which should never
 * happen inside `(app)` after the layout-level orphan redirect, but is
 * cheap defence-in-depth), this slot links to the first-org create flow
 * instead of rendering a disabled "No organization" pill that traps users.
 *
 * TODO(auth-agent): Replace this slot with a data-driven dropdown fed by
 * org membership from the `RequestContext`. Org switching MUST invalidate
 * any cached scoped services (see ADR-0002, ADR-0007 risk).
 */
export function OrgSwitcherSlot() {
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
