import { AppError } from '@/lib/errors'
import {
  canAttachToNote,
  canReadFile,
  canWriteFile,
} from '@/permissions/file-permissions'
import { canReadNote } from '@/permissions/note-permissions'
import type { FileForPermission, NoteForPermission } from '@/permissions/types'
import type { Repositories } from '@/repositories'
import type { DbFile, DbNote } from '@/db/schema'
import type { RequestContext } from '@/lib/request-context'
import { LOG_EVENTS, type Logger } from '@/logging'
import type { AuditWriter } from '@/logging/audit'
import {
  FILES_BUCKET,
  MAX_SIGNED_URL_TTL_SECONDS,
  createSupabaseFileStorage,
  type FileStorage,
} from './files-storage'

/**
 * File upload, read, delete. Every read mints a fresh signed URL after a
 * permission check (ADR-0005). The bucket is private; path knowledge alone
 * grants no access.
 */

/** v1 cap. Increase via env once we have a streaming uploader. */
export const MAX_FILE_BYTES = Number(process.env.FILES_MAX_BYTES ?? 10 * 1024 * 1024)

export const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'text/plain',
  'text/markdown',
])

/** Default TTL for signed reads. ADR-0005 caps at 5 min. */
export const SIGNED_URL_TTL_SECONDS = 300

function toPermissionView(n: DbNote): NoteForPermission {
  return {
    orgId: n.orgId,
    authorId: n.authorId,
    visibility: n.visibility,
  }
}

function toFilePermissionView(f: DbFile, parent: NoteForPermission | null): FileForPermission {
  return {
    orgId: f.orgId,
    uploaderId: f.uploaderId,
    parentNote: parent,
  }
}

/**
 * Sanitize a user-supplied filename for the storage path. We keep the
 * extension but strip path separators, control chars, and limit length.
 * The file_id prefix in the path guarantees uniqueness regardless.
 */
function sanitizeFilename(name: string): string {
  const trimmed = name.trim()
  // Remove path separators / null bytes / leading dots.
  const safe = trimmed
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f/\\]+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 200)
  return safe.length > 0 ? safe : 'file'
}

export function buildStoragePath(opts: {
  orgId: string
  noteId: string | null
  fileId: string
  filename: string
}): string {
  const safe = sanitizeFilename(opts.filename)
  if (opts.noteId) {
    return `org/${opts.orgId}/note/${opts.noteId}/${opts.fileId}-${safe}`
  }
  return `org/${opts.orgId}/standalone/${opts.fileId}-${safe}`
}

export type CreateFilesServiceDeps = {
  storage?: FileStorage
  audit?: AuditWriter
  /** UUID source — overridable for deterministic tests. */
  newId?: () => string
}

export type FilesService = ReturnType<typeof createFilesService>

