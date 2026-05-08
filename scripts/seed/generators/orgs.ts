/**
 * Org generator. Five fictional design studios, deterministic ids so
 * downstream generators can refer to specific orgs by index without needing
 * to round-trip through the DB.
 *
 * Justification for raw db: organizations is the tenant root and has no
 * RequestContext yet at this point. The ONLY service entry point that can
 * create one (`OrgsService.createOrg`) requires a ctx whose user is a
 * member of *some* org — bootstrap circularity. We therefore insert
 * organizations directly. Mirrors the codepath documented in
 * `repositories/orgs-repository.ts#createWithAdmin` (which itself does the
 * raw insert inside a transaction).
 */
import { organizations } from '@/db/schema'
import type { AnyDb } from '@/repositories'

export type SeededOrg = {
  id: string
  slug: string
  name: string
}

export const ORG_FIXTURES: readonly SeededOrg[] = Object.freeze([
  {
    id: '00000000-0000-4000-8000-000000000a01',
    slug: 'studio-aurora',
    name: 'Studio Aurora',
  },
  {
    id: '00000000-0000-4000-8000-000000000a02',
    slug: 'foundry-collective',
    name: 'Foundry Collective',
  },
  {
    id: '00000000-0000-4000-8000-000000000a03',
    slug: 'paper-prairie',
    name: 'Paper Prairie',
  },
  {
    id: '00000000-0000-4000-8000-000000000a04',
    slug: 'helix-and-co',
    name: 'Helix & Co.',
  },
  {
    id: '00000000-0000-4000-8000-000000000a05',
    slug: 'kindling-studio',
    name: 'Kindling Studio',
  },
])

/**
 * Insert the five fixed orgs. Idempotent under the unique slug constraint.
 */
export async function seedOrgs(db: AnyDb): Promise<readonly SeededOrg[]> {
  await db
    .insert(organizations)
    .values(
      ORG_FIXTURES.map((o) => ({ id: o.id, slug: o.slug, name: o.name })),
    )
    .onConflictDoNothing()
  return ORG_FIXTURES
}
