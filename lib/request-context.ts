/**
 * RequestContext — the single, immutable per-request capsule that carries
 * tenant identity. It is the ONLY allowed source of `orgId` for queries.
 *
 * Invariants enforced (see TENANCY_INVARIANTS.md):
 *  - `orgId` is server-controlled. Built from session + active membership.
 *  - Never derived from request body / query / header.
 *  - Immutable inside a request scope.
 */
export type Role = 'admin' | 'member' | 'viewer'

export type RequestContext = {
  readonly userId: string
  readonly orgId: string
  readonly role: Role
}

export const ROLES = ['admin', 'member', 'viewer'] as const

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
}
