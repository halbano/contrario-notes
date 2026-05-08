import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getRequestContext } from '@/lib/auth-context'
import { createScopedServices } from '@/services'
import { NoteEditor } from '@/features/notes/components/note-editor'
import { SharePanel } from '@/features/notes/components/share-panel'
import { FileAttachments } from '@/features/files/components/file-attachments'
import { canAttachToNote } from '@/permissions/file-permissions'

export default async function NoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const ctx = await getRequestContext()
  const services = createScopedServices(ctx)
  const note = await services.notes.findById(id)
  if (!note) notFound()

  const [tagSuggestions, attachedTags] = await Promise.all([
    services.notes.listTagsForOrg().then((tags) => tags.map((t) => t.name)),
    services.notes.listTagsForNote(id).then((tags) => tags.map((t) => t.name)),
  ])

  const canShare = services.notes.canShare(note)
  const [shares, orgMembers] = canShare
    ? await Promise.all([
        services.notes.listSharesWithUsers(id),
        services.notes.listOrgMembers(),
      ])
    : [[], []]

  const attachedFiles = await services.files.listForNote(id)

  const isOwner = note.authorId === ctx.userId
  const canEdit = isOwner || ctx.role === 'admin'
  const canWriteFiles = canAttachToNote(ctx, {
    orgId: note.orgId,
    authorId: note.authorId,
    visibility: note.visibility,
  })

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Link
            href="/notes"
            className="inline-flex items-center gap-1 text-small text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            All notes
          </Link>
          <Button asChild variant="outline" size="sm">
            <Link href={`/notes/${id}/history`}>
              <History className="size-4" aria-hidden="true" />
              History
            </Link>
          </Button>
        </div>

        <header className="space-y-1">
          <p className="text-micro uppercase tracking-wider text-muted-foreground">
            Note
          </p>
          <h1 className="text-h1 font-semibold tracking-tight">
            {note.title || 'Untitled'}
          </h1>
        </header>

        {canEdit ? (
          <NoteEditor
            mode="edit"
            note={{
              id: note.id,
              title: note.title,
              content: note.content,
              visibility: note.visibility,
            }}
            initialTags={attachedTags}
            tagSuggestions={tagSuggestions}
            showDelete={isOwner || ctx.role === 'admin'}
          />
        ) : (
          <article className="space-y-3 rounded-lg border border-border bg-card p-4">
            <p className="whitespace-pre-wrap text-body">{note.content}</p>
            {attachedTags.length > 0 ? (
              <p className="text-small text-muted-foreground">
                Tags: {attachedTags.join(', ')}
              </p>
            ) : null}
          </article>
        )}

        <FileAttachments
          noteId={id}
          canWrite={canWriteFiles}
          files={attachedFiles.map((f) => ({
            id: f.id,
            filename: f.filename,
            mimeType: f.mimeType,
            sizeBytes: f.sizeBytes,
            uploaderId: f.uploaderId,
            createdAt: f.createdAt.toISOString(),
          }))}
        />
      </div>

      {canShare ? (
        <aside className="space-y-4">
          <SharePanel
            noteId={id}
            shares={shares.map((s) => ({
              userId: s.userId,
              email: s.email,
              displayName: s.displayName,
              canEdit: s.canEdit,
            }))}
            orgMembers={orgMembers}
          />
        </aside>
      ) : null}
    </div>
  )
}
