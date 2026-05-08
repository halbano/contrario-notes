/**
 * Files generator. ~15% of notes get one or more synthetic file rows. We
 * insert directly into `files` because the file-upload service path is
 * owned by the files-logging-agent and not yet stable on this branch.
 * Every row carries the same `org_id` as its note, and `uploader_id` is
 * the note's author so cross-org leakage is structurally impossible.
 *
 * Bytes are placeholder PNG-shaped buffers — small (1KB) so even the full
 * profile only generates a few MB of payload total. We do NOT write to
 * Supabase Storage (no `storage_path` is dereferenced from `files` rows
 * today); the `storage_path` column is a deterministic synthetic key.
 */
import { files as filesTable } from '@/db/schema'
import type { AnyDb } from '@/repositories'
import { pick, randInt, type Rng } from '../lib/random'
import type { SeededNote } from './notes'

export type SeededFile = {
  id: string
  orgId: string
  noteId: string
  uploaderId: string
  storagePath: string
  filename: string
  mimeType: string
  sizeBytes: number
}

const ALLOWLISTED_MIME = [
  { mime: 'image/png', ext: 'png' },
  { mime: 'image/jpeg', ext: 'jpg' },
  { mime: 'application/pdf', ext: 'pdf' },
  { mime: 'text/plain', ext: 'txt' },
] as const

export async function seedFiles(opts: {
  db: AnyDb
  rng: Rng
  notes: readonly SeededNote[]
  /** Fraction of notes that should get >=1 file. Default 0.15. */
  attachRate?: number
}): Promise<SeededFile[]> {
  const attachRate = opts.attachRate ?? 0.15
  const rows: SeededFile[] = []
  let counter = 0
  for (const note of opts.notes) {
    if (opts.rng() >= attachRate) continue
    const fileCount = randInt(opts.rng, 1, 2)
    for (let i = 0; i < fileCount; i++) {
      counter += 1
      const kind = pick(opts.rng, ALLOWLISTED_MIME)
      const id = synthFileId(counter)
      rows.push({
        id,
        orgId: note.orgId,
        noteId: note.id,
        uploaderId: note.authorId,
        storagePath: `seed/${note.orgId}/${note.id}/${id}.${kind.ext}`,
        filename: `attachment-${counter}.${kind.ext}`,
        mimeType: kind.mime,
        sizeBytes: 1024,
      })
    }
  }
  if (rows.length === 0) return rows
  // Bulk insert — file rows are flat metadata; no service codepath to
  // exercise here. Justified by performance for the full profile.
  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK)
    await opts.db.insert(filesTable).values(slice).onConflictDoNothing()
  }
  return rows
}

function synthFileId(idx: number): string {
  // RFC 4122 v4 shape; idx encoded in the trailing 12 chars.
  const idxHex = idx.toString(16).padStart(12, '0')
  return `00000000-0000-4000-8000-${idxHex}`
}
