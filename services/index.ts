import type { RequestContext } from '@/lib/request-context'
import { createRepositories, type AnyDb, type Repositories } from '@/repositories'
import { logger as defaultLogger, type Logger } from '@/logging'
import { createNotesService, type NotesService } from './notes-service'
import { createOrgsService, type OrgsService } from './orgs-service'

export type ScopedServices = {
  ctx: RequestContext
  notes: NotesService
  orgs: OrgsService
}

export type CreateScopedServicesOptions = {
  /** Inject a custom Drizzle handle (used by tests). */
  db?: AnyDb
  /** Inject a custom logger; defaults to the shared singleton. */
  logger?: Logger
  /** Inject pre-built repositories (used by tests). */
  repositories?: Repositories
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
  return {
    ctx,
    notes: createNotesService(ctx, repos, log),
    orgs: createOrgsService(ctx, repos, log),
  }
}

export type { NotesService, OrgsService }
