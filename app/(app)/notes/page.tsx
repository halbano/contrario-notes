import { FileText } from 'lucide-react'

import { EmptyState } from '@/components/states'

export default function NotesPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-micro uppercase tracking-wider text-muted-foreground">Workspace</p>
        <h1 className="text-h1 font-semibold tracking-tight">Notes</h1>
        <p className="text-body text-muted-foreground">
          Notes, versions, and tags will live here.
        </p>
      </header>
      <EmptyState
        icon={FileText}
        title="Coming soon"
        description="Notes CRUD, tagging, visibility, and version history land with the notes-agent slice."
      />
    </div>
  )
}
