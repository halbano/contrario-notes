import { Search } from 'lucide-react'

import { EmptyState } from '@/components/states'

export default function SearchPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-micro uppercase tracking-wider text-muted-foreground">Workspace</p>
        <h1 className="text-h1 font-semibold tracking-tight">Search</h1>
        <p className="text-body text-muted-foreground">
          Permission-safe full-text search across notes.
        </p>
      </header>
      <EmptyState
        icon={Search}
        title="Coming soon"
        description="Postgres FTS with org-scoped + visibility-filtered queries lands with the search-ai-agent slice."
      />
    </div>
  )
}
