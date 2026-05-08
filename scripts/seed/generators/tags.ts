/**
 * Tag vocabulary. Includes a deliberately overlapping core set so future
 * search-leak tests are non-trivial — every org gets the shared core plus a
 * couple of org-specific tags. Tag rows themselves are written through the
 * scoped service path (`notes.setTagsForNote`), so we don't bulk-insert them
 * here; this file exposes the *vocabulary* the note generator draws from.
 */
import type { SeededOrg } from './orgs'

const CORE_VOCAB = [
  'roadmap',
  'meeting',
  'spec',
  'bug',
  'idea',
  'launch',
  'retro',
  'design',
  'qa',
  'planning',
] as const

const ORG_FLAVOR: Record<string, readonly string[]> = {
  'studio-aurora': ['typography', 'identity'],
  'foundry-collective': ['casting', 'kerning'],
  'paper-prairie': ['print', 'paper-stock'],
  'helix-and-co': ['research', 'biotech'],
  'kindling-studio': ['storytelling', 'narrative'],
}

export type OrgTagVocab = {
  orgId: string
  slug: string
  /** Tags this org's notes will draw from. Always >= 5 entries. */
  vocab: string[]
}

export function buildTagVocab(orgs: readonly SeededOrg[]): OrgTagVocab[] {
  return orgs.map((o) => ({
    orgId: o.id,
    slug: o.slug,
    vocab: [...CORE_VOCAB, ...(ORG_FLAVOR[o.slug] ?? [])],
  }))
}

export const SHARED_TAG_VOCAB: readonly string[] = CORE_VOCAB
