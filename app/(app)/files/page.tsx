import { FolderOpen } from 'lucide-react'

import { EmptyState } from '@/components/states'
import { getRequestContext } from '@/lib/auth-context'
import { createScopedServices } from '@/services'
import { FileList, type FileListItem } from '@/features/files/components/file-list'

export default async function FilesPage() {
  const ctx = await getRequestContext()
  const services = createScopedServices(ctx)
  const files = await services.files.listVisible()

  // Resolve note titles for files attached to a note. Each note id is
  // service-permission-checked already (listVisible filters out files
  // the caller cannot read).
  const noteIds = Array.from(
    new Set(files.map((f) => f.noteId).filter((v): v is string => Boolean(v))),
  )
  const titlesById = new Map<string, string>()
  await Promise.all(
    noteIds.map(async (id) => {
      const n = await services.notes.findById(id)
      if (n) titlesById.set(n.id, n.title)
    }),
  )

  const items: FileListItem[] = files.map((f) => ({
    id: f.id,
    filename: f.filename,
    mimeType: f.mimeType,
    sizeBytes: f.sizeBytes,
    noteId: f.noteId,
    noteTitle: f.noteId ? titlesById.get(f.noteId) ?? null : null,
    createdAt: f.createdAt.toISOString(),
  }))

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-micro uppercase tracking-wider text-muted-foreground">Workspace</p>
        <h1 className="text-h1 font-semibold tracking-tight">Files</h1>
        <p className="text-body text-muted-foreground">
          Uploads attached to notes, accessed via short-lived signed URLs.
        </p>
      </header>
      {items.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="No files yet"
          description="Upload a file from any note's detail page to see it here."
        />
      ) : (
        <FileList files={items} />
      )}
    </div>
  )
}
