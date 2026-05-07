import type { NoteForPermission, RequestContext } from './types'

/**
 * Note permission rules. Single source of truth for `read | create | update |
 * delete`. Search and AI compose visibility predicates from the same logic
 * (mirrored in SQL — see ADR-0004 / ADR-0006).
 *
 * Role matrix (notes):
 *
 *   action | viewer | member | admin
 *   -------+--------+--------+------
 *   read   |   ✓*   |   ✓*   |  ✓*    (* = subject to visibility rules)
 *   create |   ✗    |   ✓    |   ✓
 *   update |   ✗    | own    | any-non-private
 *   delete |   ✗    | own    | any-non-private
 *
 * Cross-org is ALWAYS denied. Privacy holds even for admins — a `private`
 * note is readable / writable only by its author.
 */

/** Identity guard: any access requires same-org context. */
function sameOrg(ctx: RequestContext, note: NoteForPermission): boolean {
  return ctx.orgId === note.orgId
}

export function canReadNote(ctx: RequestContext, note: NoteForPermission): boolean {
  if (!sameOrg(ctx, note)) return false

  switch (note.visibility) {
    case 'private':
      return ctx.userId === note.authorId
    case 'org':
      // Any member of the org may read; role does not matter for reads of org-wide notes.
      return true
    case 'shared': {
      if (ctx.userId === note.authorId) return true
      const sharedWith = note.sharedWithUserIds ?? []
      return sharedWith.includes(ctx.userId)
    }
  }
}

export function canCreateNote(ctx: RequestContext): boolean {
  return ctx.role !== 'viewer'
}

export function canUpdateNote(ctx: RequestContext, note: NoteForPermission): boolean {
  if (!sameOrg(ctx, note)) return false
  if (ctx.role === 'viewer') return false

  // Authors can always update their own notes.
  if (ctx.userId === note.authorId) return true

  // Admins can update any non-private note in their org.
  if (ctx.role === 'admin' && note.visibility !== 'private') return true

  return false
}

export function canDeleteNote(ctx: RequestContext, note: NoteForPermission): boolean {
  // Same shape as update: only authors and (for non-private) admins.
  return canUpdateNote(ctx, note)
}
