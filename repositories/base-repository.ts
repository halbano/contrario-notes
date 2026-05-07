import { and, eq, type SQL } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'
import type { RequestContext } from './types'

/**
 * Base repository helpers. Repositories never construct their own `WHERE`
 * clauses without going through `scopedWhere()`, which guarantees the
 * `eq(table.org_id, ctx.orgId)` predicate is the FIRST element. This makes
 * tenant scoping structurally non-bypassable from caller code.
 *
 * The helpers are deliberately tiny — Drizzle is the workhorse; this file is
 * the choke point.
 */

/**
 * Tables we permit org-scoping on must expose an `orgId` column. We model
 * the constraint as "the table has an `orgId` Drizzle column" without
 * requiring a structural Record signature (Drizzle's PgTable doesn't satisfy
 * one).
 */
export type OrgScopedTable = PgTable & { orgId: unknown }

/**
 * Returns a Drizzle predicate combining the mandatory `org_id = ctx.orgId`
 * predicate with any additional predicates. The org filter is ALWAYS first.
 *
 * Usage in a repository method:
 *
 *   db.select().from(notes).where(scopedWhere(ctx, notes, eq(notes.id, id)))
 */
export function scopedWhere<T extends OrgScopedTable>(
  ctx: RequestContext,
  table: T,
  ...extra: Array<SQL | undefined>
): SQL {
  // Drizzle column access. The OrgScopedTable constraint guarantees existence.
  const orgIdCol = (table as { orgId: unknown }).orgId
  const filtered = extra.filter((p): p is SQL => Boolean(p))
  const all = [eq(orgIdCol as never, ctx.orgId), ...filtered]
  // `and` is non-undefined when given >= 1 arg.
  return and(...all)!
}

/**
 * Validates a payload destined for INSERT carries the ctx's orgId (or none)
 * and stamps it on. Caller code MUST NOT supply a different orgId — this is
 * the structural enforcement point.
 */
export function withOrgId<T extends Record<string, unknown>>(
  ctx: RequestContext,
  payload: T,
): T & { orgId: string } {
  if ('orgId' in payload && payload.orgId !== undefined && payload.orgId !== ctx.orgId) {
    throw new Error(
      `Repository payload supplied a foreign orgId (${String(
        payload.orgId,
      )}). Caller must not set orgId; it is derived from RequestContext.`,
    )
  }
  return { ...payload, orgId: ctx.orgId }
}
