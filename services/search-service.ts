import { z } from 'zod'
import { AppError } from '@/lib/errors'
import type { Repositories } from '@/repositories'
import type { RequestContext } from '@/lib/request-context'
import type { DbNote } from '@/db/schema'
import { type Logger } from '@/logging'

/**
 * Search query input. Validation rules (pre-SQL):
 *  - `query`: non-empty after trim, max 200 chars (defensive — long queries
 *    are not useful for plainto_tsquery and inflate parse cost).
 *  - `limit`: 1..50 inclusive. The repository never sees an unbounded limit.
 */
export const searchQuerySchema = z.object({
  query: z.string().trim().min(1).max(200),
  limit: z.number().int().min(1).max(50).default(20),
})

export type SearchQueryInput = z.input<typeof searchQuerySchema>

export type SearchService = ReturnType<typeof createSearchService>

export function createSearchService(
  _ctx: RequestContext,
  repos: Repositories,
  _logger: Logger,
) {
  return {
    /**
     * Run a permission-safe full-text search. The repository ANDs the
     * visibility predicate into the SQL WHERE — no app-tier post-filter.
     *
     * Throws `AppError('invalid_input')` on schema rejection. Anything else
     * is an internal error (DB outage, etc.) and bubbles up.
     */
    async query(input: SearchQueryInput): Promise<DbNote[]> {
      const parsed = searchQuerySchema.safeParse(input)
      if (!parsed.success) {
        throw new AppError('invalid_input', 'Invalid search query', {
          details: { issues: parsed.error.flatten() },
        })
      }
      return repos.search.searchVisible({
        query: parsed.data.query,
        limit: parsed.data.limit,
      })
    },
  }
}
