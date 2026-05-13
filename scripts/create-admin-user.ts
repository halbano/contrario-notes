/**
 * scripts/create-admin-user.ts
 *
 * Provision a pre-confirmed Supabase auth user for cloud demos /
 * evaluator access without touching email delivery. Optionally enrolls
 * the user as a member of one of the seeded orgs and pushes the org id
 * into the JWT `app_metadata.org_ids` claim so RLS lights up
 * immediately on first sign-in.
 *
 * Usage:
 *   SUPABASE_URL=https://<project>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service_role_key> \
 *   DATABASE_URL=postgres://... \
 *   npx tsx scripts/create-admin-user.ts \
 *     --email you@example.com \
 *     --password 'DevDemo123!' \
 *     --org studio-aurora \
 *     --role admin
 *
 * Env fallbacks: NEXT_PUBLIC_SUPABASE_URL is accepted for parity with
 * the rest of the codebase.
 *
 * SECURITY: this script uses the service_role key — it can read and
 * write any row. Never check the key into the repo and never run it
 * against production with shared credentials. Treat the output (which
 * echoes the password back) as sensitive.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { eq } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import * as readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { memberships, organizations, users as usersTable } from '@/db/schema'
import { ORG_FIXTURES } from './seed/generators/orgs'

type Role = 'admin' | 'member' | 'viewer'
const ROLES: readonly Role[] = ['admin', 'member', 'viewer']

interface RawArgs {
  email: string | null
  password: string | null
  org: string | null
  role: Role | null
  interactive: boolean
}

interface Args {
  email: string
  password: string
  org: string | null
  role: Role
}

function parseArgs(argv: string[]): RawArgs {
  const out: RawArgs = {
    email: null,
    password: null,
    org: null,
    role: null,
    interactive: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    const next = argv[i + 1]
    switch (flag) {
      case '--email':
        out.email = next ?? null
        i++
        break
      case '--password':
        out.password = next ?? null
        i++
        break
      case '--org':
        out.org = next ?? null
        i++
        break
      case '--role':
        if (next !== 'admin' && next !== 'member' && next !== 'viewer') {
          throw new Error(`--role must be admin|member|viewer, got "${next}"`)
        }
        out.role = next
        i++
        break
      case '--interactive':
      case '-i':
        out.interactive = true
        break
      case '--help':
      case '-h':
        printUsageAndExit(0)
        break
      default:
        if (flag?.startsWith('--')) {
          throw new Error(`Unknown flag: ${flag}`)
        }
    }
  }
  return out
}

/**
 * Decide whether to enter interactive mode. Explicit `--interactive`
 * always wins. Otherwise: TTY available AND a required field is missing.
 */
function shouldPrompt(raw: RawArgs): boolean {
  if (raw.interactive) return true
  if (!input.isTTY) return false
  return !raw.email || !raw.password
}

/**
 * Read a line, hiding echoed characters. Used for password input.
 * Implementation: monkey-patch the readline interface's internal
 * `_writeToOutput` so each keystroke writes a single `*` instead of the
 * actual character. Stdlib-only — no `inquirer`/`prompts` dependency.
 */
async function askHidden(rl: readline.Interface, prompt: string): Promise<string> {
  output.write(prompt)
  const iface = rl as unknown as {
    _writeToOutput: (s: string) => void
    output: NodeJS.WritableStream
  }
  const orig = iface._writeToOutput
  iface._writeToOutput = (s: string) => {
    if (s === '\r\n' || s === '\n' || s === '\r') {
      iface.output.write(s)
    } else {
      iface.output.write('*'.repeat(s.length))
    }
  }
  try {
    return await rl.question('')
  } finally {
    iface._writeToOutput = orig
  }
}

function generatePassword(): string {
  // 16 url-safe-ish chars; mixed case + digits + symbol via prefix.
  const raw = randomBytes(12).toString('base64').replace(/[+/=]/g, '')
  return `Demo!${raw}`
}

