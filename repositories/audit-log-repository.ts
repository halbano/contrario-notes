import { and, desc, eq } from 'drizzle-orm'
import { auditLog, type DbAuditLog } from '@/db/schema'
import { scopedWhere, withOrgId } from './base-repository'
import type { AnyDb } from './notes-repository'
import type { RequestContext } from './types'

/**
 * Append-only audit log. The ONLY repo that writes to `audit_log` from app
 * code — services depend on it via the structured logger wrapper at
 * `logging/audit.ts`.
 *
 * Tenancy: every row carries `org_id = ctx.orgId`. The composite index on
 * `(org_id, created_at)` keeps reads tenant-scoped.
 */

export type RecordAuditInput = {
  event: string
  /** Defaults to ctx.userId. Pass `null` to record an unauthenticated event. */
  actorId?: string | null
  entityType?: string | null
  entityId?: string | null
  payload?: Record<string, unknown>
  success?: boolean
}

export type AuditLogRepository = {
  record(input: RecordAuditInput): Promise<DbAuditLog>
  /** Most-recent-first for the current org (debug / admin tooling). */
  listRecent(opts?: { limit?: number; event?: string }): Promise<DbAuditLog[]>
}

export function createAuditLogRepository(
  ctx: RequestContext,
  db: AnyDb,
): AuditLogRepository {
  return {
    async record(input) {
      const payload = withOrgId(ctx, {
        actorId: input.actorId === undefined ? ctx.userId : input.actorId,
        event: input.event,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        payload: input.payload ?? {},
        success: input.success ?? true,
      })
      const rows = await db.insert(auditLog).values(payload).returning()
      const row = rows[0]
      if (!row) throw new Error('Failed to write audit_log row')
      return row
    },

    async listRecent(opts = {}) {
      const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500)
      const where = opts.event
        ? scopedWhere(ctx, auditLog, eq(auditLog.event, opts.event))
        : scopedWhere(ctx, auditLog)
      return db
        .select()
        .from(auditLog)
        .where(and(where)!)
        .orderBy(desc(auditLog.createdAt))
        .limit(limit)
    },
  }
}
