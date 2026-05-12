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
 * Build a `to_tsquery('simple', …)` argument with per-term `:*` prefix
 * wildcards so users can match partial words (e.g. `vitre` → `vitrectomy`).
 *
 * Strips ts_query operator characters (`& | ! : ( ) \`) from each token to
 * prevent the user from injecting query operators. Tokens that collapse to
 * empty after sanitization are dropped. Returns `null` when no usable tokens
 * remain — caller bypasses FTS and returns no rows.
 */
export function buildPrefixTsQuery(query: string): string | null {
  const tokens = query
    .split(/\s+/)
    .map((t) => t.replace(/[&|!:()\\*]/g, '').trim())
    .filter((t) => t.length > 0)
  if (tokens.length === 0) return null
  return tokens.map((t) => `${t}:*`).join(' & ')
}

export function createSearchRepository(
  ctx: RequestContext,
  db: AnyDb,
): SearchRepository {
  return {
    async searchVisible(input) {
      const tsq = buildPrefixTsQuery(input.query)
      if (tsq === null) return []
      const rows = await db
        .select()
        .from(notes)
        .where(
          and(
            visibleNotesPredicate(ctx),
            isNull(notes.deletedAt),
            sql`"notes"."search_tsv" @@ to_tsquery('simple', ${tsq})`,
          )!,
        )
        .orderBy(
          desc(
            sql`ts_rank("notes"."search_tsv", to_tsquery('simple', ${tsq}))`,
          ),
          desc(notes.updatedAt),
        )
        .limit(input.limit)
      return rows
    },
  }
}
