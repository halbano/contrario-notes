import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import * as schema from '@/db/schema'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

/**
 * RLS isolation harness — verifies that the policies in `0001_rls.sql`
 * actually deny cross-org reads at the database layer, including the
 * worst-case scenario: app code that mistakenly omits the tenant WHERE
 * clause should still get zero rows from another org.
 *
 * We use a non-owner Postgres role for this test because owners and
 * superusers BYPASSRLS by default. Drizzle's pglite handle uses the default
 * postgres role which IS the owner, so for RLS we drop into a freshly-
 * created `app_user` role and `SET ROLE` it.
 *
 * This mirrors the production setup: Supabase's `authenticated` role does
 * NOT have BYPASSRLS, so RLS applies on every query it runs.
 */

type RawDb = ReturnType<typeof drizzle<typeof schema>>

let pg: PGlite
// pglite's `query` driver is what we use throughout — keep a typed alias.
let db: RawDb

const ORG_A = '11111111-1111-1111-1111-111111111111'
const ORG_B = '22222222-2222-2222-2222-222222222222'
const USER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const USER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

// Apply migration files via pglite's SQL runner (not a shell). The "exec"
// here is a SQL-text submission, not a process exec.
async function runSql(text: string) {
  await pg.query(text)
}

beforeAll(async () => {
  pg = new PGlite()
  db = drizzle(pg, { schema })

  const dir = path.resolve(process.cwd(), 'drizzle')
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const f of files) {
    const sql = readFileSync(path.join(dir, f), 'utf8')
    const statements = sql
      .split(/-->\s*statement-breakpoint/i)
      .map((s) => s.trim())
      .filter(Boolean)
    for (const stmt of statements) {
      await runSql(stmt)
    }
  }

  // Seed: two orgs, one user each, one note each, plus memberships.
  await runSql(`
    INSERT INTO organizations (id, slug, name) VALUES
      ('${ORG_A}', 'a', 'A'),
      ('${ORG_B}', 'b', 'B');
  `)
  await runSql(`
    INSERT INTO users (id, email) VALUES
      ('${USER_A}', 'a@example.com'),
      ('${USER_B}', 'b@example.com');
  `)
  await runSql(`
    INSERT INTO memberships (org_id, user_id, role) VALUES
      ('${ORG_A}', '${USER_A}', 'admin'),
      ('${ORG_B}', '${USER_B}', 'admin');
  `)
  await runSql(`
    INSERT INTO notes (id, org_id, author_id, title, content, visibility) VALUES
      ('aaaaaaaa-1111-1111-1111-111111111111', '${ORG_A}', '${USER_A}', 'A note', 'sec', 'org'),
      ('bbbbbbbb-2222-2222-2222-222222222222', '${ORG_B}', '${USER_B}', 'B note', 'sec', 'org');
  `)

  // Create a non-owner role for RLS to apply to.
  await runSql(`CREATE ROLE app_user NOLOGIN;`)
  await runSql(`GRANT USAGE ON SCHEMA public TO app_user;`)
  await runSql(`
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON ALL TABLES IN SCHEMA public TO app_user;
  `)
})

afterAll(async () => {
  await pg.close()
})

/**
 * Run a single SQL statement with the JWT claim set to the given org-id
 * list, impersonating the non-owner `app_user` role.
 *
 * pglite is single-connection, so we toggle role + claim at session scope
 * (without LOCAL), run the user statement, then reset role for the next
 * caller. This mirrors what Supabase does per-request via
 * `SET request.jwt.claims = ...` on the pooled connection.
 */
async function asAppUser(
  orgIds: string[],
  sql: string,
): Promise<{ rows: Record<string, unknown>[] }> {
  const claims = JSON.stringify({ app_metadata: { org_ids: orgIds } })
  await pg.query(
    `SELECT set_config('request.jwt.claims', '${claims.replace(/'/g, "''")}', false);`,
  )
  await pg.query(`SET ROLE app_user;`)
  try {
    const result = await pg.query(sql)
    return { rows: (result.rows ?? []) as Record<string, unknown>[] }
  } finally {
    // Reset to owner so subsequent helper calls and seed inserts work.
    await pg.query(`RESET ROLE;`)
    await pg.query(`SELECT set_config('request.jwt.claims', '', false);`)
  }
}

describe('RLS — tenant isolation at the DB layer', () => {
  it('a query missing its WHERE clause still returns only rows for the user orgs', async () => {
    const { rows } = await asAppUser([ORG_A], 'SELECT id, org_id FROM notes;')
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => r.org_id === ORG_A)).toBe(true)
  })

  it('users with no org claims see zero rows', async () => {
    const { rows } = await asAppUser([], 'SELECT id FROM notes;')
    expect(rows.length).toBe(0)
  })

  it('cross-org INSERT is rejected by WITH CHECK', async () => {
    await expect(
      asAppUser(
        [ORG_A],
        `INSERT INTO notes (org_id, author_id, title, content, visibility)
         VALUES ('${ORG_B}', '${USER_A}', 'leak', '', 'org');`,
      ),
    ).rejects.toThrow(/row-level security|policy/i)
  })

  it('cross-org UPDATE silently no-ops (USING blocks the foreign row)', async () => {
    const before = await pg.query<{ title: string }>(
      `SELECT title FROM notes WHERE id = 'bbbbbbbb-2222-2222-2222-222222222222';`,
    )
    await asAppUser(
      [ORG_A],
      `UPDATE notes SET title = 'HACKED'
       WHERE id = 'bbbbbbbb-2222-2222-2222-222222222222';`,
    )
    const after = await pg.query<{ title: string }>(
      `SELECT title FROM notes WHERE id = 'bbbbbbbb-2222-2222-2222-222222222222';`,
    )
    expect(after.rows[0]?.title).toBe(before.rows[0]?.title)
    expect(after.rows[0]?.title).toBe('B note')
  })

  it('audit_log SELECT is tenant-scoped', async () => {
    await runSql(`
      INSERT INTO audit_log (org_id, event, payload, success)
      VALUES ('${ORG_A}', 'note.created', '{}'::jsonb, true);
    `)
    await runSql(`
      INSERT INTO audit_log (org_id, event, payload, success)
      VALUES ('${ORG_B}', 'note.created', '{}'::jsonb, true);
    `)
    const { rows } = await asAppUser([ORG_A], `SELECT org_id FROM audit_log;`)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => r.org_id === ORG_A)).toBe(true)
  })
})
