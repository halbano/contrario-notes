import Link from 'next/link'
import { FileText, Plus } from 'lucide-react'
import type { DbNote } from '@/db/schema'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/states'
import { NoteCard } from './note-card'

/**
 * Renders the visible notes for the current user. Empty state advertises
 * the "New note" action to satisfy DESIGN_INVARIANTS invariant 2.
 */
export interface NoteListProps {
  notes: DbNote[]
}

export function NoteList({ notes }: NoteListProps) {
  if (notes.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No notes yet"
        description="Create your first note to get started."
        action={
          <Button asChild>
            <Link href="/notes/new">
              <Plus className="size-4" aria-hidden="true" />
              New note
            </Link>
          </Button>
        }
      />
    )
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {notes.map((note) => (
        <li key={note.id}>
          <NoteCard note={note} />
        </li>
      ))}
    </ul>
  )
}
