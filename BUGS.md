# BUGS.md

Known issues. Append on discovery. Update on fix.

## Format

```md
### BUG-NNNN — <title>
- Reported: <date>
- Severity: critical | high | medium | low
- Surface: <area>
- Repro: <steps>
- Root cause: <analysis>
- Fix: <description + commit/PR>
- Prevention: <test/lint/check added>
```

## Open

### BUG-0001 — Sign-up flow lacks user-facing feedback after submit
- Reported: 2026-05-09 (user, dev session)
- Severity: medium
- Surface: `/sign-up`, `/sign-in`, `/forgot-password` (auth UI flows)
- Repro: submit a valid sign-up form. Server action returns void; no toast / inline confirmation / redirect target communicates "we sent you a confirmation email — check your inbox" to the user. Same shape on sign-in success when it succeeds (silent redirect on the happy path).
- Root cause: PR #8 wired the server actions to Supabase but the UI never shipped a structured success state. The frontend agent's initial pass left action wiring as `TODO(auth-agent)`; auth-agent wired the call but didn't extend the UI to render a success surface.
- Fix: pending. Plan: add a `success` state to the form result discriminator (`{ ok: true, message: '...' }`) and render a `success` variant of the existing `ErrorState`-style component (or a small `Alert variant="success"`). Apply at all three auth surfaces.
- Prevention: extend the screenshot harness to capture each form in `submitted` state (Playwright fills + clicks); CI's `npm run check:nav` currently catches 404s but not silent-success.

### BUG-0002 — Email-validation landing page broken / not implemented
- Reported: 2026-05-09 (user)
- Severity: high
- Surface: Supabase auth email confirmation deep-link
- Repro: user signs up → Supabase emails a confirmation link `https://<project>.supabase.co/auth/v1/verify?token=...&redirect_to=<APP_URL>/...`. After verify, user lands at the configured redirect URL. Currently no `/auth/callback` route exists in the app, so the user lands on a 404 or a stale page.
- Root cause: Supabase's email-confirm flow expects a server-side callback the app exposes (typical `/auth/callback?code=...` route that exchanges the code for a session via `supabase.auth.exchangeCodeForSession`). PR #8 didn't ship this route — the auth flow assumes already-confirmed users.
- Fix: pending. Plan: add `app/(auth)/callback/route.ts` (Route Handler) that:
  1. Reads `code` from search params.
  2. Calls `supabase.auth.exchangeCodeForSession(code)` against the SSR client.
  3. On success: redirects to `/` (which then runs the first-org bootstrap if needed).
  4. On failure: redirects to `/sign-in?error=verify_failed` with a friendly inline error.
- Prevention: integration test against a real Supabase project (mocking is brittle here — the exchange call is internal SDK behavior). Add a `tests/auth-callback.test.ts` smoke once a CI Supabase test instance exists (CI-04 follow-up).

### BUG-0003 — `auth.users` accumulates seed rows on rerun
- Reported: 2026-05-09 (seed-agent open question)
- Severity: low
- Surface: cloud DB — `auth.users` table after seed reruns.
- Repro: run `npm run seed --i-know-this-is-cloud` against cloud Supabase twice. `public.users` gets truncated by `seed:reset`. `auth.users` retains the synthesized seed accounts forever.
- Root cause: `seed:reset` only TRUNCATEs `public.*` tables. Supabase Auth lives in the protected `auth.*` schema; seed creates auth users via `admin.createUser` but reset doesn't have a delete pass.
- Fix: pending. Plan: add a `seed:reset:auth` companion that pages through `admin.auth.admin.listUsers` and deletes by email pattern (`*@seed.contrario.dev`). Gated by the same `--i-know-this-is-cloud` guard.
- Prevention: tracked in `docs/SEED.md` runbook; seed-agent's open question for orchestrator.

