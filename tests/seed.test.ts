/**
 * Seed sanity harness. Runs the small profile against pglite and asserts
 * the cross-org / version / tag / share invariants the spec calls out.
 *
 * Never targets a real DB — pglite only.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq, count, sql } from 'drizzle-orm'
import {
  notes,
  noteShares,
  noteTags,
  noteVersions,
  organizations,
  tags,
  files,
  memberships,
  users,
} from '@/db/schema'
import { openPgliteDb, type SeedDbHandle } from '@/scripts/seed/lib/db-handle'
import { runSeed, type SeedReport } from '@/scripts/seed/index'
import { evaluateCloudGuard } from '@/scripts/seed/lib/cloud-guard'

let handle: SeedDbHandle
let report: SeedReport

beforeAll(async () => {
  handle = await openPgliteDb()
  report = await runSeed(handle, {
    reset: false,
    override: false,
    target: 'pglite',
    profile: 'small',
    rngSeed: 42,
  })
}, 60_000)

afterAll(async () => {
  await handle.close()
})

describe('seed — sanity', () => {
  it('produces 5 orgs and ~30 users', async () => {
    const orgRows = await handle.db.select().from(organizations)
    expect(orgRows.length).toBe(5)
    const userRows = await handle.db.select().from(users)
    expect(userRows.length).toBe(30)
  })

  it('every note has a valid org_id, author_id, and at least one version', async () => {
    const noteRows = await handle.db.select().from(notes)
    expect(noteRows.length).toBeGreaterThan(0)
    for (const n of noteRows) {
      expect(n.orgId).toBeTruthy()
      expect(n.authorId).toBeTruthy()
    }
    // Per-note version count >= 1.
    const versionCounts = await handle.db
      .select({ noteId: noteVersions.noteId, n: count() })
      .from(noteVersions)
      .groupBy(noteVersions.noteId)
    const versionMap = new Map(versionCounts.map((r) => [r.noteId, Number(r.n)]))
    for (const n of noteRows) {
      const v = versionMap.get(n.id) ?? 0
      expect(v).toBeGreaterThanOrEqual(1)
    }
  })

  it('per-org note counts match the planned distribution within tolerance', async () => {
    const perOrg = await handle.db
      .select({ orgId: notes.orgId, n: count() })
      .from(notes)
      .groupBy(notes.orgId)
    const sum = perOrg.reduce((s, r) => s + Number(r.n), 0)
    expect(sum).toBe(report.counts.notes)
    // Skew check: the two heaviest orgs together hold >50% of notes.
    const sorted = perOrg.map((r) => Number(r.n)).sort((a, b) => b - a)
    const top2 = (sorted[0] ?? 0) + (sorted[1] ?? 0)
    expect(top2 / sum).toBeGreaterThan(0.5)
  })

  it('no note_shares row crosses org boundaries', async () => {
    // Every share row's org_id must equal its note's org_id AND its grantee
    // must hold a membership row for that org.
    const rows = await handle.db
      .select({
        shareOrg: noteShares.orgId,
        noteOrg: notes.orgId,
        userId: noteShares.userId,
      })
      .from(noteShares)
      .innerJoin(notes, eq(notes.id, noteShares.noteId))
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(r.shareOrg).toBe(r.noteOrg)
    }
    // Cross-check via memberships: every grantee is a member of the share's org.
    const memRows = await handle.db.select().from(memberships)
    const memSet = new Set(memRows.map((m) => `${m.orgId}::${m.userId}`))
    for (const r of rows) {
      expect(memSet.has(`${r.shareOrg}::${r.userId}`)).toBe(true)
    }
  })

  it('tag vocabulary overlaps across orgs', async () => {
    const tagRows = await handle.db.select().from(tags)
    const byOrg = new Map<string, Set<string>>()
    for (const t of tagRows) {
      let s = byOrg.get(t.orgId)
      if (!s) {
        s = new Set()
        byOrg.set(t.orgId, s)
      }
      s.add(t.name)
    }
    const orgIds = [...byOrg.keys()]
    expect(orgIds.length).toBeGreaterThanOrEqual(2)
    // Every shared core tag should appear in at least 2 orgs.
    const allTagNames = new Set<string>()
    for (const set of byOrg.values()) {
      for (const n of set) allTagNames.add(n)
    }
    let overlapping = 0
    for (const name of allTagNames) {
      const orgsWith = [...byOrg.values()].filter((s) => s.has(name)).length
      if (orgsWith >= 2) overlapping++
    }
    expect(overlapping).toBeGreaterThan(0)
  })

  it('every note_tags row carries the same org_id as its note', async () => {
    const rows = await handle.db
      .select({ ntOrg: noteTags.orgId, noteOrg: notes.orgId })
      .from(noteTags)
      .innerJoin(notes, eq(notes.id, noteTags.noteId))
    for (const r of rows) {
      expect(r.ntOrg).toBe(r.noteOrg)
    }
  })

  it('files belong to their note org and only ~10-20% of notes have files', async () => {
    const noteRows = await handle.db.select({ id: notes.id }).from(notes)
    const fileRows = await handle.db.select().from(files)
    // Every file row's org_id matches its note's org_id.
    const noteOrg = new Map<string, string>()
    const noteOrgRows = await handle.db
      .select({ id: notes.id, orgId: notes.orgId })
      .from(notes)
    for (const r of noteOrgRows) noteOrg.set(r.id, r.orgId)
    for (const f of fileRows) {
      if (!f.noteId) continue
      expect(f.orgId).toBe(noteOrg.get(f.noteId))
    }
    const distinctNotes = new Set(fileRows.map((f) => f.noteId).filter(Boolean))
    const ratio = distinctNotes.size / noteRows.length
    // Loose bounds — the generator targets 15%.
    expect(ratio).toBeGreaterThanOrEqual(0.05)
    expect(ratio).toBeLessThanOrEqual(0.3)
  })

  it('visibility distribution roughly matches 70/20/10', async () => {
    const dist = await handle.db
      .select({ visibility: notes.visibility, n: count() })
      .from(notes)
      .groupBy(notes.visibility)
    const total = dist.reduce((s, r) => s + Number(r.n), 0)
    const map = new Map(dist.map((r) => [r.visibility, Number(r.n)]))
    const orgPct = (map.get('org') ?? 0) / total
    const privatePct = (map.get('private') ?? 0) / total
    // Wide tolerance — small profile is only 100 notes so binomial noise is large.
    expect(orgPct).toBeGreaterThan(0.5)
    expect(orgPct).toBeLessThan(0.85)
    expect(privatePct).toBeGreaterThan(0.05)
  })

  it('every note version row is org-scoped to its parent note', async () => {
    // Avoid noteVersions.noteId types that drizzle can't infer in pglite —
    // do the join in SQL directly.
    const rows = await handle.db.execute<{ same: number }>(
      sql`select count(*)::int as same from note_versions nv
          join notes n on n.id = nv.note_id
          where nv.org_id <> n.org_id`,
    )
    // node-postgres returns rows; pglite returns rows on .rows
    const count1 = Array.isArray(rows)
      ? (rows[0]?.same ?? 0)
      : ((rows as unknown as { rows: { same: number }[] }).rows?.[0]?.same ?? 0)
    expect(count1).toBe(0)
  })

  it('note_versions count matches reported total', async () => {
    const rows = await handle.db.select({ n: count() }).from(noteVersions)
    expect(Number(rows[0]?.n ?? 0)).toBe(report.counts.versions)
  })

  // Suppress unused-import warning — `and` is referenced above implicitly via drizzle.
  void and
})

describe('seed — cloud guard', () => {
  it('refuses non-local URLs without override', () => {
    const result = evaluateCloudGuard({
      url: 'postgres://user:pass@db.abcdefg.supabase.co:5432/postgres',
      override: false,
    })
    expect(result.shouldRefuse).toBe(true)
    expect(result.host).toContain('supabase.co')
  })

  it('accepts non-local URLs with override', () => {
    const result = evaluateCloudGuard({
      url: 'postgres://user:pass@db.abcdefg.supabase.co:5432/postgres',
      override: true,
    })
    expect(result.shouldRefuse).toBe(false)
  })

  it('always accepts localhost', () => {
    const result = evaluateCloudGuard({
      url: 'postgres://postgres:postgres@localhost:5432/postgres',
      override: false,
    })
    expect(result.shouldRefuse).toBe(false)
    expect(result.isLocal).toBe(true)
  })

  it('always accepts 127.0.0.1', () => {
    const result = evaluateCloudGuard({
      url: 'postgres://postgres:postgres@127.0.0.1:5432/postgres',
      override: false,
    })
    expect(result.shouldRefuse).toBe(false)
    expect(result.isLocal).toBe(true)
  })
})
