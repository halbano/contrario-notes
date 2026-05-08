import { sql, type SQL } from 'drizzle-orm'
import type { RequestContext } from '@/lib/request-context'

/**
 * SQL-level visibility predicate for `notes`.
 *
 * Mirrors the in-memory rules in `permissions/note-permissions.ts#canReadNote`,
 * pushed into a Drizzle SQL fragment so list/search queries can AND it into
 * their WHERE clause and never rely on a post-filter (TENANCY_INVARIANTS
 * invariant 4 / ADR-0004).
 *
 * Predicate, in plain English:
 *
 *   notes.org_id = ctx.orgId AND (
 *     notes.visibility = 'org'
 *     OR (notes.visibility = 'private' AND notes.author_id = ctx.userId)
 *     OR (notes.visibility = 'shared' AND (
 *       notes.author_id = ctx.userId
 *       OR EXISTS (
 *         SELECT 1 FROM note_shares ns
 *         WHERE ns.org_id  = ctx.orgId
 *           AND ns.note_id = notes.id
 *           AND ns.user_id = ctx.userId
 *       )
 *     ))
 *   )
 *
 * Implementation notes:
 *  - `ctx.orgId` and `ctx.userId` are bound as SQL parameters (no string
 *    interpolation) — they came from RequestContext, but treating them as
 *    parameters keeps the choke point honest.
 *  - The fragment references `notes` (the parent query's table) and the
 *    `note_shares` table by literal name. Callers AND it into a query already
 *    `from(notes)`, so no aliasing is needed.
 */
export function visibleNotesPredicate(ctx: RequestContext): SQL {
  return sql`
    "notes"."org_id" = ${ctx.orgId}
    AND (
      "notes"."visibility" = 'org'
      OR (
        "notes"."visibility" = 'private'
        AND "notes"."author_id" = ${ctx.userId}
      )
      OR (
        "notes"."visibility" = 'shared'
        AND (
          "notes"."author_id" = ${ctx.userId}
          OR EXISTS (
            SELECT 1 FROM "note_shares" "ns"
            WHERE "ns"."org_id"  = ${ctx.orgId}
              AND "ns"."note_id" = "notes"."id"
              AND "ns"."user_id" = ${ctx.userId}
          )
        )
      )
    )
  `
}
