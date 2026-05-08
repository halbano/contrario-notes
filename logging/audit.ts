import { LEVEL_FOR_EVENT, type LogEvent } from './events'
import type { Logger } from './logger'
import type { AuditLogRepository, RecordAuditInput } from '@/repositories/audit-log-repository'

/**
 * Pair the structured logger with a durable audit_log row. Single call site
 * keeps the two stores in lockstep for events that must persist.
 *
 * Stdout JSON via `logger.log()` — observability tail.
 * `audit_log` row via `auditLog.record()` — durable queryable history.
 *
 * If the audit row write fails we still log; the logger emits an
 * `error.unhandled`-shaped record so the operator can reconcile.
 */
export type AuditWriter = (
  event: LogEvent,
  input: RecordAuditInput & { /** override stdout context */ logContext?: Record<string, unknown> },
) => Promise<void>

export function createAuditWriter(
  logger: Logger,
  repo: AuditLogRepository,
): AuditWriter {
  return async (event, input) => {
    const ctx = {
      event,
      entityType: input.entityType,
      entityId: input.entityId,
      ...(input.payload ?? {}),
      ...(input.logContext ?? {}),
    }
    logger.log(event, ctx)
    try {
      await repo.record({
        event,
        actorId: input.actorId,
        entityType: input.entityType,
        entityId: input.entityId,
        payload: input.payload ?? {},
        success: input.success ?? true,
      })
    } catch (err) {
      logger.error('audit.record_failed', {
        event,
        level: LEVEL_FOR_EVENT[event],
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
}
