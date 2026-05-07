import * as React from 'react'
import Link from 'next/link'

import { cn } from '@/lib/utils'

/**
 * Wordmark — typography-first per Contrario reference.
 * Pure presentation; no auth awareness.
 */
export function Logo({
  href = '/',
  className,
}: {
  href?: string
  className?: string
}) {
  return (
    <Link
      href={href}
      aria-label="Contrario Notes home"
      className={cn(
        'inline-flex items-center gap-2 rounded-sm px-1 text-h4 font-semibold tracking-tight text-foreground',
        className
      )}
    >
      <span aria-hidden="true" className="block size-2 rounded-full bg-foreground" />
      <span>Contrario</span>
      <span className="font-normal text-muted-foreground">Notes</span>
    </Link>
  )
}
