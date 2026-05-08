/**
 * User + auth-user provisioning.
 *
 * Real-traffic flow: Supabase admin client creates an `auth.users` row with
 * `app_metadata.org_ids` populated, and an app trigger / app code mirrors
 * that into `public.users`. The seed mirrors the same pattern when a
 * Supabase admin client is supplied (cloud target). Against pglite there is
 * no `auth` schema, so we insert the `public.users` row directly.
 *
 * `app_metadata.org_ids` MUST be the full set of org ids the user will get
 * memberships in — RLS predicates depend on it. The membership generator
 * runs after this and aligns its rows with that array.
 */
import { users as usersTable } from '@/db/schema'
import type { AnyDb } from '@/repositories'
import type { SeededOrg } from './orgs'
import { makeRng, pickN, randInt, type Rng } from '../lib/random'

export type SeededUser = {
  id: string
  email: string
  displayName: string
  /** Orgs this user will belong to. */
  orgIds: string[]
}

export type SupabaseAdminLike = {
  auth: {
    admin: {
      createUser(input: {
        email: string
        email_confirm: boolean
        password?: string
        app_metadata?: Record<string, unknown>
        user_metadata?: Record<string, unknown>
      }): Promise<{
        data: { user: { id: string } | null } | null
        error: { message: string } | null
      }>
    }
  }
}

const DISPLAY_NAMES = [
  'Ada Park',
  'Bram Holst',
  'Cleo Vance',
  'Diego Rios',
  'Esme Walker',
  'Finn Okafor',
  'Gemma Reyes',
  'Hugo Sato',
  'Imani Patel',
  'Juno Vega',
  'Kai Tan',
  'Lior Mendez',
  'Mira Castelli',
  'Niko Bauer',
  'Ondine Ferrer',
  'Pax Mishra',
  'Quinn Albright',
  'Rafa Solano',
  'Selma Yates',
  'Tariq Boudreau',
  'Una Romero',
  'Veda Nakamura',
  'Wren Aldair',
  'Xio Camargo',
  'Yara Halpern',
  'Zane Cordeiro',
  'Aria Bex',
  'Bo Linde',
  'Cyra Pell',
  'Dax Ortiz',
] as const

/**
 * Distribute users across orgs so most live in exactly one org and roughly
 * five users span two orgs. The 5/30 ratio mirrors the brief's "overlapping
 * memberships" requirement. Deterministic via `seed`.
 */
export function planUserOrgs(opts: {
  count: number
  orgs: readonly SeededOrg[]
  overlapCount: number
  seed: number
}): { displayName: string; orgIds: string[] }[] {
  const rng = makeRng(opts.seed)
  const orgIds = opts.orgs.map((o) => o.id)
  const overlap = Math.min(opts.overlapCount, opts.count, opts.orgs.length * 2)
  return Array.from({ length: opts.count }, (_, i) => {
    const display = DISPLAY_NAMES[i % DISPLAY_NAMES.length]!
    if (i < overlap) {
      // Two distinct orgs.
      const pair = pickN(rng, orgIds, 2)
      return { displayName: display, orgIds: pair }
    }
    // Single-org user, balanced round-robin so every org gets coverage.
    const home = orgIds[i % orgIds.length]!
    return { displayName: display, orgIds: [home] }
  })
}

export async function seedUsers(opts: {
  db: AnyDb
  rng: Rng
  plan: ReturnType<typeof planUserOrgs>
  supabaseAdmin?: SupabaseAdminLike | null
  emailDomain?: string
}): Promise<SeededUser[]> {
  const domain = opts.emailDomain ?? 'seed.contrario.dev'
  const out: SeededUser[] = []

  for (let i = 0; i < opts.plan.length; i++) {
    const slot = opts.plan[i]!
    const slug = slot.displayName.toLowerCase().replace(/[^a-z]+/g, '-')
    const email = `${slug}-${i + 1}@${domain}`

    let userId: string | null = null
    if (opts.supabaseAdmin) {
      const res = await opts.supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        password: deterministicPassword(opts.rng),
        app_metadata: { org_ids: slot.orgIds },
        user_metadata: { display_name: slot.displayName },
      })
      if (res.error) {
        // If the user already exists from a previous seed run, skip — the
        // public.users row insert below uses onConflictDoNothing.
        if (!/already registered|already exists/i.test(res.error.message)) {
          throw new Error(
            `supabase.auth.admin.createUser failed for ${email}: ${res.error.message}`,
          )
        }
      } else if (res.data?.user?.id) {
        userId = res.data.user.id
      }
    }

    // Mirror row in public.users. We deterministically generate an id when
    // there's no Supabase admin (pglite path); otherwise use the auth id.
    const id = userId ?? deterministicUserId(i)
    out.push({
      id,
      email,
      displayName: slot.displayName,
      orgIds: slot.orgIds,
    })
  }

  // Bulk insert public.users for performance — `users` is not tenant-scoped
  // and the service layer has no createUser method (real path goes via
  // Supabase auth). Justification documented at module-level.
  await opts.db
    .insert(usersTable)
    .values(out.map((u) => ({ id: u.id, email: u.email, displayName: u.displayName })))
    .onConflictDoNothing()

  return out
}

function deterministicPassword(rng: Rng): string {
  // Long enough to clear Supabase's default length policy; never logged.
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let s = 'Seed!'
  for (let i = 0; i < 16; i++) {
    s += chars[randInt(rng, 0, chars.length - 1)]
  }
  return s
}

function deterministicUserId(idx: number): string {
  // RFC 4122 v4 shape, deterministic from idx. Version nibble fixed to 4
  // and variant nibble to 8. The trailing 12-char segment encodes the
  // user index in its lower 4 chars, prefixed with `b00000000` — a
  // sentinel that never collides with the org-id space (which uses
  // `000000000aNN` in the same slot).
  const idxHex = (idx + 1).toString(16).padStart(4, '0')
  // 12-char segment = `b` (1) + zero pad (7) + idx (4) = 12.
  return `00000000-0000-4000-8000-b0000000${idxHex}`
}
