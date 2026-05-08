import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { getRequestContext } from '@/lib/auth-context'
import { createScopedServices } from '@/services'
import { HistoryView } from '@/features/notes/components/history-view'

export default async function NoteHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ a?: string; b?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const ctx = await getRequestContext()
  const services = createScopedServices(ctx)

  const note = await services.notes.findById(id)
  if (!note) notFound()

  const versions = await services.notes.listVersions(id)

  // Default selection: latest two if user didn't pick.
  const sorted = [...versions].sort((a, b) => b.version - a.version)
  const defaultB = sorted[0]?.id
  const defaultA = sorted[1]?.id ?? sorted[0]?.id
  const aId = sp.a ?? defaultA
  const bId = sp.b ?? defaultB
  const diff =
    aId && bId && aId !== bId
      ? await services.notes.diffVersions(id, aId, bId)
      : null

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href={`/notes/${id}`}
        className="inline-flex items-center gap-1 text-small text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        Back to note
      </Link>
      <header className="space-y-1">
        <p className="text-micro uppercase tracking-wider text-muted-foreground">
          History
        </p>
        <h1 className="text-h1 font-semibold tracking-tight">
          {note.title || 'Untitled'}
        </h1>
        <p className="text-body text-muted-foreground">
          {versions.length} {versions.length === 1 ? 'version' : 'versions'}
        </p>
      </header>

      <HistoryView
        noteId={id}
        versions={versions.map((v) => ({
          id: v.id,
          version: v.version,
          createdAt: v.createdAt,
        }))}
        selectedAId={aId}
        selectedBId={bId}
        diff={diff}
      />
    </div>
  )
}
