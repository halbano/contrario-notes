import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/states'
import { getRequestContext } from '@/lib/auth-context'
import { createScopedServices } from '@/services'
import { NoteList } from '@/features/notes/components/note-list'

export default async function NotesPage() {
  let notes
  try {
    const ctx = await getRequestContext()
    const services = createScopedServices(ctx)
    notes = await services.notes.listVisible({ limit: 100 })
  } catch {
    return (
      <div className="space-y-6">
        <header className="space-y-2">
          <p className="text-micro uppercase tracking-wider text-muted-foreground">
            Workspace
          </p>
          <h1 className="text-h1 font-semibold tracking-tight">Notes</h1>
        </header>
        <ErrorState
          title="Unable to load notes"
          description="Sign in and try again."
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-micro uppercase tracking-wider text-muted-foreground">
            Workspace
          </p>
          <h1 className="text-h1 font-semibold tracking-tight">Notes</h1>
          <p className="text-body text-muted-foreground">
            {notes.length} {notes.length === 1 ? 'note' : 'notes'}
          </p>
        </div>
        <Button asChild>
          <Link href="/notes/new">
            <Plus className="size-4" aria-hidden="true" />
            New note
          </Link>
        </Button>
      </header>

      <NoteList notes={notes} />
    </div>
  )
}
