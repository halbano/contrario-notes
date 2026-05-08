import Link from 'next/link'
import { Lock, Globe, UsersRound } from 'lucide-react'
import type { DbNote } from '@/db/schema'
import { cn } from '@/lib/utils'

/**
 * Compact list-row card for a note. Server-rendered. Visibility is shown
 * with an inline icon — no extra round-trips.
 */
export interface NoteCardProps {
  note: DbNote
  className?: string
}

const visibilityMeta: Record<DbNote['visibility'], { icon: typeof Lock; label: string }> = {
  private: { icon: Lock, label: 'Private' },
  org: { icon: Globe, label: 'Org' },
  shared: { icon: UsersRound, label: 'Shared' },
}

export function NoteCard({ note, className }: NoteCardProps) {
  const meta = visibilityMeta[note.visibility]
  const Icon = meta.icon
  const preview =
    note.content.length > 160
      ? note.content.slice(0, 160).trimEnd() + '…'
      : note.content
  return (
    <Link
      href={`/notes/${note.id}`}
      className={cn(
        'block rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-h4 font-semibold tracking-tight line-clamp-1">
          {note.title || 'Untitled'}
        </h3>
        <span
          className="flex shrink-0 items-center gap-1 text-micro uppercase tracking-wider text-muted-foreground"
          aria-label={`Visibility: ${meta.label}`}
        >
          <Icon className="size-3.5" aria-hidden="true" />
          {meta.label}
        </span>
      </div>
      {preview ? (
        <p className="mt-2 text-small text-muted-foreground line-clamp-2">
          {preview}
        </p>
      ) : null}
      <p className="mt-3 text-micro text-muted-foreground">
        Updated {new Date(note.updatedAt).toLocaleDateString()}
      </p>
    </Link>
  )
}
