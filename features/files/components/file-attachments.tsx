'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Download, FileIcon, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  deleteFileAction,
  mintFileUrlAction,
  uploadFileAction,
} from '@/features/files/server/files-actions'

/**
 * "Files" section on a note detail page. Lists existing attachments,
 * lets the caller upload new ones, and downloads via fresh signed URLs
 * (each click mints a new URL — never cached).
 */
export interface FileAttachment {
  id: string
  filename: string
  mimeType: string
  sizeBytes: number
  uploaderId: string
  createdAt: string
}

export interface FileAttachmentsProps {
  noteId: string
  files: FileAttachment[]
  /**
   * Whether the current user may upload / delete attachments. The host
   * page computes this server-side via canWriteFile against the note.
   */
  canWrite: boolean
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function FileAttachments({ noteId, files, canWrite }: FileAttachmentsProps) {
  const router = useRouter()
  const fileInput = React.useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [pendingId, setPendingId] = React.useState<string | null>(null)

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setError(null)
    setUploading(true)
    try {
      const formData = new FormData()
      formData.set('file', f)
      formData.set('noteId', noteId)
      formData.set('filename', f.name)
      const result = await uploadFileAction(formData)
      if (!result.ok) {
        setError(result.message ?? 'Upload failed.')
      } else {
        router.refresh()
      }
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function onDownload(fileId: string) {
    setError(null)
    setPendingId(fileId)
    try {
      const result = await mintFileUrlAction({ fileId })
      if (!result.ok) {
        setError(result.message ?? 'Unable to download.')
        return
      }
      // Fresh URL — never store, never reuse.
      window.location.href = result.data.url
    } finally {
      setPendingId(null)
    }
  }

  async function onDelete(fileId: string) {
    if (!window.confirm('Delete this file? This cannot be undone.')) return
    setError(null)
    setPendingId(fileId)
    try {
      const result = await deleteFileAction({ fileId })
      if (!result.ok) {
        setError(result.message ?? 'Unable to delete.')
      } else {
        router.refresh()
      }
    } finally {
      setPendingId(null)
    }
  }

  return (
    <section
      aria-labelledby="file-attachments-heading"
      className="space-y-4 rounded-lg border border-border bg-card p-4"
    >
      <header className="flex items-center justify-between">
        <div>
          <h2 id="file-attachments-heading" className="text-h3 font-semibold tracking-tight">
            Files
          </h2>
          <p className="text-small text-muted-foreground">
            Attached files. Downloads use short-lived signed URLs.
          </p>
        </div>
      </header>

      {error ? (
        <p role="alert" className="text-small text-destructive">
          {error}
        </p>
      ) : null}

      {files.length === 0 ? (
        <p className="text-small text-muted-foreground">No files attached.</p>
      ) : (
        <ul className="space-y-2">
          {files.map((f) => (
            <li
              key={f.id}
              className="flex items-center justify-between gap-3 rounded border border-border px-3 py-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <FileIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="truncate text-small font-medium">{f.filename}</p>
                  <p className="truncate text-micro text-muted-foreground">
                    {f.mimeType} · {formatSize(f.sizeBytes)}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
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
                {canWrite ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onDelete(f.id)}
                    disabled={pendingId === f.id}
                    aria-label={`Delete ${f.filename}`}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canWrite ? (
        <div className="space-y-2 border-t border-border pt-3">
          <Label htmlFor="file-upload" className="text-small">
            Upload a file
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id="file-upload"
              ref={fileInput}
              type="file"
              onChange={onUpload}
              disabled={uploading}
              className="block w-full"
            />
            {uploading ? (
              <span
                aria-live="polite"
                className="inline-flex items-center gap-1 text-small text-muted-foreground"
              >
                <Upload className="size-4 animate-pulse" aria-hidden="true" />
                Uploading…
              </span>
            ) : null}
          </div>
          <p className="text-micro text-muted-foreground">
            Allowed: images (PNG/JPEG/WebP/SVG), PDF, plain text, markdown. Max 10 MB.
          </p>
        </div>
      ) : null}
    </section>
  )
}
