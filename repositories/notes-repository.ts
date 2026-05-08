import { and, desc, eq, isNull } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { notes, type DbNote, type DbNoteInsert } from '@/db/schema'
import { visibleNotesPredicate } from '@/permissions/note-visibility-sql'
import { scopedWhere, withOrgId } from './base-repository'
import type { RequestContext } from './types'

/**
 * Notes repository. Every method auto-applies `eq(notes.org_id, ctx.orgId)`.
 * No method takes an `orgId` parameter — that is structurally impossible.
 *
 * The `db` argument is whatever `db/client.ts#getDb()` returns; we type it
 * loosely so the repo is composable with any Drizzle-shaped client (real PG
 * driver, pglite for tests).
 */
export type AnyDb = PgDatabase<any, any, any>

export type CreateNoteInput = Omit<DbNoteInsert, 'orgId'>

export type NotesRepository = {
  findById(id: string): Promise<DbNote | null>
  listRecent(opts?: { limit?: number }): Promise<DbNote[]>
  /**
   * Visibility-filtered recency list. Applies `visibleNotesPredicate(ctx)` at
   * SQL level — the only correct entry point for surfaces that must respect
   * private/shared semantics (UI lists, search). The org-scoping predicate is
   * embedded inside the fragment, so we do not also AND `scopedWhere` here.
   */
  listVisible(opts?: { limit?: number }): Promise<DbNote[]>
  create(input: CreateNoteInput): Promise<DbNote>
  update(id: string, patch: Partial<Omit<DbNoteInsert, 'id' | 'orgId'>>): Promise<DbNote | null>
  softDelete(id: string): Promise<boolean>
}

export function createNotesRepository(ctx: RequestContext, db: AnyDb): NotesRepository {
  return {
    async findById(id) {
      const rows = await db
        .select()
        .from(notes)
        .where(scopedWhere(ctx, notes, eq(notes.id, id), isNull(notes.deletedAt)))
        .limit(1)
      return rows[0] ?? null
    },

    async listRecent(opts = {}) {
      const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200)
      return db
        .select()
        .from(notes)
        .where(scopedWhere(ctx, notes, isNull(notes.deletedAt)))
        .orderBy(desc(notes.updatedAt))
        .limit(limit)
    },

    async listVisible(opts = {}) {
      const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200)
      return db
        .select()
        .from(notes)
        .where(and(visibleNotesPredicate(ctx), isNull(notes.deletedAt))!)
        .orderBy(desc(notes.updatedAt))
        .limit(limit)
    },

    async create(input) {
      const payload = withOrgId(ctx, input)
      const rows = await db.insert(notes).values(payload).returning()
      const row = rows[0]
      if (!row) throw new Error('Failed to create note (no row returned)')
      return row
    },

    async update(id, patch) {
      // Strip any orgId/id the caller may have set — orgId is server-controlled.
      const safe = { ...patch } as Record<string, unknown>
      delete safe.orgId
      delete safe.id
      const rows = await db
        .update(notes)
        .set({ ...(safe as Partial<DbNoteInsert>), updatedAt: new Date() })
        .where(scopedWhere(ctx, notes, eq(notes.id, id), isNull(notes.deletedAt)))
        .returning()
      return rows[0] ?? null
    },

    async softDelete(id) {
      const rows = await db
        .update(notes)
        .set({ deletedAt: new Date() })
        .where(and(scopedWhere(ctx, notes, eq(notes.id, id), isNull(notes.deletedAt)))!)
        .returning({ id: notes.id })
      return rows.length > 0
    },
  }
}
