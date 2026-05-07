import * as React from 'react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Empty state primitive (DESIGN_INVARIANTS.md invariant 2).
 * Always include a clear next action via `action`.
 */
export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: LucideIcon
  title: string
  description?: string
  /** Primary action — required by invariant 2 unless intentionally read-only. */
  action?: React.ReactNode
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border bg-card p-8 text-center',
        className
      )}
      {...props}
    >
      {Icon ? (
        <div className="rounded-full bg-muted p-3 text-muted-foreground" aria-hidden="true">
          <Icon className="size-6" />
        </div>
      ) : null}
      <div className="space-y-1">
        <h3 className="text-h4 font-semibold tracking-tight">{title}</h3>
        {description ? (
          <p className="text-small text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  )
}
