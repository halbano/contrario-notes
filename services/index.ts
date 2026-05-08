import type { RequestContext } from '@/lib/request-context'
import { createRepositories, type AnyDb, type Repositories } from '@/repositories'
import { logger as defaultLogger, type Logger } from '@/logging'
import { createAuditWriter, type AuditWriter } from '@/logging/audit'
import { createNotesService, type NotesService } from './notes-service'
import { createOrgsService, type OrgsService } from './orgs-service'
import { createFilesService, type FilesService } from './files-service'
import type { FileStorage } from './files-storage'
import { createSearchService, type SearchService } from './search-service'
import {
  createAiService,
  type AiService,
  type AiServiceDeps,
} from './ai-service'

export type ScopedServices = {
  ctx: RequestContext
  notes: NotesService
  orgs: OrgsService
  files: FilesService
  audit: AuditWriter
  search: SearchService
  ai: AiService
}

export type CreateScopedServicesOptions = {
  /** Inject a custom Drizzle handle (used by tests). */
  db?: AnyDb
  /** Inject a custom logger; defaults to the shared singleton. */
  logger?: Logger
  /** Inject pre-built repositories (used by tests). */
  repositories?: Repositories
  /** Inject a custom file-storage adapter (used by tests). */
  fileStorage?: FileStorage
  /** Inject a custom audit writer (used by tests). */
  audit?: AuditWriter
  /** AI dependency overrides — primarily for tests (mock LLM client). */
  ai?: AiServiceDeps
}

/**
 * THE entry-point factory. Server route handlers, server actions, and tests
 * call this once per request after building `ctx`.
 *
 * Returns the façade by which all feature/UI code reaches data. Features
 * MUST NOT instantiate repositories or import `db/` directly.
 */
export function createScopedServices(
  ctx: RequestContext,
  opts: CreateScopedServicesOptions = {},
): ScopedServices {
  const log = (opts.logger ?? defaultLogger).child({
    orgId: ctx.orgId,
    userId: ctx.userId,
    role: ctx.role,
  })
  const repos = opts.repositories ?? createRepositories(ctx, opts.db)
  const audit = opts.audit ?? createAuditWriter(log, repos.auditLog)
  return {
    ctx,
    notes: createNotesService(ctx, repos, log, audit),
    orgs: createOrgsService(ctx, repos, log, audit),
    files: createFilesService(ctx, repos, log, {
      storage: opts.fileStorage,
      audit,
    }),
    audit,
    search: createSearchService(ctx, repos, log),
    ai: createAiService(ctx, repos, log, opts.ai),
  }
}

export type { NotesService, OrgsService, FilesService, SearchService, AiService }
