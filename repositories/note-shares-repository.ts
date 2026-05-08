import { and, eq } from 'drizzle-orm'
import { noteShares, type DbNoteShare } from '@/db/schema'
import { scopedWhere, withOrgId } from './base-repository'
import type { AnyDb } from './notes-repository'
import type { RequestContext } from './types'

/**
 * Per-user share grants for a note whose `visibility = 'shared'`. The
 * SQL-level visibility predicate already consults this table — see
 * `permissions/note-visibility-sql.ts`.
 *
 * Org scoping: every (org_id, note_id, user_id) row is part of the
 * composite PK; the repository never accepts a foreign org id.
 */
export type NoteSharesRepository = {
  /** All grants on `noteId` within the current org. */
  listForNote(noteId: string): Promise<DbNoteShare[]>

  /** Grant `userId` access to `noteId`. Idempotent (PK conflict updates can_edit). */
  grant(input: {
    noteId: string
    userId: string
    canEdit: boolean
  }): Promise<DbNoteShare>

  /** Revoke a grant. Returns true if a row was removed. */
  revoke(noteId: string, userId: string): Promise<boolean>

  /** Convenience: does this user have a grant on this note in the current org? */
  has(noteId: string, userId: string): Promise<boolean>
}

export function createNoteSharesRepository(
  ctx: RequestContext,
  db: AnyDb,
): NoteSharesRepository {
  return {
    async listForNote(noteId) {
      return db
        .select()
        .from(noteShares)
        .where(scopedWhere(ctx, noteShares, eq(noteShares.noteId, noteId)))
    },

    async grant({ noteId, userId, canEdit }) {
      const payload = withOrgId(ctx, { noteId, userId, canEdit })
      const rows = await db
        .insert(noteShares)
        .values(payload)
        .onConflictDoUpdate({
          target: [noteShares.orgId, noteShares.noteId, noteShares.userId],
          set: { canEdit },
        })
        .returning()
      const row = rows[0]
      if (!row) throw new Error('Failed to upsert note_share')
      return row
    },

    async revoke(noteId, userId) {
      const rows = await db
        .delete(noteShares)
        .where(
          and(
            eq(noteShares.orgId, ctx.orgId),
            eq(noteShares.noteId, noteId),
            eq(noteShares.userId, userId),
          )!,
        )
        .returning({ userId: noteShares.userId })
      return rows.length > 0
    },

    async has(noteId, userId) {
      const rows = await db
        .select({ userId: noteShares.userId })
        .from(noteShares)
        .where(
          and(
            eq(noteShares.orgId, ctx.orgId),
            eq(noteShares.noteId, noteId),
            eq(noteShares.userId, userId),
          )!,
        )
        .limit(1)
      return rows.length > 0
    },
  }
}
