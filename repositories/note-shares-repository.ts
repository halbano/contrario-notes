import { and, asc, eq } from 'drizzle-orm'
import { memberships, noteShares, users, type DbNoteShare } from '@/db/schema'
import { scopedWhere, withOrgId } from './base-repository'
import type { AnyDb } from './notes-repository'
import type { RequestContext } from './types'

/**
 * Display projection of a share row joined with `users`.
 */
export type NoteShareWithUser = DbNoteShare & {
  email: string
  displayName: string | null
}

/**
 * Display projection of an org member joined with `users`. Used by the
 * share picker.
 */
export type OrgMemberSummary = {
  userId: string
  email: string
  displayName: string | null
}

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

  /** All grants joined with their user rows for display. */
  listForNoteWithUsers(noteId: string): Promise<NoteShareWithUser[]>

  /**
   * All members of the current org joined with their user rows. Used by the
   * share picker to populate the "add member" dropdown.
   */
  listOrgMembersWithUsers(): Promise<OrgMemberSummary[]>

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

    async listForNoteWithUsers(noteId) {
      return db
        .select({
          orgId: noteShares.orgId,
          noteId: noteShares.noteId,
          userId: noteShares.userId,
          canEdit: noteShares.canEdit,
          createdAt: noteShares.createdAt,
          email: users.email,
          displayName: users.displayName,
        })
        .from(noteShares)
        .innerJoin(users, eq(users.id, noteShares.userId))
        .where(
          and(
            eq(noteShares.orgId, ctx.orgId),
            eq(noteShares.noteId, noteId),
          )!,
        )
        .orderBy(asc(users.email))
    },

    async listOrgMembersWithUsers() {
      return db
        .select({
          userId: users.id,
          email: users.email,
          displayName: users.displayName,
        })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(eq(memberships.orgId, ctx.orgId))
        .orderBy(asc(users.email))
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
