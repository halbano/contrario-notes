/**
 * App error taxonomy. Errors carry a stable `code` for the logger and a
 * user-safe `message` distinct from `cause`. The HTTP layer maps these to
 * status codes — for tenancy/permission errors we deliberately return 404 to
 * avoid existence disclosure (TENANCY_INVARIANTS.md, enforcement section).
 */
export type AppErrorCode =
  | 'unauthenticated'
  | 'no_membership'
  | 'permission_denied'
  | 'not_found'
  | 'invalid_input'
  | 'conflict'
  | 'internal'

export class AppError extends Error {
  public readonly code: AppErrorCode
  public readonly status: number
  public readonly details?: Record<string, unknown>

  constructor(
    code: AppErrorCode,
    message: string,
    opts: { status?: number; details?: Record<string, unknown>; cause?: unknown } = {},
  ) {
    super(message, opts.cause ? { cause: opts.cause } : undefined)
    this.name = 'AppError'
    this.code = code
    this.status = opts.status ?? defaultStatus(code)
    if (opts.details) this.details = opts.details
  }
}

function defaultStatus(code: AppErrorCode): number {
  switch (code) {
    case 'unauthenticated':
      return 401
    case 'no_membership':
      return 403
    // Per invariant: permission denials return 404 to avoid existence disclosure.
    case 'permission_denied':
      return 404
    case 'not_found':
      return 404
    case 'invalid_input':
      return 400
    case 'conflict':
      return 409
    case 'internal':
      return 500
  }
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError
