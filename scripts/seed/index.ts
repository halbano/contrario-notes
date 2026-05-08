/* eslint-disable no-console */
/**
 * Seed CLI entry. Generates a deterministic, multi-tenant dataset through
 * the same scoped services real users hit. Two profiles:
 *
 *   SEED_PROFILE=small  100 notes (default — safe for laptops + pglite).
 *   SEED_PROFILE=full   10,000 notes (the ADR-0007 brief target).
 *
 * Targets:
 *   SEED_TARGET=pglite      In-process WASM Postgres. No env required.
 *   SEED_TARGET=postgres    Real DB via DATABASE_URL. DEFAULT.
 *
 * Cloud safety: `DATABASE_URL` whose host is not localhost / 127.0.0.1
 * is refused unless `--i-know-this-is-cloud` is supplied. `seed:reset`
 * obeys the same guard.
 *
 * Determinism: every random choice flows from a single seeded RNG
 * (`SEED_RNG`, default 42). Re-running with the same seed against a fresh
 * DB produces the same data.
 */
import { loadDotEnv } from './lib/load-env'
import { evaluateCloudGuard } from './lib/cloud-guard'
import { openPgliteDb, openPostgresDb, type SeedDbHandle } from './lib/db-handle'
import { makeRng } from './lib/random'
import { resetTables } from './reset'
import { seedOrgs } from './generators/orgs'
import { planUserOrgs, seedUsers, type SupabaseAdminLike } from './generators/users'
import { seedMemberships } from './generators/memberships'
import { buildTagVocab } from './generators/tags'
import { planNotes, seedNotes } from './generators/notes'
import { seedShares } from './generators/shares'
import { seedFiles } from './generators/files'

type CliFlags = {
  reset: boolean
  override: boolean
  target: 'postgres' | 'pglite'
  profile: 'small' | 'full'
  rngSeed: number
}

function parseFlags(): CliFlags {
  const args = process.argv.slice(2)
  const reset = args.includes('--reset')
  const override = args.includes('--i-know-this-is-cloud')
  const targetEnv = (process.env.SEED_TARGET ?? '').toLowerCase()
  const target: 'postgres' | 'pglite' = targetEnv === 'pglite' ? 'pglite' : 'postgres'
  const profileEnv = (process.env.SEED_PROFILE ?? 'small').toLowerCase()
  const profile: 'small' | 'full' = profileEnv === 'full' ? 'full' : 'small'
  const rngSeed = Number.parseInt(process.env.SEED_RNG ?? '42', 10) || 42
  return { reset, override, target, profile, rngSeed }
}

const PROFILE_TARGETS = {
  small: { totalNotes: 100, userCount: 30, overlapCount: 5 },
  full: { totalNotes: 10_000, userCount: 30, overlapCount: 5 },
} as const

async function maybeBuildSupabaseAdmin(
  driver: 'postgres-js' | 'pglite',
): Promise<SupabaseAdminLike | null> {
  if (driver === 'pglite') return null
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.warn(
      '[seed] Supabase admin env vars missing — skipping auth.users provisioning. ' +
        'public.users rows will still be inserted.',
    )
    return null
  }
  // Lazy import so pglite test runs (which have no @supabase/supabase-js
  // env) don't pay the resolution cost.
  const { createClient } = await import('@supabase/supabase-js')
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return client as unknown as SupabaseAdminLike
}

export type SeedReport = {
  profile: 'small' | 'full'
  driver: 'postgres-js' | 'pglite'
  durationMs: number
  counts: {
    orgs: number
    users: number
    memberships: number
    notes: number
    versions: number
    shares: number
    files: number
  }
}

export async function runSeed(handle: SeedDbHandle, flags: CliFlags): Promise<SeedReport> {
  const t0 = Date.now()
  const targets = PROFILE_TARGETS[flags.profile]
  const rng = makeRng(flags.rngSeed)

  if (flags.reset) {
    console.log('[seed] resetting tables…')
    await resetTables(handle.db)
  }

  console.log(`[seed] driver=${handle.driver} profile=${flags.profile} rngSeed=${flags.rngSeed}`)

  const orgs = await seedOrgs(handle.db)
  console.log(`[seed] orgs: ${orgs.length}`)

  const userPlan = planUserOrgs({
    count: targets.userCount,
    orgs,
    overlapCount: targets.overlapCount,
    seed: flags.rngSeed,
  })
  const supabaseAdmin = await maybeBuildSupabaseAdmin(handle.driver)
  const users = await seedUsers({
    db: handle.db,
    rng,
    plan: userPlan,
    supabaseAdmin,
  })
  console.log(`[seed] users: ${users.length}`)

  const memberships = await seedMemberships({
    db: handle.db,
    rng,
    orgs,
    users,
  })
  console.log(`[seed] memberships: ${memberships.length}`)

  const tagVocabs = buildTagVocab(orgs)

  const notesPlan = planNotes(orgs, targets.totalNotes)
  const notes = await seedNotes({
    db: handle.db,
    rng,
    orgs,
    memberships,
    tagVocabs,
    plan: notesPlan,
    concurrency: handle.driver === 'pglite' ? 4 : 8,
  })
  const versionTotal = notes.reduce((s, n) => s + n.versionCount, 0)
  console.log(`[seed] notes: ${notes.length}  versions: ${versionTotal}`)

  const shares = await seedShares({
    db: handle.db,
    rng,
    notes,
    memberships,
  })
  console.log(`[seed] note_shares: ${shares.length}`)

  const fileRows = await seedFiles({
    db: handle.db,
    rng,
    notes,
  })
  console.log(`[seed] files: ${fileRows.length}`)

  const durationMs = Date.now() - t0
  console.log(`[seed] DONE in ${durationMs}ms`)

  return {
    profile: flags.profile,
    driver: handle.driver,
    durationMs,
    counts: {
      orgs: orgs.length,
      users: users.length,
      memberships: memberships.length,
      notes: notes.length,
      versions: versionTotal,
      shares: shares.length,
      files: fileRows.length,
    },
  }
}

async function main(): Promise<void> {
  const flags = parseFlags()
  loadDotEnv()

  let handle: SeedDbHandle
  if (flags.target === 'pglite') {
    handle = await openPgliteDb()
  } else {
    const url = process.env.DATABASE_URL
    if (!url) {
      console.error(
        '[seed] DATABASE_URL is not set. Either populate `.env.local` or run with SEED_TARGET=pglite for an in-memory dry run.',
      )
      process.exit(1)
    }
    const guard = evaluateCloudGuard({ url, override: flags.override })
    if (guard.shouldRefuse) {
      console.error(`[seed] ${guard.reason}`)
      process.exit(2)
    }
    if (!guard.isLocal) {
      console.warn(
        `[seed] Cloud target detected (host=${guard.host}). Override flag is set — proceeding.`,
      )
    }
    handle = await openPostgresDb(url)
  }

  try {
    await runSeed(handle, flags)
  } finally {
    await handle.close()
  }
}

// Run only when invoked directly (not when imported by tests).
const invokedDirectly =
  typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module
const isMainEsm =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  /scripts\/seed\/index\.(ts|js)$/.test(process.argv[1])

if (invokedDirectly || isMainEsm) {
  main().catch((err: unknown) => {
    console.error('[seed] FAILED', err)
    process.exit(1)
  })
}
