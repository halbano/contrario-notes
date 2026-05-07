import * as React from 'react'

import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Loading state primitive (DESIGN_INVARIANTS.md invariant 3).
 * Skeletons preferred over spinners. Renders an accessible status
 * region announced to assistive tech.
 */
export interface LoadingStateProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Number of skeleton rows to render. */
  rows?: number
  /** Visually-hidden label for screen readers (default "Loading"). */
  label?: string
}

export function LoadingState({
  rows = 3,
  label = 'Loading',
  className,
  ...props
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn('w-full space-y-3', className)}
      {...props}
    >
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  )
}