async function promptForArgs(raw: RawArgs): Promise<Args> {
  const rl = readline.createInterface({ input, output })
  try {
    output.write('\nInteractive mode. Press Ctrl-C to abort.\n\n')

    let email = raw.email ?? ''
    while (!email || !/^.+@.+\..+$/.test(email)) {
      email = (await rl.question('Email: ')).trim()
      if (!email) email = ''
    }

    let password = raw.password ?? ''
    if (!password) {
      const auto = (
        await rl.question('Generate a random password? [Y/n] ')
      )
        .trim()
        .toLowerCase()
      if (auto === '' || auto === 'y' || auto === 'yes') {
        password = generatePassword()
        output.write(`(generated) ${password}\n`)
      } else {
        while (password.length < 8) {
          password = await askHidden(rl, 'Password (min 8 chars): ')
        }
      }
    }

    output.write('\nSeeded org slugs:\n')
    for (const o of ORG_FIXTURES) output.write(`  - ${o.slug} (${o.name})\n`)
    output.write("  - (leave blank to skip — user lands on /onboarding/create-org)\n")
    let org = raw.org ?? ''
    if (!org) {
      const answer = (await rl.question('Org slug [blank to skip]: ')).trim()
      org = answer
    }
    const validSlugs = new Set(ORG_FIXTURES.map((o) => o.slug))
    while (org && !validSlugs.has(org)) {
      output.write(`  unknown slug: ${org}\n`)
      org = (await rl.question('Org slug [blank to skip]: ')).trim()
    }

    let role: Role = raw.role ?? 'admin'
    if (org) {
      const answer = (
        await rl.question(`Role [admin/member/viewer] (default ${role}): `)
      )
        .trim()
        .toLowerCase()
      if (answer && ROLES.includes(answer as Role)) {
        role = answer as Role
      }
    }

    output.write('\nReview:\n')
    output.write(`  email:    ${email}\n`)
    output.write(`  password: ${'*'.repeat(password.length)} (${password.length} chars)\n`)
    output.write(`  org:      ${org || '(none — onboarding flow)'}\n`)
    output.write(`  role:     ${org ? role : '(n/a — no org)'}\n`)
    const confirm = (
      await rl.question('\nProceed? [Y/n] ')
    )
      .trim()
      .toLowerCase()
    if (confirm && confirm !== 'y' && confirm !== 'yes') {
      throw new Error('Aborted by user')
    }

    return { email, password, org: org || null, role }
  } finally {
    rl.close()
  }
}

function finalizeNonInteractive(raw: RawArgs): Args {
  if (!raw.email) throw new Error('--email is required (or run with --interactive)')
  if (!raw.password) throw new Error('--password is required (or run with --interactive)')
  return {
    email: raw.email,
    password: raw.password,
    org: raw.org,
    role: raw.role ?? 'admin',
  }
}

function printUsageAndExit(code: number): never {
  console.log(
    [
      'Usage:',
      '  tsx scripts/create-admin-user.ts \\',
      '    [--email <addr>] [--password <pw>] [--org <slug>] [--role admin|member|viewer] [--interactive]',
      '',
      'Run with no flags inside a TTY to enter interactive mode. Use',
      '--interactive (-i) to force the prompt even when all flags are supplied.',
      '',
      'Env required:',
      '  SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)',
      '  SUPABASE_SERVICE_ROLE_KEY',
      '  DATABASE_URL (only when --org is set; needed for membership insert)',
      '',
      'Seeded org slugs:',
      ...ORG_FIXTURES.map((o) => `  - ${o.slug}`),
    ].join('\n'),
  )
  process.exit(code)
}

function loadEnv() {
  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl) throw new Error('SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL must be set')
  if (!serviceRole) throw new Error('SUPABASE_SERVICE_ROLE_KEY must be set')
  return { supabaseUrl, serviceRole, databaseUrl: process.env.DATABASE_URL }
}

