import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * Card wrapper for the auth screens. Restrained, typographic — see
 * DESIGN_INVARIANTS.md.
 */
export function AuthCard({
  title,
  description,
  children,
  footer,
  className,
}: {
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        'rounded-lg border border-border bg-card p-6 shadow-sm md:p-8',
        className
      )}
    >
      <div className="mb-6 space-y-1.5">
        <h1 className="text-h2 font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="text-small text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
      {footer ? (
        <div className="mt-6 border-t border-border pt-4 text-small text-muted-foreground">
          {footer}
        </div>
      ) : null}
    </section>
  )
}
