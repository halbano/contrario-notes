'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Upload } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { uploadFileAction } from '@/features/files/server/files-actions'

/**
 * Standalone upload panel for the /files page.
 *
 * Lets the user upload a file and optionally attach it to one of their
 * visible notes. Server enforces `canAttachToNote`; an unattached upload
 * (noteId='') is allowed for non-viewer roles.
 */
export interface FileUploadPanelProps {
  /** Notes the user can choose to attach to. The server still re-checks
   *  `canAttachToNote` — list members the user can read but not write
   *  will surface a 404 message; we don't pre-filter for write permission
   *  here because that would require loading per-note share grants. */
  notes: { id: string; title: string }[]
}

export function FileUploadPanel({ notes }: FileUploadPanelProps) {
  const router = useRouter()
  const fileInput = React.useRef<HTMLInputElement>(null)
  const [noteId, setNoteId] = React.useState<string>('')
  const [uploading, setUploading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState<string | null>(null)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = fileInput.current?.files?.[0]
    if (!f) {
      setError('Pick a file first.')
      return
    }
    setError(null)
    setSuccess(null)
    setUploading(true)
    try {
      const formData = new FormData()
      formData.set('file', f)
      formData.set('noteId', noteId)
      formData.set('filename', f.name)
      const result = await uploadFileAction(formData)
      if (!result.ok) {
        setError(result.message ?? 'Upload failed.')
        return
      }
      setSuccess(`Uploaded "${f.name}".`)
      if (fileInput.current) fileInput.current.value = ''
      setNoteId('')
      router.refresh()
    } finally {
      setUploading(false)
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-lg border border-border bg-card p-4"
      aria-labelledby="file-upload-heading"
    >
      <header>
        <h2 id="file-upload-heading" className="text-h3 font-semibold tracking-tight">
          Upload a file
        </h2>
        <p className="text-small text-muted-foreground">
          Attach to a note you can access, or leave unattached.
        </p>
      </header>

      {error ? (
        <p role="alert" className="text-small text-destructive">
          {error}
        </p>
      ) : null}
      {success ? (
        <p role="status" className="text-small text-foreground">
          {success}
        </p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-[1fr_minmax(0,260px)] md:items-end">
        <div className="space-y-2">
          <Label htmlFor="upload-file" className="text-small">
            File
          </Label>
          <Input
            id="upload-file"
            ref={fileInput}
            type="file"
            disabled={uploading}
            className="block w-full"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="upload-note" className="text-small">
            Attach to note
          </Label>
          <select
            id="upload-note"
            value={noteId}
            onChange={(e) => setNoteId(e.target.value)}
            disabled={uploading}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">— None (unattached) —</option>
            {notes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.title || 'Untitled'}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-micro text-muted-foreground">
          Allowed: images (PNG/JPEG/WebP/SVG), PDF, plain text, markdown. Max 10 MB.
        </p>
        <Button type="submit" disabled={uploading}>
          <Upload className="size-4" aria-hidden="true" />
          {uploading ? 'Uploading…' : 'Upload'}
        </Button>
      </div>
    </form>
  )
}
