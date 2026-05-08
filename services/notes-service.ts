import { AppError } from '@/lib/errors'
import {
  canCreateNote,
  canDeleteNote,
  canReadNote,
  canUpdateNote,
} from '@/permissions/note-permissions'
import type { NoteForPermission } from '@/permissions/types'
import type { Repositories } from '@/repositories'
import { createRepositories } from '@/repositories'
import type { CreateNoteInput } from '@/repositories/notes-repository'
import type { RequestContext } from '@/lib/request-context'
import type { DbNote, DbNoteVersion, DbNoteShare, DbTag } from '@/db/schema'
import { LOG_EVENTS, type Logger } from '@/logging'
import type { AuditWriter } from '@/logging/audit'
import { diffLines } from 'diff'

/** Minimum projection the permission layer needs from a note row. */
function toPermissionView(n: DbNote): NoteForPermission {
  return {
    orgId: n.orgId,
    authorId: n.authorId,
    visibility: n.visibility,
  }
}

/** Diff segment used by the version-diff endpoint and UI. */
export type DiffSegment = {
  kind: 'equal' | 'added' | 'removed'
  value: string
}
export type VersionDiff = {
  title: DiffSegment[]
  content: DiffSegment[]
  /** Tags as a sorted comma-joined string (compared via diffLines). */
  tags: { from: string[]; to: string[]; added: string[]; removed: string[] }
  versionA: { id: string; version: number; createdAt: Date }
  versionB: { id: string; version: number; createdAt: Date }
}

function toSegments(parts: { added?: boolean; removed?: boolean; value: string }[]): DiffSegment[] {
  return parts.map((p) => ({
    kind: p.added ? 'added' : p.removed ? 'removed' : 'equal',
    value: p.value,
  }))
}

export type NotesService = ReturnType<typeof createNotesService>

