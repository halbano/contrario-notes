import { cn } from '@/lib/utils'
import type { VersionDiff } from '@/services/notes-service'

/**
 * Pure presentation: renders a structured per-segment diff. Added segments
 * highlighted green, removed in red, equal in muted. Server-rendered.
 */
export interface VersionDiffViewProps {
  diff: VersionDiff
  className?: string
}

function Segments({ segments }: { segments: VersionDiff['title'] }) {
  return (
    <pre className="whitespace-pre-wrap rounded border border-border bg-card p-3 text-small">
      {segments.map((s, i) => (
        <span
          key={i}
          className={cn(
            s.kind === 'added' && 'bg-emerald-500/15 text-emerald-700',
            s.kind === 'removed' && 'bg-rose-500/15 text-rose-700 line-through',
            s.kind === 'equal' && 'text-muted-foreground',
          )}
        >
          {s.value}
        </span>
      ))}
    </pre>
  )
}

export function VersionDiffView({ diff, className }: VersionDiffViewProps) {
  return (
    <div className={cn('space-y-4', className)}>
      <header className="flex flex-wrap items-center gap-2 text-small text-muted-foreground">
        <span>
          v{diff.versionA.version} ({new Date(diff.versionA.createdAt).toLocaleString()})
        </span>
        <span aria-hidden="true">→</span>
        <span>
          v{diff.versionB.version} ({new Date(diff.versionB.createdAt).toLocaleString()})
        </span>
      </header>

      <section className="space-y-2">
        <h3 className="text-h4 font-semibold tracking-tight">Title</h3>
        <Segments segments={diff.title} />
      </section>

      <section className="space-y-2">
        <h3 className="text-h4 font-semibold tracking-tight">Content</h3>
        <Segments segments={diff.content} />
      </section>
    </div>
  )
}
