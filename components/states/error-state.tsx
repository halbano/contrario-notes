import * as React from 'react'
import { AlertCircle } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

/**
 * Error state primitive (DESIGN_INVARIANTS.md invariant 4).
 * Messages are actionable, not generic. Pair color with icon + text
 * (invariant 5: no color-only status indicators).
 */
export interface ErrorStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string
  /** Actionable description. Avoid "Something went wrong"; say what to do. */
  description: string
  /** Optional retry / recovery affordance. */
  action?: React.ReactNode
}

export function ErrorState({
  title = 'Something needs your attention',
  description,
  action,
  className,
  ...props
}: ErrorStateProps) {
  return (
    <div className={cn('w-full', className)} role="alert" {...props}>
      <Alert variant="destructive">
        <AlertCircle className="size-4" aria-hidden="true" />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>{description}</p>
          {action ? <div>{action}</div> : null}
        </AlertDescription>
      </Alert>
    </div>
  )
}
