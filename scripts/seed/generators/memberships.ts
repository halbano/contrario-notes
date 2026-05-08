/**
 * Memberships generator.
 *
 * Real flow uses `OrgsService.createOrg` (which atomically inserts an admin
 * membership) for org-creator users, then `OrgsService.addMember` for
 * everyone else. Seeding through `addMember` would require constructing a
 * RequestContext where the actor is already an admin of the target org —
 * which is exactly the chicken/egg the org generator solved by inserting
 * orgs raw.
 *
 * For consistency we keep raw inserts here too. The role distribution we
 * emit (~10% admin, ~70% member, ~20% viewer per org, with each org
 * guaranteed at least one admin) matches what `addMember` would have
 * produced.
 */
import { memberships as membershipsTable } from '@/db/schema'
import type { Role } from '@/lib/request-context'
import type { AnyDb } from '@/repositories'
import type { SeededOrg } from './orgs'
import type { SeededUser } from './users'
import { weighted, type Rng } from '../lib/random'

export type SeededMembership = {
  orgId: string
  userId: string
  role: Role
}

const ROLE_WEIGHTS = [
  { value: 'admin' as Role, weight: 1 },
  { value: 'member' as Role, weight: 7 },
  { value: 'viewer' as Role, weight: 2 },
]

export async function seedMemberships(opts: {
  db: AnyDb
  rng: Rng
  orgs: readonly SeededOrg[]
  users: readonly SeededUser[]
}): Promise<SeededMembership[]> {
  const rows: SeededMembership[] = []

  // First pass: assign every (user, orgId) pair from the user plan.
  for (const user of opts.users) {
    for (const orgId of user.orgIds) {
      rows.push({
        orgId,
        userId: user.id,
        role: weighted(opts.rng, ROLE_WEIGHTS),
      })
    }
  }

  // Guarantee each org has at least one admin. Promote the first member of
  // any org that ended up admin-less.
  for (const org of opts.orgs) {
    const inOrg = rows.filter((r) => r.orgId === org.id)
    if (inOrg.some((r) => r.role === 'admin')) continue
    const promote = inOrg[0]
    if (promote) promote.role = 'admin'
  }

  if (rows.length > 0) {
    await opts.db.insert(membershipsTable).values(rows).onConflictDoNothing()
  }
  return rows
}

/** Look up an admin user for an org. Used by note generators. */
export function pickAdminFor(
  orgId: string,
  memberships: readonly SeededMembership[],
): SeededMembership {
  const admin = memberships.find(
    (m) => m.orgId === orgId && m.role === 'admin',
  )
  if (!admin) {
    throw new Error(`No admin membership for org ${orgId} — seed planner bug`)
  }
  return admin
}

/** Members and viewers for an org (admins included). */
export function listForOrg(
  orgId: string,
  memberships: readonly SeededMembership[],
): SeededMembership[] {
  return memberships.filter((m) => m.orgId === orgId)
}
