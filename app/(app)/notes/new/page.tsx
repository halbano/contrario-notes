import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { getRequestContext } from '@/lib/auth-context'
import { createScopedServices } from '@/services'
import { NoteEditor } from '@/features/notes/components/note-editor'

export default async function NewNotePage() {
  const ctx = await getRequestContext()
  const services = createScopedServices(ctx)
  const tagSuggestions = (await services.notes.listTagsForOrg()).map((t) => t.name)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/notes"
        className="inline-flex items-center gap-1 text-small text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        All notes
      </Link>
      <header className="space-y-1">
        <p className="text-micro uppercase tracking-wider text-muted-foreground">
          New note
        </p>
        <h1 className="text-h1 font-semibold tracking-tight">Create a note</h1>
      </header>
      <NoteEditor mode="create" tagSuggestions={tagSuggestions} />
    </div>
  )
}
