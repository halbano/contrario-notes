import { and, desc, isNull, sql } from 'drizzle-orm'
import { notes, type DbNote } from '@/db/schema'
import { visibleNotesPredicate } from '@/permissions/note-visibility-sql'
import type { AnyDb } from './notes-repository'
import type { RequestContext } from './types'

export type SearchInput = {
  /** Free-text query. Empty/whitespace inputs must be rejected upstream. */
  query: string
  /** Hard cap enforced by the service (1..50). */
  limit: number
}

export type SearchRepository = {
  searchVisible(input: SearchInput): Promise<DbNote[]>
}

/**
 * Search repository. Owns the FTS query.
 *
 * Per ADR-0004 and TENANCY_INVARIANTS invariant 4, the WHERE clause is
 * composed from:
 *   1. `visibleNotesPredicate(ctx)` — the org-scoped, visibility-aware
 *      predicate (also used by `repos.notes.listVisible`).
 *   2. `notes.deleted_at IS NULL` — soft-delete filter.
 *   3. `notes.search_tsv @@ plainto_tsquery('simple', $query)` — the FTS hit
 *      condition.
 *
 * Ranking: `ts_rank(notes.search_tsv, plainto_tsquery('simple', $query))`
 * descending, then `updated_at` desc as a deterministic tiebreaker.
 *
 * The `$query` value is bound as a SQL parameter via Drizzle's `sql`
 * template tag — never string-concatenated. Same goes for the userId/orgId
 * inside the visibility predicate.
 */
export function createSearchRepository(
  ctx: RequestContext,
  db: AnyDb,
): SearchRepository {
  return {
    async searchVisible(input) {
      const q = input.query
      const rows = await db
        .select()
        .from(notes)
        .where(
          and(
            visibleNotesPredicate(ctx),
            isNull(notes.deletedAt),
            sql`"notes"."search_tsv" @@ plainto_tsquery('simple', ${q})`,
          )!,
        )
        .orderBy(
          desc(
            sql`ts_rank("notes"."search_tsv", plainto_tsquery('simple', ${q}))`,
          ),
          desc(notes.updatedAt),
        )
        .limit(input.limit)
      return rows
    },
  }
}
