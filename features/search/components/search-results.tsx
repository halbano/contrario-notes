import Link from 'next/link'
import { Lock, Globe, UsersRound } from 'lucide-react'
import type { DbNote } from '@/db/schema'

/**
 * Renders one search hit. Server component.
 *
 * The list shape mirrors `features/notes/components/note-list.tsx` so
 * search/list use the same visual language.
 */

const visibilityMeta: Record<DbNote['visibility'], { icon: typeof Lock; label: string }> = {
  private: { icon: Lock, label: 'Private' },
  org: { icon: Globe, label: 'Org' },
  shared: { icon: UsersRound, label: 'Shared' },
}

function snippet(content: string, query: string): string {
  if (!content) return ''
  const lower = content.toLowerCase()
  const needle = query.trim().toLowerCase().split(/\s+/)[0] ?? ''
  if (!needle) {
    return content.length > 200 ? content.slice(0, 200).trimEnd() + '…' : content
  }
  const idx = lower.indexOf(needle)
  if (idx < 0) {
    return content.length > 200 ? content.slice(0, 200).trimEnd() + '…' : content
  }
  const start = Math.max(0, idx - 80)
  const end = Math.min(content.length, idx + 120)
  const head = start > 0 ? '…' : ''
  const tail = end < content.length ? '…' : ''
  return head + content.slice(start, end) + tail
}

export interface SearchResultsProps {
  results: DbNote[]
  query: string
}

export function SearchResults({ results, query }: SearchResultsProps) {
  return (
    <section aria-label="Search results" className="space-y-3">
      <p className="text-small text-muted-foreground">
        {results.length} {results.length === 1 ? 'result' : 'results'} for{' '}
        <span className="font-medium text-foreground">“{query}”</span>
      </p>
      <ul className="grid gap-3">
        {results.map((note) => {
          const meta = visibilityMeta[note.visibility]
          const Icon = meta.icon
          const tags = note.tagsText
            .split(/\s+/)
            .map((t) => t.trim())
            .filter(Boolean)
          return (
            <li key={note.id}>
              <Link
                href={`/notes/${note.id}`}
                className="block rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                {note.content ? (
                  <p className="mt-2 text-small text-muted-foreground line-clamp-3">
                    {snippet(note.content, query)}
                  </p>
                ) : null}
                {tags.length > 0 ? (
                  <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Tags">
                    {tags.slice(0, 6).map((t) => (
                      <li
                        key={t}
                        className="rounded-full border border-border bg-muted px-2 py-0.5 text-micro text-muted-foreground"
                      >
                        {t}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
