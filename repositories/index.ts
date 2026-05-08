import { getDb } from '@/db/client'
import { createNotesRepository, type AnyDb, type NotesRepository } from './notes-repository'
import { createOrgsRepository, type OrgsRepository } from './orgs-repository'
import {
  createMembershipsRepository,
  type MembershipsRepository,
} from './memberships-repository'
import type { RequestContext } from './types'

export type Repositories = {
  notes: NotesRepository
  orgs: OrgsRepository
  memberships: MembershipsRepository
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
  }
}

export type { NotesRepository, OrgsRepository, MembershipsRepository, AnyDb }
export { scopedWhere, withOrgId } from './base-repository'