### BUG-0004 — `auth.users` ↔ `public.users` mirror has no trigger / app code (yet)
- Reported: 2026-05-09 (seed-agent open question)
- Severity: medium
- Surface: any signup flow against cloud Supabase.
- Repro: real user signs up via `supabase.auth.signUp(...)`. `auth.users` row created. App code in `services/orgs-service.createFirstOrgAction` reads `public.users` for membership wiring — finds no row, errors.
- Root cause: spec mentions "an app trigger or app code mirrors auth.users into public.users" but no such trigger lives in `drizzle/`. Auth-agent's PR #8 assumed the mirror would land separately; it did not.
- Fix: pending. Plan options:
  - **A** Postgres trigger: `CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();` Function inserts into `public.users` with id + email + display_name from `raw_user_meta_data`.
  - **B** App-code mirror: do the insert inside the sign-up server action. Less surface area but doesn't catch users provisioned via Supabase admin / external invites.
- Recommendation: **A** (covers all auth-creation paths). Migration `drizzle/0006_users_mirror_trigger.sql`.
- Prevention: integration test in `tests/auth-mirror.test.ts` once trigger lands.

### BUG-0005 — AI rate limiter is in-memory, breaks under multi-instance deploy
- Reported: 2026-05-09 (search-ai-agent open question)
- Severity: medium
- Surface: `services/ai-rate-limiter.ts`.
- Repro: deploy app to Railway with N>1 instances. Each instance has its own counter map. A user can hit the per-user 10/min cap on every instance independently → effective limit becomes 10×N.
- Root cause: deliberate v1 simplification; in-code TODO marks `TODO(redis)`.
- Fix: pending. Plan: switch limiter to Redis (Upstash or self-hosted). Keys: `rl:user:<userId>:<window>` and `rl:org:<orgId>:<window>`. Atomic INCR + EXPIRE.
- Prevention: opt-in distributed-test that runs against a Redis container; add to CI when first multi-instance Railway deploy happens.

### BUG-0006 — `audit_log` retention not enforced
- Reported: 2026-05-09 (files-logging-agent open question)
- Severity: low
- Surface: `audit_log` table.
- Repro: long-running prod will accumulate audit rows indefinitely. Storage cost + query latency degrade.
- Root cause: no retention policy authored.
- Fix: pending. Plan: quarterly archive job that copies old rows to cold storage + DELETEs from `audit_log`. Retention TBD by ops (default suggestion: 90 days hot, 1 year cold).
- Prevention: cron job + monitoring alert at >X rows.