export function createFilesService(
  ctx: RequestContext,
  repos: Repositories,
  logger: Logger,
  deps: CreateFilesServiceDeps = {},
) {
  const storage = deps.storage ?? createSupabaseFileStorage()
  const newId = deps.newId ?? (() => globalThis.crypto.randomUUID())

  async function loadNoteOrThrow(noteId: string): Promise<DbNote> {
    const note = await repos.notes.findById(noteId)
    if (!note) {
      throw new AppError('not_found', 'Note not found')
    }
    return note
  }

  async function fetchParentNote(file: DbFile): Promise<DbNote | null> {
    if (!file.noteId) return null
    return repos.notes.findById(file.noteId)
  }

  return {
    /**
     * Upload bytes + create the row.
     *
     * Order:
     *  1. Validate input.
     *  2. Permission check (canAttachToNote against the parent note).
     *  3. Insert files row first → get fileId.
     *  4. Upload bytes to storage at the org-scoped path.
     *  5. On storage failure: hard-delete the row (rollback).
     *  6. Audit + return.
     */
    async upload(input: {
      noteId: string | null
      filename: string
      mimeType: string
      bytes: Uint8Array
    }): Promise<DbFile> {
      // ---- validation ----
      if (!input.filename || input.filename.trim().length === 0) {
        throw new AppError('invalid_input', 'Filename required')
      }
      if (!ALLOWED_MIME_TYPES.has(input.mimeType)) {
        throw new AppError('invalid_input', `MIME type not allowed: ${input.mimeType}`)
      }
      const sizeBytes = input.bytes.byteLength
      if (sizeBytes <= 0) {
        throw new AppError('invalid_input', 'Empty file')
      }
      if (sizeBytes > MAX_FILE_BYTES) {
        throw new AppError(
          'invalid_input',
          `File exceeds size limit of ${MAX_FILE_BYTES} bytes`,
        )
      }

      // ---- permission ----
      let parentNote: DbNote | null = null
      let parentView: NoteForPermission | null = null
      if (input.noteId) {
        parentNote = await loadNoteOrThrow(input.noteId)
        parentView = toPermissionView(parentNote)
      }
      if (!canAttachToNote(ctx, parentView)) {
        logger.log(LOG_EVENTS.PERMISSION_DENIED, {
          orgId: ctx.orgId,
          userId: ctx.userId,
          action: 'file.upload',
          noteId: input.noteId,
        })
        throw new AppError('not_found', 'Note not found')
      }

      // ---- create row first ----
      const fileId = newId()
      const storagePath = buildStoragePath({
        orgId: ctx.orgId,
        noteId: input.noteId,
        fileId,
        filename: input.filename,
      })
      const row = await repos.files.create({
        noteId: input.noteId,
        filename: input.filename,
        mimeType: input.mimeType,
        sizeBytes,
        storagePath,
        uploaderId: ctx.userId,
      })

      // ---- upload bytes; rollback on failure ----
      try {
        await storage.upload(storagePath, input.bytes, input.mimeType)
      } catch (err) {
        await repos.files.hardDelete(row.id).catch(() => undefined)
        logger.error('file.upload_failed', {
          orgId: ctx.orgId,
          userId: ctx.userId,
          storagePath,
          error: err instanceof Error ? err.message : String(err),
        })
        throw new AppError('internal', 'File upload failed', { cause: err })
      }

      // ---- audit ----
      const audit = deps.audit
      if (audit) {
        await audit(LOG_EVENTS.FILE_UPLOADED, {
          event: LOG_EVENTS.FILE_UPLOADED,
          entityType: 'file',
          entityId: row.id,
          payload: {
            noteId: input.noteId,
            mimeType: input.mimeType,
            sizeBytes,
          },
        })
      } else {
        logger.log(LOG_EVENTS.FILE_UPLOADED, {
          orgId: ctx.orgId,
          userId: ctx.userId,
          fileId: row.id,
          noteId: input.noteId,
          mimeType: input.mimeType,
          sizeBytes,
        })
      }

      return row
    },

    /**
     * Permission-checked metadata read. Returns null when the file does not
     * exist OR the caller cannot see it (no existence disclosure).
     */
    async findById(fileId: string): Promise<DbFile | null> {
      const file = await repos.files.findById(fileId)
      if (!file) return null
      const parent = await fetchParentNote(file)
      const parentView = parent ? toPermissionView(parent) : null
      if (!canReadFile(ctx, toFilePermissionView(file, parentView), parentView)) {
        return null
      }
      return file
    },

    /** Files visible to the caller across the org. */
    async listVisible(): Promise<DbFile[]> {
      const candidates = await repos.files.listForOrg({ limit: 200 })
      const result: DbFile[] = []
      // Bulk-load parents to avoid N round-trips for the 90% case.
      const noteIds = Array.from(
        new Set(candidates.map((f) => f.noteId).filter((v): v is string => Boolean(v))),
      )
      const notesById = new Map<string, DbNote>()
      for (const id of noteIds) {
        const n = await repos.notes.findById(id)
        if (n) notesById.set(n.id, n)
      }
      for (const f of candidates) {
        const parent = f.noteId ? notesById.get(f.noteId) ?? null : null
        const parentView = parent ? toPermissionView(parent) : null
        if (canReadFile(ctx, toFilePermissionView(f, parentView), parentView)) {
          result.push(f)
        }
      }
      return result
    },

    /** Files attached to a note the caller may read. */
    async listForNote(noteId: string): Promise<DbFile[]> {
      const note = await repos.notes.findById(noteId)
      if (!note || !canReadNote(ctx, toPermissionView(note))) return []
      return repos.files.listByNote(noteId)
    },

    /**
     * Mint a fresh signed URL for the file. Permission check runs every
     * call; the URL is short-lived and never cached.
     */
    async mintSignedUrl(
      fileId: string,
      opts: { ttlSeconds?: number } = {},
    ): Promise<{ url: string; expiresAt: Date }> {
      const ttl = Math.min(
        Math.max(opts.ttlSeconds ?? SIGNED_URL_TTL_SECONDS, 1),
        MAX_SIGNED_URL_TTL_SECONDS,
      )
      const file = await repos.files.findById(fileId)
      if (!file) {
        throw new AppError('not_found', 'File not found')
      }
      const parent = await fetchParentNote(file)
      const parentView = parent ? toPermissionView(parent) : null
      if (!canReadFile(ctx, toFilePermissionView(file, parentView), parentView)) {
        logger.log(LOG_EVENTS.PERMISSION_DENIED, {
          orgId: ctx.orgId,
          userId: ctx.userId,
          action: 'file.read',
          fileId,
        })
        throw new AppError('not_found', 'File not found')
      }
      const url = await storage.createSignedUrl(file.storagePath, ttl)
      const expiresAt = new Date(Date.now() + ttl * 1000)

      const audit = deps.audit
      if (audit) {
        await audit(LOG_EVENTS.FILE_READ, {
          event: LOG_EVENTS.FILE_READ,
          entityType: 'file',
          entityId: file.id,
          payload: { ttlSeconds: ttl, noteId: file.noteId },
        })
      } else {
        logger.log(LOG_EVENTS.FILE_READ, {
          orgId: ctx.orgId,
          userId: ctx.userId,
          fileId: file.id,
          noteId: file.noteId,
          ttlSeconds: ttl,
        })
      }
      return { url, expiresAt }
    },

    /**
     * Soft-delete the row + remove bytes from storage. Storage failures
     * are logged but do not block the row delete (a janitor reconciles).
     */
    async remove(fileId: string): Promise<void> {
      const file = await repos.files.findById(fileId)
      if (!file) {
        throw new AppError('not_found', 'File not found')
      }
      const parent = await fetchParentNote(file)
      const parentView = parent ? toPermissionView(parent) : null
      if (!canWriteFile(ctx, toFilePermissionView(file, parentView), parentView)) {
        logger.log(LOG_EVENTS.PERMISSION_DENIED, {
          orgId: ctx.orgId,
          userId: ctx.userId,
          action: 'file.delete',
          fileId,
        })
        throw new AppError('not_found', 'File not found')
      }
      try {
        await storage.remove(file.storagePath)
      } catch (err) {
        logger.warn('file.storage_remove_failed', {
          orgId: ctx.orgId,
          userId: ctx.userId,
          fileId: file.id,
          storagePath: file.storagePath,
          error: err instanceof Error ? err.message : String(err),
        })
      }
      const ok = await repos.files.softDelete(file.id)
      if (!ok) throw new AppError('not_found', 'File not found')

      const audit = deps.audit
      if (audit) {
        await audit(LOG_EVENTS.FILE_DELETED, {
          event: LOG_EVENTS.FILE_DELETED,
          entityType: 'file',
          entityId: file.id,
          payload: { noteId: file.noteId },
        })
      } else {
        logger.log(LOG_EVENTS.FILE_DELETED, {
          orgId: ctx.orgId,
          userId: ctx.userId,
          fileId: file.id,
          noteId: file.noteId,
        })
      }
    },
  }
}

export { FILES_BUCKET, MAX_SIGNED_URL_TTL_SECONDS }
