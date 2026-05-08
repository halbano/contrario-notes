/**
 * note_shares generator. Only `visibility = 'shared'` notes get rows here,
 * and grants are issued via `NotesService.shareNote` so the same
 * "target-must-be-org-member" guard real callers hit is exercised. This is
 * also why we never even try to grant cross-org — the service would reject
 * it with `invalid_input`.
 *
 * Each shared note gets 1..3 grantees, picked from the same org.
 */
import { createScopedServices } from '@/services'
import { createLogger } from '@/logging'
import type { RequestContext } from '@/lib/request-context'
import type { AnyDb } from '@/repositories'
import { pickN, randInt, type Rng } from '../lib/random'
import type { SeededMembership } from './memberships'
import { listForOrg } from './memberships'
import type { SeededNote } from './notes'

export type SeededShare = {
  orgId: string
  noteId: string
  userId: string
  canEdit: boolean
}

const silentLogger = createLogger({ sink: () => undefined, minLevel: 'error' })

export async function seedShares(opts: {
  db: AnyDb
  rng: Rng
  notes: readonly SeededNote[]
  memberships: readonly SeededMembership[]
}): Promise<SeededShare[]> {
  const out: SeededShare[] = []
  const sharedNotes = opts.notes.filter((n) => n.visibility === 'shared')

  for (const note of sharedNotes) {
    const orgMembers = listForOrg(note.orgId, opts.memberships)
    const candidates = orgMembers.filter((m) => m.userId !== note.authorId)
    if (candidates.length === 0) continue

    const grantee = candidates.find((m) => m.role === 'admin') ?? candidates[0]!
    const ctx: RequestContext = Object.freeze({
      userId: grantee.userId,
      orgId: note.orgId,
      role: grantee.role,
    })

    // The author or an admin issues the grants. Pick the author when
    // available; otherwise fall back to an org admin (the spec allows both).
    const author = orgMembers.find((m) => m.userId === note.authorId)
    const issuer = author ?? grantee
    const issuerCtx: RequestContext = Object.freeze({
      userId: issuer.userId,
      orgId: note.orgId,
      role: issuer.role,
    })
    const services = createScopedServices(issuerCtx, {
      db: opts.db,
      logger: silentLogger,
    })

    const grantCount = Math.min(
      randInt(opts.rng, 1, 3),
      candidates.length,
    )
    const targets = pickN(opts.rng, candidates, grantCount)
    for (const target of targets) {
      const canEdit = opts.rng() < 0.4
      try {
        await services.notes.shareNote({
          noteId: note.id,
          userId: target.userId,
          canEdit,
        })
        out.push({
          orgId: note.orgId,
          noteId: note.id,
          userId: target.userId,
          canEdit,
        })
      } catch (err) {
        // The service rejects cross-org and viewer-author paths. We
        // construct grants that should always succeed; surface anything
        // unexpected so the seed run fails loudly.
        throw new Error(
          `shareNote failed for note=${note.id} target=${target.userId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
      }
    }
    // Use ctx to satisfy "constructed but unused" — kept for future debug logs.
    void ctx
  }
  return out
}
