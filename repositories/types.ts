import type { RequestContext } from '@/lib/request-context'

export type { RequestContext } from '@/lib/request-context'

/**
 * The `Db` shape used by repositories. We deliberately keep this loose so
 * tests can inject a fake without instantiating Postgres. The real type comes
 * from `db/client.ts#getDb()`.
 */
export type RepoDb = unknown

/** Common return shape for write ops that need to confirm a row was scoped. */
export type WriteResult<T> = { ok: true; row: T } | { ok: false; reason: 'not_found_or_forbidden' }

/** Constructor signature every repo factory follows. */
export type RepoFactory<T> = (ctx: RequestContext, db: RepoDb) => T
