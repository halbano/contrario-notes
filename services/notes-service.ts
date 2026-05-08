import { AppError } from '@/lib/errors'
import {
  canCreateNote,
  canDeleteNote,
  canReadNote,
  canUpdateNote,
} from '@/permissions/note-permissions'
import type { NoteForPermission } from '@/permissions/types'
import type { Repositories } from '@/repositories'
import type { CreateNoteInput } from '@/repositories/notes-repository'
import type { RequestContext } from '@/lib/request-context'
import type { DbNote } from '@/db/schema'
import { LOG_EVENTS, type Logger } from '@/logging'

/** Minimum projection the permission layer needs from a note row. */
function toPermissionView(n: DbNote): NoteForPermission {
  return {
    orgId: n.orgId,
    authorId: n.authorId,
    visibility: n.visibility,
  }
}

export type NotesService = ReturnType<typeof createNotesService>

export function createNotesService(
  ctx: RequestContext,
  repos: Repositories,
  logger: Logger,
) {
  return {
    /** Read one note. Returns null when absent OR when caller can't see it (404 surface). */
    async findById(id: string): Promise<DbNote | null> {
      const row = await repos.notes.findById(id)
      if (!row) return null
      if (!canReadNote(ctx, toPermissionView(row))) {
        logger.log(LOG_EVENTS.PERMISSION_DENIED, {
          orgId: ctx.orgId,
          userId: ctx.userId,
          action: 'note.read',
          noteId: id,
        })
        return null
      }
      return row
    },

    /**
     * List recent visible notes for the current user. Visibility is applied at
     * SQL level via `visibleNotesPredicate` (see repositories/notes-repository
     * #listVisible). No post-filter — ADR-0004 invariant 4.
     */
    async listVisible(opts?: { limit?: number }): Promise<DbNote[]> {
      return repos.notes.listVisible(opts)
    },

    async create(input: CreateNoteInput): Promise<DbNote> {
      if (!canCreateNote(ctx)) {
        logger.log(LOG_EVENTS.PERMISSION_DENIED, {
          orgId: ctx.orgId,
          userId: ctx.userId,
          action: 'note.create',
        })
        throw new AppError('permission_denied', 'You cannot create notes')
      }
      const row = await repos.notes.create({ ...input, authorId: ctx.userId })
      logger.log(LOG_EVENTS.NOTE_CREATED, {
        orgId: ctx.orgId,
        userId: ctx.userId,
        noteId: row.id,
      })
      return row
    },

    async update(
      id: string,
      patch: Partial<Pick<DbNote, 'title' | 'content' | 'visibility' | 'tagsText'>>,
    ): Promise<DbNote> {
      const existing = await repos.notes.findById(id)
      // 404 surface: missing OR forbidden look identical externally.
      if (!existing || !canUpdateNote(ctx, toPermissionView(existing))) {
        logger.log(LOG_EVENTS.PERMISSION_DENIED, {
          orgId: ctx.orgId,
          userId: ctx.userId,
          action: 'note.update',
          noteId: id,
        })
        throw new AppError('not_found', 'Note not found')
      }
      const row = await repos.notes.update(id, patch)
      if (!row) throw new AppError('not_found', 'Note not found')
      logger.log(LOG_EVENTS.NOTE_UPDATED, {
        orgId: ctx.orgId,
        userId: ctx.userId,
        noteId: row.id,
      })
      return row
    },

    async remove(id: string): Promise<void> {
      const existing = await repos.notes.findById(id)
      if (!existing || !canDeleteNote(ctx, toPermissionView(existing))) {
        logger.log(LOG_EVENTS.PERMISSION_DENIED, {
          orgId: ctx.orgId,
          userId: ctx.userId,
          action: 'note.delete',
          noteId: id,
        })
        throw new AppError('not_found', 'Note not found')
      }
      const ok = await repos.notes.softDelete(id)
      if (!ok) throw new AppError('not_found', 'Note not found')
      logger.log(LOG_EVENTS.NOTE_DELETED, {
        orgId: ctx.orgId,
        userId: ctx.userId,
        noteId: id,
      })
    },
  }
}
