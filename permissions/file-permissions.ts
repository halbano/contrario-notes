import { canReadNote, canUpdateNote } from './note-permissions'
import type { FileForPermission, NoteForPermission, RequestContext } from './types'

/**
 * File permission rules. Files inherit from the parent note when present;
 * standalone files (note-less) follow stricter rules: only the uploader or
 * an org admin may read/write.
 *
 * ADR-0005 + TENANCY_INVARIANTS.md invariant 5: every read MUST run through
 * one of these predicates BEFORE a signed URL is minted. Knowing the storage
 * path grants no access — the path is not a credential.
 */

function sameOrg(ctx: RequestContext, file: FileForPermission): boolean {
  return ctx.orgId === file.orgId
}

/**
 * Can the user read this file?
 *
 *  - With parent note: defers to `canReadNote` against that note.
 *  - Standalone (note === null): owner-only (uploader) or admin-only.
 *  - Cross-org: always false.
 */
export function canReadFile(
  ctx: RequestContext,
  file: FileForPermission,
  parentNote: NoteForPermission | null,
): boolean {
  if (!sameOrg(ctx, file)) return false

  if (parentNote) {
    if (parentNote.orgId !== ctx.orgId) return false
    return canReadNote(ctx, parentNote)
  }

  // Standalone file — owner or org admin.
  if (ctx.userId === file.uploaderId) return true
  if (ctx.role === 'admin') return true
  return false
}

/**
 * Can the user write (upload/attach to / delete) this file?
 *
 *  - With parent note: defers to `canUpdateNote` against that note.
 *  - Standalone (note === null): owner-only or admin-only.
 *  - Viewers always false.
 *  - Cross-org: always false.
 */
export function canWriteFile(
  ctx: RequestContext,
  file: FileForPermission,
  parentNote: NoteForPermission | null,
): boolean {
  if (!sameOrg(ctx, file)) return false
  if (ctx.role === 'viewer') return false

  if (parentNote) {
    if (parentNote.orgId !== ctx.orgId) return false
    return canUpdateNote(ctx, parentNote)
  }

  if (ctx.userId === file.uploaderId) return true
  if (ctx.role === 'admin') return true
  return false
}

/**
 * Permission gate for "can I attach a NEW file to this note?". The file row
 * doesn't exist yet, so we evaluate against the note alone.
 *
 * Standalone uploads (parent === null) require any non-viewer role.
 */
export function canAttachToNote(
  ctx: RequestContext,
  parentNote: NoteForPermission | null,
): boolean {
  if (ctx.role === 'viewer') return false
  if (!parentNote) return true
  if (parentNote.orgId !== ctx.orgId) return false
  return canUpdateNote(ctx, parentNote)
}
