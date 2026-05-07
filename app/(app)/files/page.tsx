import { FolderOpen } from 'lucide-react'

import { EmptyState } from '@/components/states'

export default function FilesPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-micro uppercase tracking-wider text-muted-foreground">Workspace</p>
        <h1 className="text-h1 font-semibold tracking-tight">Files</h1>
        <p className="text-body text-muted-foreground">
          Uploads attached to notes, accessed via short-lived signed URLs.
        </p>
      </header>
      <EmptyState
        icon={FolderOpen}
        title="Coming soon"
        description="Supabase Storage with per-request permission checks lands with the files-logging-agent slice."
      />
    </div>
  )
}