export function createNotesService(
  ctx: RequestContext,
  repos: Repositories,
  logger: Logger,
  audit?: AuditWriter,
) {
  /** Fire-and-forget helper that no-ops when no audit writer is wired. */
  async function recordAudit(
    event: Parameters<NonNullable<typeof audit>>[0],
    input: Parameters<NonNullable<typeof audit>>[1],
  ) {
    if (audit) await audit(event, input)
  }
  // Snapshot helper — runs inside whatever db handle is provided (tx or root).
  // We re-bind a versions repo against that handle so the version row writes
  // in the same transaction.
  async function snapshot(
    txDb: Repositories['db'],
    note: DbNote,
  ): Promise<DbNoteVersion> {
    const txRepos = createRepositories(ctx, txDb)
    const v = await txRepos.noteVersions.createVersion({
      noteId: note.id,
      title: note.title,
      content: note.content,
      authorId: ctx.userId,
    })
    logger.log(LOG_EVENTS.NOTE_VERSION_CREATED, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      noteId: note.id,
      versionId: v.id,
      version: v.version,
    })
    // NOTE: audit_log row is written by the caller AFTER the transaction
    // commits — writing here would deadlock the pglite single-connection
    // test fixture and is also wrong semantically (audit row would commit
    // even if the wrapping tx rolled back).
    return v
  }

  async function recordVersionAudit(noteId: string, versionId: string, version: number) {
    if (!audit) return
    await audit(LOG_EVENTS.NOTE_VERSION_CREATED, {
      event: LOG_EVENTS.NOTE_VERSION_CREATED,
      entityType: 'note_version',
      entityId: versionId,
      payload: { noteId, version },
    })
  }

  // Helper: only the note's author or an org admin may share / unshare.
  function canShareNote(note: DbNote): boolean {
    if (note.orgId !== ctx.orgId) return false
    if (ctx.userId === note.authorId) return true
    if (ctx.role === 'admin') return true
    return false
  }

  return {
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

    async listVisible(opts?: { limit?: number }): Promise<DbNote[]> {
      return repos.notes.listVisible(opts)
    },

    /**
     * Legacy create — preserved for callers that don't yet need a version
     * row. New write paths go through `createWithVersion`.
     */
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
      await recordAudit(LOG_EVENTS.NOTE_CREATED, {
        event: LOG_EVENTS.NOTE_CREATED,
        entityType: 'note',
        entityId: row.id,
        payload: { visibility: row.visibility },
      })
      return row
    },

    /**
     * Create + snapshot atomically. The notes row and the first
     * `note_versions` row (version=1) commit together; if either fails the
     * other rolls back.
     */
    async createWithVersion(input: CreateNoteInput): Promise<DbNote> {
      if (!canCreateNote(ctx)) {
        logger.log(LOG_EVENTS.PERMISSION_DENIED, {
          orgId: ctx.orgId,
          userId: ctx.userId,
          action: 'note.create',
        })
        throw new AppError('permission_denied', 'You cannot create notes')
      }
      const result = await repos.db.transaction(async (tx) => {
        const txRepos = createRepositories(ctx, tx as never)
        const created = await txRepos.notes.create({
          ...input,
          authorId: ctx.userId,
        })
        const ver = await snapshot(tx as never, created)
        return { note: created, version: ver }
      })
      logger.log(LOG_EVENTS.NOTE_CREATED, {
        orgId: ctx.orgId,
        userId: ctx.userId,
        noteId: result.note.id,
      })
      await recordAudit(LOG_EVENTS.NOTE_CREATED, {
        event: LOG_EVENTS.NOTE_CREATED,
        entityType: 'note',
        entityId: result.note.id,
        payload: { visibility: result.note.visibility, withVersion: true },
      })
      await recordVersionAudit(result.note.id, result.version.id, result.version.version)
      return result.note
    },

    async update(
      id: string,
      patch: Partial<Pick<DbNote, 'title' | 'content' | 'visibility' | 'tagsText'>>,
    ): Promise<DbNote> {
      const existing = await repos.notes.findById(id)
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
      await recordAudit(LOG_EVENTS.NOTE_UPDATED, {
        event: LOG_EVENTS.NOTE_UPDATED,
        entityType: 'note',
        entityId: row.id,
        payload: { fields: Object.keys(patch) },
      })
      return row
    },

    /**
     * Update + snapshot atomically. Returns the updated note. Throws
     * `not_found` (404) on missing or forbidden — never `permission_denied`.
     */
    async updateWithVersion(
      id: string,
      patch: Partial<Pick<DbNote, 'title' | 'content' | 'visibility' | 'tagsText'>>,
    ): Promise<DbNote> {
      const existing = await repos.notes.findById(id)
      if (!existing || !canUpdateNote(ctx, toPermissionView(existing))) {
        logger.log(LOG_EVENTS.PERMISSION_DENIED, {
          orgId: ctx.orgId,
          userId: ctx.userId,
          action: 'note.update',
          noteId: id,
        })
        throw new AppError('not_found', 'Note not found')
      }
      const result = await repos.db.transaction(async (tx) => {
        const txRepos = createRepositories(ctx, tx as never)
        const row = await txRepos.notes.update(id, patch)
        if (!row) return null
        const ver = await snapshot(tx as never, row)
        return { note: row, version: ver }
      })
      if (!result) throw new AppError('not_found', 'Note not found')
      logger.log(LOG_EVENTS.NOTE_UPDATED, {
        orgId: ctx.orgId,
        userId: ctx.userId,
        noteId: result.note.id,
      })
      await recordAudit(LOG_EVENTS.NOTE_UPDATED, {
        event: LOG_EVENTS.NOTE_UPDATED,
        entityType: 'note',
        entityId: result.note.id,
        payload: { fields: Object.keys(patch), withVersion: true },
      })
      await recordVersionAudit(result.note.id, result.version.id, result.version.version)
      return result.note
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
      await recordAudit(LOG_EVENTS.NOTE_DELETED, {
        event: LOG_EVENTS.NOTE_DELETED,
        entityType: 'note',
        entityId: id,
        payload: {},
      })
    },

    /** Versions for a note the caller may read. */
    async listVersions(noteId: string): Promise<DbNoteVersion[]> {
      const note = await repos.notes.findById(noteId)
      if (!note || !canReadNote(ctx, toPermissionView(note))) return []
      return repos.noteVersions.listForNote(noteId)
    },

    /** Diff between two version ids on the same note. Returns null when not found / forbidden. */
    async diffVersions(
      noteId: string,
      versionAId: string,
      versionBId: string,
    ): Promise<VersionDiff | null> {
      const note = await repos.notes.findById(noteId)
      if (!note || !canReadNote(ctx, toPermissionView(note))) return null
      const pair = await repos.noteVersions.findPair(
        noteId,
        versionAId,
        versionBId,
      )
      if (!pair) return null
      // Diff library: `diff` (npm: jsdiff). Picked over diff-match-patch
      // because it ships ESM, is line-oriented (matches our display), and
      // has zero deps. https://github.com/kpdecker/jsdiff
      const titleParts = diffLines(pair.a.title + '\n', pair.b.title + '\n')
      const contentParts = diffLines(pair.a.content + '\n', pair.b.content + '\n')
      // Tags aren't snapshot in note_versions today — see issue #15.
      // Fall back to current attachments; added/removed will report empty.
      const currentTags = await repos.tags.listForNote(noteId)
      const names = currentTags.map((t) => t.name).sort()
      return {
        title: toSegments(titleParts),
        content: toSegments(contentParts),
        tags: { from: names, to: names, added: [], removed: [] },
        versionA: {
          id: pair.a.id,
          version: pair.a.version,
          createdAt: pair.a.createdAt,
        },
        versionB: {
          id: pair.b.id,
          version: pair.b.version,
          createdAt: pair.b.createdAt,
        },
      }
    },

    // ---- tags ---------------------------------------------------------------

    /** All tags in the org (autocomplete source). */
    async listTagsForOrg(): Promise<DbTag[]> {
      return repos.tags.listForOrg()
    },

    /** Tags attached to a note the caller may read. */
    async listTagsForNote(noteId: string): Promise<DbTag[]> {
      const note = await repos.notes.findById(noteId)
      if (!note || !canReadNote(ctx, toPermissionView(note))) return []
      return repos.tags.listForNote(noteId)
    },

    /**
     * Replace the tag set on a note. Caller must have update permission on
     * the note. Tag rows are find-or-created in the current org.
     */
    async setNoteTags(noteId: string, tagNames: string[]): Promise<DbTag[]> {
      const note = await repos.notes.findById(noteId)
      if (!note || !canUpdateNote(ctx, toPermissionView(note))) {
        logger.log(LOG_EVENTS.PERMISSION_DENIED, {
          orgId: ctx.orgId,
          userId: ctx.userId,
          action: 'note.tag',
          noteId,
        })
        throw new AppError('not_found', 'Note not found')
      }
      return repos.tags.setTagsForNote(noteId, tagNames)
    },

    // ---- shares -------------------------------------------------------------

    /** List shares for a note the caller may share. */
    async listShares(noteId: string): Promise<DbNoteShare[]> {
      const note = await repos.notes.findById(noteId)
      if (!note || !canShareNote(note)) {
        logger.log(LOG_EVENTS.PERMISSION_DENIED, {
          orgId: ctx.orgId,
          userId: ctx.userId,
          action: 'note.share.list',
          noteId,
        })
        throw new AppError('not_found', 'Note not found')
      }
      return repos.noteShares.listForNote(noteId)
    },

    /**
     * Display-ready shares list (joined with `users`). Same authorization
     * gate as `listShares`.
     */
    async listSharesWithUsers(noteId: string) {
      const note = await repos.notes.findById(noteId)
      if (!note || !canShareNote(note)) return []
      return repos.noteShares.listForNoteWithUsers(noteId)
    },

    /** Org members for the share picker (display-ready). Anyone may read. */
    async listOrgMembers() {
      return repos.noteShares.listOrgMembersWithUsers()
    },

    /** Whether the current user may share `note`. Surface for UI gating. */
    canShare(note: DbNote): boolean {
      return canShareNote(note)
    },

    /**
     * Grant `userId` read (or read+edit) access to `noteId`. Only the note's
     * author or an org admin may grant. Target user MUST be a member of the
     * note's org — enforced server-side.
     */
    async shareNote(input: {
      noteId: string
      userId: string
      canEdit: boolean
    }): Promise<DbNoteShare> {
      const note = await repos.notes.findById(input.noteId)
      if (!note || !canShareNote(note)) {
        logger.log(LOG_EVENTS.PERMISSION_DENIED, {
          orgId: ctx.orgId,
          userId: ctx.userId,
          action: 'note.share',
          noteId: input.noteId,
        })
        throw new AppError('not_found', 'Note not found')
      }
      // Target must be a member of this org.
      const targetMembership = await repos.memberships.findForUserAndOrg(
        input.userId,
        ctx.orgId,
      )
      if (!targetMembership) {
        throw new AppError(
          'invalid_input',
          'User is not a member of this organization',
        )
      }
      const row = await repos.noteShares.grant(input)
      logger.log(LOG_EVENTS.NOTE_UPDATED, {
        orgId: ctx.orgId,
        userId: ctx.userId,
        noteId: input.noteId,
        action: 'share.grant',
        targetUserId: input.userId,
        canEdit: input.canEdit,
      })
      await recordAudit(LOG_EVENTS.NOTE_UPDATED, {
        event: LOG_EVENTS.NOTE_UPDATED,
        entityType: 'note',
        entityId: input.noteId,
        payload: {
          action: 'share.grant',
          targetUserId: input.userId,
          canEdit: input.canEdit,
        },
      })
      return row
    },

    /** Revoke a share. Same authorization rules as `shareNote`. */
    async unshareNote(noteId: string, userId: string): Promise<void> {
      const note = await repos.notes.findById(noteId)
      if (!note || !canShareNote(note)) {
        logger.log(LOG_EVENTS.PERMISSION_DENIED, {
          orgId: ctx.orgId,
          userId: ctx.userId,
          action: 'note.unshare',
          noteId,
        })
        throw new AppError('not_found', 'Note not found')
      }
      await repos.noteShares.revoke(noteId, userId)
      logger.log(LOG_EVENTS.NOTE_UPDATED, {
        orgId: ctx.orgId,
        userId: ctx.userId,
        noteId,
        action: 'share.revoke',
        targetUserId: userId,
      })
      await recordAudit(LOG_EVENTS.NOTE_UPDATED, {
        event: LOG_EVENTS.NOTE_UPDATED,
        entityType: 'note',
        entityId: noteId,
        payload: { action: 'share.revoke', targetUserId: userId },
      })
    },
  }
}
