'use client'

import * as React from 'react'
import Link from 'next/link'
import { Download, FileIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { mintFileUrlAction } from '@/features/files/server/files-actions'

/**
 * Org-wide list of files visible to the caller. Each row downloads via a
 * fresh signed URL minted on click.
 */
export interface FileListItem {
  id: string
  filename: string
  mimeType: string
  sizeBytes: number
  noteId: string | null
  noteTitle: string | null
  createdAt: string
}

export interface FileListProps {
  files: FileListItem[]
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function FileList({ files }: FileListProps) {
  const [pendingId, setPendingId] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  async function onDownload(fileId: string) {
    setError(null)
    setPendingId(fileId)
    try {
      const result = await mintFileUrlAction({ fileId })
      if (!result.ok) {
        setError(result.message ?? 'Unable to download.')
        return
      }
      window.location.href = result.data.url
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p role="alert" className="text-small text-destructive">
          {error}
        </p>
      ) : null}
      <ul className="space-y-2">
        {files.map((f) => (
          <li
            key={f.id}
            className="flex items-center justify-between gap-3 rounded border border-border bg-card px-3 py-2"
          >
            <div className="flex min-w-0 items-center gap-2">
              <FileIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0">
                <p className="truncate text-small font-medium">{f.filename}</p>
                <p className="truncate text-micro text-muted-foreground">
                  {f.mimeType} · {formatSize(f.sizeBytes)}
                  {f.noteId && f.noteTitle ? (
                    <>
                      {' · '}
                      <Link
                        className="underline-offset-2 hover:underline"
                        href={`/notes/${f.noteId}`}
                      >
                        {f.noteTitle}
                      </Link>
                    </>
                  ) : null}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onDownload(f.id)}
              disabled={pendingId === f.id}
              aria-label={`Download ${f.filename}`}
            >
              <Download className="size-4" aria-hidden="true" />
              {pendingId === f.id ? 'Loading…' : 'Download'}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