### BUG-0007 — `seed-agent` cannot create `note-files` Storage bucket from SQL
- Reported: 2026-05-09 (files-logging-agent open question)
- Severity: low
- Surface: deployment runbook.
- Repro: fresh Supabase project. Run `npm run db:migrate` — works. Run app, try to upload a file → error: bucket `note-files` does not exist.
- Root cause: Supabase Storage bucket creation is not exposed via SQL DDL; must be done via Supabase dashboard or REST API.
- Fix: documented as a manual step in `docs/RUNBOOK.md` (PR #20). Could be automated via a one-shot script using the admin client.
- Prevention: add a `scripts/setup-supabase.ts` that idempotently provisions buckets, JWT expiry, and any other dashboard-only settings; runbook checklist references it.

### BUG-0008 — Pre-org-context auth events skip the audit trail
- Reported: 2026-05-09 (files-logging-agent open question)
- Severity: low
- Surface: `audit_log` coverage for `auth.signin`, `auth.signin_failed`, `auth.signout`, `auth.password_reset_requested`, `auth.signup`.
- Repro: failed sign-in attempts (or successful ones before first-org bootstrap) emit structured logs to stdout but write no `audit_log` row.
- Root cause: `audit_log.org_id` is `NOT NULL`. Pre-org events have no org context to attribute.
- Fix: pending. Plan options:
  - **A** Relax `audit_log.org_id` to nullable + add a partial index for queries that filter by org_id.
  - **B** Separate `auth_audit_log` table (no org_id). Cleaner schema but doubles the audit query surface.
- Recommendation: **A** with a CHECK constraint enforcing `org_id IS NOT NULL` for non-auth events. Migration `drizzle/0007_audit_log_nullable_org.sql`.
- Prevention: tenant-isolation test asserting rows with `org_id IS NULL` are restricted to the auth event taxonomy.

### BUG-0009 — Tag history not snapshotted in `note_versions`
- Reported: 2026-05-08 (Copilot review on PR #14)
- Severity: low
- Surface: `services.notes.diffVersions` tags slice.
- Repro: create a note with tags `[a, b]` (v=1). Update tags to `[a, c]` (v=2). Call `diffVersions(noteId, v1, v2)`. The `tags` slice falls back to current attachments and reports `{ added: [], removed: [] }` instead of `{ added: ['c'], removed: ['b'] }`.
- Root cause: `note_versions` snapshots only `title` + `content`. Tag changes mutate `note_tags` join rows in place (no version trail).
- Fix: pending. Tracked as **issue #15**. Plan: add `tags_snapshot text[]` column on `note_versions`, populate on `createVersion`. Migration + service extension.
- Prevention: pglite isolation test extension once schema lands.

### BUG-0010 — JWT propagation latency on `addMember` / first-org create
- Reported: 2026-05-09 (auth-agent DR-PROD-01 open question)
- Severity: medium
- Surface: any flow where a user gains a new `org_id`.
- Repro: user A is added to org B by an admin. A's existing access token still encodes `org_ids = [orgA]`. RLS denies queries against orgB rows until A's JWT refreshes (default 1h, recommended 15min in `RUNBOOK.md`).
- Root cause: `auth.admin.updateUserById({ app_metadata })` updates the database row but does NOT push a new token to the user's browser. New claim is picked up on next refresh.
- Fix: pending. Plan options:
  - **A** Set JWT expiry to 900s in Supabase dashboard (DR-PROD-02 — runbook step).
  - **B** Force a client-side refresh after the admin action (`supabase.auth.refreshSession()`).
  - **C** Server-side: `auth.admin.signOut(userId, 'global')` after every membership change (already done for `removeMember`; could extend to `addMember`).
- Recommendation: **A + B**. Don't apply C to `addMember` (kicks the user out unnecessarily).
- Prevention: load-test once real Supabase JWT expiry set; document worst-case window in runbook.

## Resolved

### BUG-R001 — Side nav links 404 (notes/search/files/ai/settings)
- Reported: 2026-05-08 (user: "Cannot navigate to notes, I am seeing a 400 after navigating")
- Severity: medium
- Surface: app shell side nav after frontend PR #4 merged.
- Repro: click any of the 5 secondary nav items.
- Root cause: side nav (`components/app-shell/nav-items.ts`) linked to `/notes`, `/search`, `/files`, `/ai`, `/settings` but none of those routes existed. Frontend agent built the shell before placeholder pages were authored.
- Fix: PR #7 — added `app/(app)/<route>/page.tsx` placeholders rendering `EmptyState` "Coming soon — owned by <agent>".
- Prevention: PR #19 added `scripts/check-nav.ts` (Playwright crawler asserting every visible `<a href>` returns 2xx). Run via `npm run check:nav`. Targeted CI integration once a built artifact + ephemeral DB is in place.

### BUG-R002 — Drizzle journal silently dropped `0001_rls.sql`
- Reported: 2026-05-08
- Severity: high
- Surface: `npm run db:migrate` against cloud DB.
- Repro: pull main with all 3 migrations on disk. Run `npm run db:migrate`. RLS tables remain `rowsecurity=false`. No error.
- Root cause: `drizzle/meta/_journal.json` lost the `0001_rls` entry during a parallel-PR conflict resolution between auth-agent's PR #8 and notes-agent's PR #9. drizzle-kit's migrator applies migrations from the journal, not from disk — silently skipped.
- Fix: PR #11 added the missing journal entry. Cloud DB was patched manually (applied 0001 SQL directly + inserted `__drizzle_migrations` row with the correct SHA-256 hash).
- Prevention: agents now diff `ls drizzle/*.sql` vs journal entries before pushing. Process learning recorded in NOTES.md (2026-05-08 session log). Ideally a CI check that asserts every `.sql` file has a journal entry.

### BUG-R003 — `note_shares` not covered by RLS
- Reported: 2026-05-08
- Severity: low (defense-in-depth gap; app-layer scoping was correct)
- Surface: `note_shares` table.
- Repro: query the table without an `org_id` WHERE clause as the `authenticated` role on cloud — returned all rows regardless of caller's memberships.
- Root cause: `0001_rls.sql` (auth-agent) was authored before `note_shares` existed (notes-agent's 0002 added it). Migration ordering mismatch.
- Fix: PR #13 added `0003_rls_note_shares.sql` mirroring 0001's pattern.
- Prevention: TENANCY_INVARIANTS.md invariant 1 mandates RLS on every tenant-owned table. New tables MUST land with their RLS migration, not as a follow-up.

### BUG-R004 — PR #13 first attempt broke pglite tests (`role "authenticated" does not exist`)
- Reported: 2026-05-08 (user: "PR 13 apparently broke the tests, which is very weird")
- Severity: medium (CI red)
- Surface: `tests/{tenant-isolation,rls-isolation,auth-tenant-isolation,auth-context}.test.ts` against pglite.
- Repro: run `npm run test` after applying initial 0003_rls_note_shares.sql with `TO authenticated`.
- Root cause: pglite (in-process Postgres WASM) does not have Supabase's auth schema, including the `authenticated` role. `CREATE POLICY ... TO authenticated ...` errored out at migration apply time. All 4 test files using `makeTestDb` cascaded with `close is not a function` because the helper threw before assigning the close handle.
- Fix: rewrote 0003 to omit `TO authenticated` (policies apply to PUBLIC, matching 0001's exact pattern). Cloud DB also synced — dropped old policies, re-applied without `TO authenticated`, updated hash row.
- Prevention: agents authoring RLS migrations now mirror 0001's policy shape verbatim. Process note in NOTES.md.

### BUG-R005 — CI workflow rejected: invalid `hashFiles()` at job level
- Reported: 2026-05-08 (user)
- Severity: high (blocked all CI)
- Surface: `.github/workflows/ci.yml`, every PR.
- Repro: open any PR. CI parser fails: "Unrecognized function: 'hashFiles'. Located at position 1 within expression: hashFiles('Dockerfile') != ''".
- Root cause: `if: hashFiles('Dockerfile') != ''` placed at the job level. `hashFiles()` is only valid inside step `if:` after checkout — at job level it's evaluated at workflow-parse time when the file system isn't yet known.
- Fix: PR #10 removed the gate (Dockerfile is always committed; the "optional" semantic was already conveyed via job name).
- Prevention: shellcheck-equivalent for GitHub Actions YAML in pre-commit (e.g., `actionlint`). Open follow-up.

### BUG-R006 — Docker build failed: `/app/public not found`
- Reported: 2026-05-08 (user: "Docker build is failing")
- Severity: medium (block of optional CI job)
- Surface: `docker-build` CI job + any local `docker build`.
- Repro: `docker build -t contrario-notes:test .`. Fails at `COPY --from=build /app/public ./public`.
- Root cause: foundation-agent's Dockerfile assumed Next.js convention `public/` directory, which didn't exist (no static assets had been added). `COPY` errors when source path is absent.
- Fix: PR #12 added `public/.gitkeep` so the directory exists in build context.
- Prevention: aligns with Next.js convention going forward. Future static assets land in `public/` naturally.

### BUG-R007 — PR template's relative link broke on GitHub render
- Reported: 2026-05-08 (user: "the entry on the Readme which is not accessible")
- Severity: low
- Surface: every PR description body referencing `[PRE_MERGE_CHECKLIST.md](../PRE_MERGE_CHECKLIST.md)`.
- Repro: click the link in any PR body — 404 on github.com.
- Root cause: `..` walks out of repo when GitHub renders a PR description; the description has no fixed file location to resolve relative paths against.
- Fix: PR #5 changed template to absolute URL `https://github.com/halbano/contrario-notes/blob/main/PRE_MERGE_CHECKLIST.md`. Existing PR bodies (#2/#3/#4) patched via REST `PATCH /repos/.../pulls/N`.
- Prevention: template uses absolute URL only. Lint rule (manual) on agent PRs.

### BUG-R008 — `services.notes.listVisible` post-filtered visibility in app code
- Reported: 2026-05-07 (foundation-agent self-flagged)
- Severity: high
- Surface: `services/notes-service.ts:50-57` (foundation-era code).
- Repro: trace `services.notes.listVisible(opts)` — fetched all notes via `repos.notes.listRecent`, then filtered by `canReadNote` in JavaScript.
- Root cause: foundation-agent didn't have the visibility predicate composition primitives yet, so used a stopgap. Documented in code comment + NOTES.md risk register.
- Fix: PR #9 (notes-agent) added `permissions/note-visibility-sql.ts` exporting a Drizzle SQL fragment `visibleNotesPredicate(ctx)`; rewrote `repos.notes.listVisible` to AND it into the WHERE clause. Removed the post-filter and stopgap comment.
- Prevention: TENANCY_INVARIANTS.md invariant 4 ("Visibility filter applied in SQL, not app code") is now front-of-mind; tenant-isolation harness has 6+ assertions exercising the predicate at the SQL layer.

### BUG-R009 — `package.json` missing comma after parallel chore PRs
- Reported: 2026-05-09 (caught during conflict resolution on PR #21)
- Severity: medium (broke `npm install`)
- Surface: `package.json` after PR #18 (seed) + PR #19 (check:nav) merged.
- Repro: `npm install` after pulling main with both merges. JSON parse error at `"check:nav": "tsx scripts/check-nav.ts"\n    "seed":` — missing comma.
- Root cause: both PRs added new lines to the `scripts` block. Each PR's diff was syntactically valid against its base, but the merge of both produced a missing comma. GitHub auto-merge doesn't lint JSON.
- Fix: added the comma in PR #21's merge commit (`603008e`).
- Prevention: pre-commit JSON lint hook OR `npm install` step in CI on every PR (already exists; the install ran on stale package-lock so the parse error wasn't surfaced until after merge to main).

### BUG-R010 — `gh pr edit` requires `read:project` scope
- Reported: 2026-05-08 (encountered fixing BUG-R007 on existing PRs)
- Severity: low (process friction)
- Surface: `gh pr view --json` and `gh pr edit` commands from the orchestrator.
- Repro: `gh pr edit 14 --body-file ...` → `error: your authentication token is missing required scopes [read:project]`.
- Root cause: newer `gh` versions require an additional OAuth scope for PR mutations even when the project field isn't being touched.
- Fix: workaround via `gh api -X PATCH /repos/.../pulls/N --input <body>` which uses raw REST and only needs the existing repo scope.
- Prevention: documented in NOTES.md "Process learnings". Agents now default to `gh api` for PR body updates.

### BUG-R011 — Sub-agent watchdog stalls (600s no-progress timeout)
- Reported: 2026-05-08 (multiple incidents: notes-agent full-scope, search-ai-agent full-scope)
- Severity: medium (lost work risk if no checkpoint commits)
- Surface: long-running sub-agent dispatches.
- Repro: dispatch an agent with a 5-step scope and no intermediate commits. After ~10 min of streaming silence, the harness watchdog kills the run.
- Root cause: large-scope tasks naturally have long deliberation pauses (file reads, test runs) where stdout is quiet. The watchdog can't distinguish "thinking" from "deadlocked".
- Fix: agent prompts now mandate "commit every 10-15 min" + split scope into discrete commits per chunk. WIP commits are explicitly OK; orchestrator squashes if needed before merge.
- Prevention: every prompt for a sub-agent includes the stall-prevention block. Process note in NOTES.md.
