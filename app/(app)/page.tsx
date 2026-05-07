import { FileText, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/states'

/**
 * Authenticated home placeholder.
 *
 * Demonstrates the EmptyState primitive (DESIGN_INVARIANTS.md invariant 2).
 * Real "recent notes" / dashboard surface is owned by `notes-agent`.
 */
export default function AppHomePage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <header className="space-y-2">
        <p className="text-micro uppercase tracking-widest text-muted-foreground">
          Workspace
        </p>
        <h1 className="text-h1 font-semibold tracking-tight">Welcome back.</h1>
        <p className="text-body text-muted-foreground">
          Your notes, search, files, and AI tools live here. Pick something
          from the sidebar to get started.
        </p>
      </header>

      <EmptyState
        icon={FileText}
        title="No recent notes yet"
        description="Create your first note to start building your team's shared brain."
        action={
          <Button disabled>
            <Plus className="size-4" aria-hidden="true" />
            New note
            <span className="sr-only"> (coming soon)</span>
          </Button>
        }
      />
    </div>
  )
}
