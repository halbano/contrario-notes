import { and, asc, eq, max } from 'drizzle-orm'
import { noteVersions, type DbNoteVersion } from '@/db/schema'
import type { AnyDb } from './notes-repository'
import { scopedWhere, withOrgId } from './base-repository'
import type { RequestContext } from './types'

/**
 * Append-only version snapshots for `notes`. Every successful create or
 * update produces exactly one row here. Versions are monotonically
 * increasing per (org, note) — `version` starts at 1 on creation and the
 * unique index `note_versions_org_note_version_uniq` prevents duplicates.
 *
 * No public delete path: the only way a row leaves this table is via
 * cascade when its parent note is hard-deleted (today notes are
 * soft-deleted, so versions persist forever).
 */
export type CreateVersionInput = {
  noteId: string
  title: string
  content: string
  authorId: string
}

export type NoteVersionsRepository = {
  /**
   * Append a new snapshot for `noteId`. Computes the next `version` number
   * by selecting `max(version) + 1` for that (org, note). Returns the
   * inserted row. Org-scoped via `withOrgId`.
   */
  createVersion(input: CreateVersionInput): Promise<DbNoteVersion>

  /** All versions for `noteId`, oldest first. Org-scoped. */
  listForNote(noteId: string): Promise<DbNoteVersion[]>

  /** Find a single version by id within the current org. */
  findById(versionId: string): Promise<DbNoteVersion | null>

  /**
   * Fetch two specific versions by id (both must live in the current org
   * AND in `noteId`). Returns `null` if either is missing — used by the
   * diff endpoint to render a structured comparison.
   */
  findPair(
    noteId: string,
    versionAId: string,
    versionBId: string,
  ): Promise<{ a: DbNoteVersion; b: DbNoteVersion } | null>
}

export function createNoteVersionsRepository(
  ctx: RequestContext,
  db: AnyDb,
): NoteVersionsRepository {
  return {
    async createVersion({ noteId, title, content, authorId }) {
      // Compute next version number atomically-ish. Inside a transaction the
      // caller wraps both the notes write and this insert; the unique
      // constraint on (org_id, note_id, version) is the ultimate guard.
      const existing = await db
        .select({ maxVersion: max(noteVersions.version) })
        .from(noteVersions)
        .where(
          scopedWhere(ctx, noteVersions, eq(noteVersions.noteId, noteId)),
        )
      const nextVersion = (existing[0]?.maxVersion ?? 0) + 1
      const payload = withOrgId(ctx, {
        noteId,
        version: nextVersion,
        title,
        content,
        authorId,
      })
      const rows = await db.insert(noteVersions).values(payload).returning()
      const row = rows[0]
      if (!row) throw new Error('Failed to create note_version row')
      return row
    },

    async listForNote(noteId) {
      return db
        .select()
        .from(noteVersions)
        .where(
          scopedWhere(ctx, noteVersions, eq(noteVersions.noteId, noteId)),
        )
        .orderBy(asc(noteVersions.version))
    },

    async findById(versionId) {
      const rows = await db
        .select()
        .from(noteVersions)
        .where(scopedWhere(ctx, noteVersions, eq(noteVersions.id, versionId)))
        .limit(1)
      return rows[0] ?? null
    },

    async findPair(noteId, versionAId, versionBId) {
      const rows = await db
        .select()
        .from(noteVersions)
        .where(
          scopedWhere(ctx, noteVersions, eq(noteVersions.noteId, noteId)),
        )
      const a = rows.find((r) => r.id === versionAId) ?? null
      const b = rows.find((r) => r.id === versionBId) ?? null
      if (!a || !b) return null
      return { a, b }
    },
  }
}
