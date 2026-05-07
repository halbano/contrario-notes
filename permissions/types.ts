import type { Role } from '@/lib/request-context'

/**
 * Re-export the canonical RequestContext from lib so that consumers can
 * import permissions + RequestContext from the same module group without
 * creating a circular dep.
 */
export type { RequestContext, Role } from '@/lib/request-context'

/** Visibility tiers (mirrors db schema; ADR-0006). */
export type NoteVisibility = 'private' | 'org' | 'shared'

/** Minimal note shape for permission checks (does not require full row). */
export type NoteForPermission = {
  orgId: string
  authorId: string
  visibility: NoteVisibility
  /** users explicitly shared with (only consulted when visibility = 'shared'). */
  sharedWithUserIds?: readonly string[]
}

/** Minimal file shape — files inherit permission from parent note. */
export type FileForPermission = {
  orgId: string
  uploaderId: string
  /** If null, file is standalone and uses org-default rules. */
  parentNote: NoteForPermission | null
}

/** Action verbs we permission against. */
export type NoteAction = 'read' | 'create' | 'update' | 'delete'

export const ALL_ROLES: readonly Role[] = ['admin', 'member', 'viewer'] as const
export const ALL_VISIBILITIES: readonly NoteVisibility[] = ['private', 'org', 'shared'] as const
