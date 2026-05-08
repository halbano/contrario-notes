/**
 * Notes generator.
 *
 * Goes through `NotesService.createWithVersion` + `setNoteTags` + (optional)
 * `updateWithVersion` so the same code path real users hit is exercised end
 * to end — including the version-row snapshot. Per the seed-agent spec,
 * "if seed bypasses services, any service-layer bug it would mask is also
 * a bug under real traffic".
 *
 * Visibility distribution per org (matches ADR-0007 brief):
 *   ~70% org, ~20% private, ~10% shared.
 *
 * Version histories are skewed low: most notes have 1 version, some 2,
 * a few up to 5. We achieve this by issuing follow-up `updateWithVersion`
 * calls for the ~20% / ~5% slices.
 */
import { createScopedServices } from '@/services'
import { createLogger } from '@/logging'
import type { RequestContext } from '@/lib/request-context'
import type { AnyDb } from '@/repositories'
import { pick, randInt, weighted, type Rng } from '../lib/random'
import type { SeededOrg } from './orgs'
import type { SeededMembership } from './memberships'
import { listForOrg } from './memberships'
import type { OrgTagVocab } from './tags'

export type SeededNote = {
  id: string
  orgId: string
  authorId: string
  visibility: 'org' | 'private' | 'shared'
  versionCount: number
  tagNames: string[]
}

const TITLE_HEADS = [
  'Q3 roadmap',
  'Weekly retro',
  'Spec',
  'Bug triage',
  'Launch checklist',
  'Design review',
  'Planning notes',
  'Onboarding',
  'Research log',
  'Customer call',
] as const

const TITLE_TAILS = [
  'draft',
  'v2',
  'follow-up',
  'open questions',
  'decisions',
  'checklist',
  'summary',
  'recap',
] as const

const CONTENT_FRAGMENTS = [
  'Discussed open issues and assigned owners.',
  'Need to confirm scope with stakeholders next week.',
  'Blocking item: still waiting on the storage migration.',
  'Action items: 1) update spec, 2) ping QA, 3) schedule review.',
  'No risks surfaced.',
  'Reminder: ship before EoQ.',
  'Open question — does this affect tier-2 customers?',
  'Decision: proceed with option B.',
] as const

const VISIBILITY_DIST = [
  { value: 'org' as const, weight: 70 },
  { value: 'private' as const, weight: 20 },
  { value: 'shared' as const, weight: 10 },
]

const VERSION_DIST = [
  { value: 1, weight: 70 },
  { value: 2, weight: 20 },
  { value: 3, weight: 7 },
  { value: 4, weight: 2 },
  { value: 5, weight: 1 },
]

const silentLogger = createLogger({ sink: () => undefined, minLevel: 'error' })

function buildTitle(rng: Rng, orgSlug: string): string {
  const head = pick(rng, TITLE_HEADS)
  const tail = pick(rng, TITLE_TAILS)
  // Inject the org slug at random ~25% of the time so titles overlap across
  // orgs but each org has a few uniquely-spelled ones too — matches the
  // "near-duplicate titles for search-leak tests" requirement.
  if (rng() < 0.25) return `${head} — ${orgSlug} ${tail}`
  return `${head} — ${tail}`
}

function buildContent(rng: Rng): string {
  const lines = randInt(rng, 1, 4)
  const out: string[] = []
  for (let i = 0; i < lines; i++) out.push(pick(rng, CONTENT_FRAGMENTS))
  return out.join('\n')
}

function pickTagsFor(rng: Rng, vocab: OrgTagVocab): string[] {
  const n = randInt(rng, 0, 3)
  const out = new Set<string>()
  for (let i = 0; i < n; i++) out.add(pick(rng, vocab.vocab))
  return [...out]
}

export type NotesPlan = {
  totalNotes: number
  perOrg: { orgId: string; count: number }[]
}

