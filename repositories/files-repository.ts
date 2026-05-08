import { and, desc, eq, isNull } from 'drizzle-orm'
import { files, type DbFile } from '@/db/schema'
import { scopedWhere, withOrgId } from './base-repository'
import type { AnyDb } from './notes-repository'
import type { RequestContext } from './types'

/**
 * Files repository. Org-scoped on every read/write. The storage path is
 * server-derived (see `services/files-service.ts`); callers may not pass
 * a foreign org id.
 *
 * Soft-delete semantics mirror notes: `deleted_at` is set and reads filter
 * it out. The bytes in Supabase Storage are removed eagerly by the service
 * (path-knowledge ≠ access in any case, but we keep the bucket clean).
 */

export type CreateFileInput = {
  noteId: string | null
  filename: string
  mimeType: string
  sizeBytes: number
  storagePath: string
  /** Server-set; the service stamps ctx.userId. */
  uploaderId: string
}

export type FilesRepository = {
  findById(id: string): Promise<DbFile | null>
  /** Live (non-soft-deleted) files attached to a note in the current org. */
  listByNote(noteId: string): Promise<DbFile[]>
  /** Live files visible across the org (no note filter). */
  listForOrg(opts?: { limit?: number }): Promise<DbFile[]>
  create(input: CreateFileInput): Promise<DbFile>
  /** Hard-delete the row. Used by upload rollback when the bytes never landed. */
  hardDelete(id: string): Promise<boolean>
  softDelete(id: string): Promise<boolean>
}

export function createFilesRepository(ctx: RequestContext, db: AnyDb): FilesRepository {
  return {
    async findById(id) {
      const rows = await db
        .select()
        .from(files)
        .where(scopedWhere(ctx, files, eq(files.id, id), isNull(files.deletedAt)))
        .limit(1)
      return rows[0] ?? null
    },

    async listByNote(noteId) {
      return db
        .select()
        .from(files)
        .where(
          scopedWhere(
            ctx,
            files,
            eq(files.noteId, noteId),
            isNull(files.deletedAt),
          ),
        )
        .orderBy(desc(files.createdAt))
    },

    async listForOrg(opts = {}) {
      const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200)
      return db
        .select()
        .from(files)
        .where(scopedWhere(ctx, files, isNull(files.deletedAt)))
        .orderBy(desc(files.createdAt))
        .limit(limit)
    },

    async create(input) {
      const payload = withOrgId(ctx, input)
      const rows = await db.insert(files).values(payload).returning()
      const row = rows[0]
      if (!row) throw new Error('Failed to create file row')
      return row
    },

    async hardDelete(id) {
      const rows = await db
        .delete(files)
        .where(scopedWhere(ctx, files, eq(files.id, id)))
        .returning({ id: files.id })
      return rows.length > 0
    },

    async softDelete(id) {
      const rows = await db
        .update(files)
        .set({ deletedAt: new Date() })
        .where(
          and(scopedWhere(ctx, files, eq(files.id, id), isNull(files.deletedAt)))!,
        )
        .returning({ id: files.id })
      return rows.length > 0
    },
  }
}
