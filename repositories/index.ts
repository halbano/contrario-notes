import { getDb } from '@/db/client'
import { createNotesRepository, type AnyDb, type NotesRepository } from './notes-repository'
import { createOrgsRepository, type OrgsRepository } from './orgs-repository'
import {
  createMembershipsRepository,
  type MembershipsRepository,
} from './memberships-repository'
import {
  createNoteVersionsRepository,
  type NoteVersionsRepository,
} from './note-versions-repository'
import { createTagsRepository, type TagsRepository } from './tags-repository'
import {
  createNoteSharesRepository,
  type NoteSharesRepository,
} from './note-shares-repository'
import { createFilesRepository, type FilesRepository } from './files-repository'
import {
  createAuditLogRepository,
  type AuditLogRepository,
} from './audit-log-repository'
import type { RequestContext } from './types'

export type Repositories = {
  notes: NotesRepository
  orgs: OrgsRepository
  memberships: MembershipsRepository
  noteVersions: NoteVersionsRepository
  tags: TagsRepository
  noteShares: NoteSharesRepository
  files: FilesRepository
  auditLog: AuditLogRepository
  /** Underlying handle — services that need transactions reach into this. */
  db: AnyDb
}

/**
 * Factory: builds the per-request repositories bound to `ctx`. Every read
 * and write the resulting object performs is org-scoped to `ctx.orgId`.
 *
 * Tests may pass a custom `db` (e.g. pglite) to drive the same code paths
 * without a real Postgres connection.
 */
export function createRepositories(ctx: RequestContext, db?: AnyDb): Repositories {
  const handle = (db ?? (getDb() as unknown as AnyDb))
  return {
    notes: createNotesRepository(ctx, handle),
    orgs: createOrgsRepository(ctx, handle),
    memberships: createMembershipsRepository(ctx, handle),
    noteVersions: createNoteVersionsRepository(ctx, handle),
    tags: createTagsRepository(ctx, handle),
    noteShares: createNoteSharesRepository(ctx, handle),
    files: createFilesRepository(ctx, handle),
    auditLog: createAuditLogRepository(ctx, handle),
    db: handle,
  }
}

export type {
  NotesRepository,
  OrgsRepository,
  MembershipsRepository,
  NoteVersionsRepository,
  TagsRepository,
  NoteSharesRepository,
  FilesRepository,
  AuditLogRepository,
  AnyDb,
}
export { scopedWhere, withOrgId } from './base-repository'