/**
 * Skewed distribution: the first two orgs get the lion's share to mirror
 * the ADR-0007 brief (3000/3000/1000/1000/1000 for full; scaled for small).
 */
export function planNotes(orgs: readonly SeededOrg[], total: number): NotesPlan {
  const weights = [3, 3, 1, 1, 1]
  const sum = weights.reduce((a, b) => a + b, 0)
  const perOrg = orgs.map((o, i) => ({
    orgId: o.id,
    count: Math.round((weights[i] ?? 1) / sum * total),
  }))
  // Account for rounding drift — adjust the largest bucket to hit `total`.
  const drift = total - perOrg.reduce((s, p) => s + p.count, 0)
  if (drift !== 0 && perOrg[0]) perOrg[0].count += drift
  return { totalNotes: total, perOrg }
}

export async function seedNotes(opts: {
  db: AnyDb
  rng: Rng
  orgs: readonly SeededOrg[]
  memberships: readonly SeededMembership[]
  tagVocabs: readonly OrgTagVocab[]
  plan: NotesPlan
  /** Bound concurrent in-flight create+version transactions. */
  concurrency?: number
}): Promise<SeededNote[]> {
  const all: SeededNote[] = []
  const concurrency = opts.concurrency ?? 8

  for (const orgPlan of opts.plan.perOrg) {
    const org = opts.orgs.find((o) => o.id === orgPlan.orgId)
    if (!org) continue
    const orgMembers = listForOrg(org.id, opts.memberships)
    // Authors are everyone whose role can create — admin or member, NOT viewer.
    const authors = orgMembers.filter((m) => m.role !== 'viewer')
    if (authors.length === 0) continue
    const vocab = opts.tagVocabs.find((v) => v.orgId === org.id)
    if (!vocab) continue

    // Build the work list deterministically.
    type Job = {
      author: SeededMembership
      visibility: 'org' | 'private' | 'shared'
      versions: number
      tagNames: string[]
      title: string
      content: string
    }
    const jobs: Job[] = []
    for (let i = 0; i < orgPlan.count; i++) {
      const author = pick(opts.rng, authors)
      const visibility = weighted(opts.rng, VISIBILITY_DIST)
      const versions = weighted(opts.rng, VERSION_DIST)
      jobs.push({
        author,
        visibility,
        versions,
        tagNames: pickTagsFor(opts.rng, vocab),
        title: buildTitle(opts.rng, org.slug),
        content: buildContent(opts.rng),
      })
    }

    // Run jobs through the scoped service in a small worker pool. Each
    // worker gets its own ServicesFactory (cheap) but shares the db handle.
    let cursor = 0
    async function worker(): Promise<void> {
      while (true) {
        const idx = cursor++
        if (idx >= jobs.length) return
        const job = jobs[idx]!
        const ctx: RequestContext = Object.freeze({
          userId: job.author.userId,
          orgId: job.author.orgId,
          role: job.author.role,
        })
        const services = createScopedServices(ctx, {
          db: opts.db,
          logger: silentLogger,
        })
        const note = await services.notes.createWithVersion({
          authorId: ctx.userId,
          title: job.title,
          content: job.content,
          visibility: job.visibility,
          tagsText: job.tagNames.join(', '),
        })
        if (job.tagNames.length > 0) {
          await services.notes.setNoteTags(note.id, job.tagNames)
        }
        // Extra revisions to populate version history.
        for (let v = 1; v < job.versions; v++) {
          await services.notes.updateWithVersion(note.id, {
            content: `${job.content}\n--- revision ${v + 1} ---\n${pick(
              opts.rng,
              CONTENT_FRAGMENTS,
            )}`,
          })
        }
        all.push({
          id: note.id,
          orgId: note.orgId,
          authorId: note.authorId,
          visibility: job.visibility,
          versionCount: job.versions,
          tagNames: job.tagNames,
        })
      }
    }

    const workers = Array.from({ length: concurrency }, () => worker())
    await Promise.all(workers)
  }

  return all
}
