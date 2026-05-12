import { FolderOpen } from 'lucide-react'

import { EmptyState } from '@/components/states'
import { getRequestContext } from '@/lib/auth-context'
import { createScopedServices } from '@/services'
import { FileList, type FileListItem } from '@/features/files/components/file-list'
import { FileUploadPanel } from '@/features/files/components/file-upload-panel'

export default async function FilesPage() {
  const ctx = await getRequestContext()
  const services = createScopedServices(ctx)
  const [files, visibleNotes] = await Promise.all([
    services.files.listVisible(),
    // 200 is a reasonable ceiling for the dropdown — for orgs with more
    // notes, users still upload from the note's detail page.
    services.notes.listVisible({ limit: 200 }),
  ])

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

  const canUpload = ctx.role !== 'viewer'
  const pickerNotes = visibleNotes.map((n) => ({ id: n.id, title: n.title }))

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-micro uppercase tracking-wider text-muted-foreground">Workspace</p>
        <h1 className="text-h1 font-semibold tracking-tight">Files</h1>
        <p className="text-body text-muted-foreground">
          Uploads attached to notes, accessed via short-lived signed URLs.
        </p>
      </header>

      {canUpload ? <FileUploadPanel notes={pickerNotes} /> : null}

      {items.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="No files yet"
          description={
            canUpload
              ? 'Upload above or attach a file from any note’s detail page.'
              : 'Files attached to notes you can read will appear here.'
          }
        />
      ) : (
        <FileList files={items} />
      )}
    </div>
  )
}
