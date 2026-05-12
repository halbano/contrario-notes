import Link from 'next/link'
import { FileText, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { EmptyState, ErrorState } from '@/components/states'
import { getRequestContext } from '@/lib/auth-context'
import { createScopedServices } from '@/services'
import { NoteList } from '@/features/notes/components/note-list'

/**
 * Authenticated home — recent notes (VAL-15).
 *
 * Server component. Fetches top N visible notes via the same
 * `services.notes.listVisible` path the /notes index uses, then either
 * renders the list or the EmptyState.
 *
 * Note: list visibility goes through the SQL predicate
 * (`permissions/note-visibility-sql.ts`); private/shared filtering is
 * enforced at the DB layer.
 */
export default async function AppHomePage() {
  let notes
  try {
    const ctx = await getRequestContext()
    const services = createScopedServices(ctx)
    notes = await services.notes.listVisible({ limit: 5 })
  } catch {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
        <header className="space-y-2">
          <p className="text-micro uppercase tracking-widest text-muted-foreground">
            Workspace
          </p>
          <h1 className="text-h1 font-semibold tracking-tight">Welcome back.</h1>
        </header>
        <ErrorState
          title="Unable to load notes"
          description="Sign in and try again."
        />
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="text-micro uppercase tracking-widest text-muted-foreground">
            Workspace
          </p>
          <h1 className="text-h1 font-semibold tracking-tight">Welcome back.</h1>
          <p className="text-body text-muted-foreground">
            Your recent notes appear here. Use the sidebar to navigate to
            search, files, or AI.
          </p>
        </div>
        <Button asChild>
          <Link href="/notes/new">
            <Plus className="size-4" aria-hidden="true" />
            New note
          </Link>
        </Button>
      </header>

      {notes.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No recent notes yet"
          description="Create your first note to start building your team's shared brain."
          action={
            <Button asChild>
              <Link href="/notes/new">
                <Plus className="size-4" aria-hidden="true" />
                New note
              </Link>
            </Button>
          }
        />
      ) : (
        <section className="space-y-3">
          <header className="flex items-center justify-between">
            <h2 className="text-h3 font-semibold tracking-tight">Recent</h2>
            <Button asChild variant="ghost" size="sm">
              <Link href="/notes">View all</Link>
            </Button>
          </header>
          <NoteList notes={notes} />
        </section>
      )}
    </div>
  )
}