async function findUserByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<{ id: string; app_metadata: Record<string, unknown> } | null> {
  // listUsers is paginated; 1000 covers our scale comfortably.
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw new Error(`listUsers failed: ${error.message}`)
  const match = data.users.find(
    (u) => (u.email ?? '').toLowerCase() === email.toLowerCase(),
  )
  if (!match) return null
  return {
    id: match.id,
    app_metadata: (match.app_metadata ?? {}) as Record<string, unknown>,
  }
}

async function upsertAuthUser(
  admin: SupabaseClient,
  args: Args,
): Promise<{ userId: string; appMetadata: Record<string, unknown>; created: boolean }> {
  const existing = await findUserByEmail(admin, args.email)
  if (existing) {
    // Reset the password on the existing user. email_confirm cannot be
    // toggled here, but `auth.admin.createUser` already marked it confirmed.
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password: args.password,
    })
    if (error) {
      throw new Error(`updateUserById failed: ${error.message}`)
    }
    return { userId: existing.id, appMetadata: existing.app_metadata, created: false }
  }
  const { data, error } = await admin.auth.admin.createUser({
    email: args.email,
    password: args.password,
    email_confirm: true,
  })
  if (error || !data.user) {
    throw new Error(`createUser failed: ${error?.message ?? 'no user returned'}`)
  }
  return {
    userId: data.user.id,
    appMetadata: (data.user.app_metadata ?? {}) as Record<string, unknown>,
    created: true,
  }
}

async function enrollMembership(opts: {
  databaseUrl: string
  userId: string
  email: string
  orgSlug: string
  role: Role
}): Promise<string> {
  const client = postgres(opts.databaseUrl, { max: 1 })
  const db = drizzle(client)
  try {
    const [org] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, opts.orgSlug))
      .limit(1)
    if (!org) {
      throw new Error(
        `Org slug "${opts.orgSlug}" not found. Run \`npm run seed\` first, or pick one of: ${ORG_FIXTURES.map((o) => o.slug).join(', ')}.`,
      )
    }
    // Mirror in public.users — PR #31 self-heals on first action, but
    // doing it here makes the script idempotent and avoids the
    // first-action FK trap.
    await db
      .insert(usersTable)
      .values({ id: opts.userId, email: opts.email })
      .onConflictDoNothing()
    await db
      .insert(memberships)
      .values({ orgId: org.id, userId: opts.userId, role: opts.role })
      .onConflictDoNothing()
    return org.id
  } finally {
    await client.end({ timeout: 2 })
  }
}

async function syncOrgIdsClaim(
  admin: SupabaseClient,
  userId: string,
  appMetadata: Record<string, unknown>,
  orgId: string,
): Promise<void> {
  const existingIds = Array.isArray(appMetadata.org_ids)
    ? (appMetadata.org_ids as string[])
    : []
  if (existingIds.includes(orgId)) return
  const next = [...existingIds, orgId]
  const { error } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { ...appMetadata, org_ids: next },
  })
  if (error) {
    throw new Error(`updateUserById (app_metadata) failed: ${error.message}`)
  }
}

async function main(): Promise<void> {
  const raw = parseArgs(process.argv.slice(2))
  const args = shouldPrompt(raw)
    ? await promptForArgs(raw)
    : finalizeNonInteractive(raw)
  const env = loadEnv()
  const admin = createClient(env.supabaseUrl, env.serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { userId, appMetadata, created } = await upsertAuthUser(admin, args)
  console.log(`${created ? 'created' : 'updated'} auth user: ${args.email} (${userId})`)

  if (args.org) {
    if (!env.databaseUrl) {
      throw new Error('DATABASE_URL must be set when --org is provided')
    }
    const orgId = await enrollMembership({
      databaseUrl: env.databaseUrl,
      userId,
      email: args.email,
      orgSlug: args.org,
      role: args.role,
    })
    await syncOrgIdsClaim(admin, userId, appMetadata, orgId)
    console.log(`enrolled in org ${args.org} (${orgId}) as ${args.role}`)
  }

  console.log('---')
  console.log(`email:    ${args.email}`)
  console.log(`password: ${args.password}`)
  console.log('Sign in at /sign-in. JWT carries the org claim on next sign-in.')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
