# BUGS.md

Known issues encountered during build. Append on discovery, update on fix.
All entries below were caught and fixed before evaluation handoff. None
shipped to a production environment.

## Severity calibration

- **Critical** — would have leaked tenant data or broken prod runtime.
  *None observed in shipped state.*
- **High** — blocked CI, blocked merge, FK violation, runtime error in a
  user flow.
- **Medium** — blocked a single PR or feature path; missing-feature gap
  visible in walkthrough.
- **Low** — cosmetic, dev hygiene, lint, doc.

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

---

## Open

*(none)*

---

## Resolved

### BUG-0001 — `services.notes.listVisible` post-filtered visibility in app code

- Reported: 2026-05-07
- Severity: high
- Surface: services/notes-service, permissions, tenant isolation
- Repro: foundation slice fetched all org-scoped rows from
  `notesRepo.list()` then filtered the results in JS by `canReadNote`.
  Violated TENANCY_INVARIANTS invariant 4 (visibility predicate must run
  inside SQL); pagination and FTS would have leaked counts and timing
  side-channels even though no row data left the boundary.
- Root cause: foundation-architecture-agent shipped the post-filter as a
  declared stopgap (code comment + NOTES.md risk register) so the
  service could compile while the visibility model was still being
  designed for `note_shares`.
- Fix: PR #9 (`9c3c2ac`). New `permissions/note-visibility-sql.ts`
  exports `notesVisibleToUserPredicate(ctx)` returning a Drizzle SQL
  fragment. `listVisible` composes the predicate inside the WHERE
  clause; search FTS query (PR #22 commit B `e89956f`) and AI summary
  context (PR #22 commit D `feaa9f1`) reuse the same predicate.
- Prevention: 6 cross-org isolation assertions in PR #9 plus
  `tests/notes/list-visible.test.ts` symmetry test (`a951fae`)
  asserting cross-org listVisible returns empty array.

### BUG-0002 — drizzle journal dropped `0001_rls` entry during rebase

- Reported: 2026-05-08
- Severity: high
- Surface: drizzle migrations, cloud DB
- Repro: PR #8 (auth) and PR #9 (notes Phase 1) were authored in
  parallel worktrees, each adding a migration + journal entry. After
  rebase + merge, `drizzle/0001_rls.sql` existed on disk but was absent
  from `_journal.json`. `npm run db:migrate` skipped it silently
  (drizzle applies based on journal, not disk). Cloud DB had `0000` and
  `0002` applied; tenant tables had **no RLS in cloud**.
- Root cause: drizzle's journal merge logic does not flag missing-on-disk
  files. Conflict resolution dropped the entry. No CI gate diffed
  `ls drizzle/*.sql` against journal.
- Fix: PR #11 (`872a3f9`) re-added the journal entry; orchestrator
  manually applied `0001_rls.sql` via Supabase SQL editor and patched
  `drizzle.__drizzle_migrations` so cloud journal hash matched repo.
- Prevention: queued as DR-PROD-04 / CI-04 (CI job that diffs migration
  files vs journal entries). Not yet implemented.

### BUG-0003 — `note_shares` table not covered by initial RLS

- Reported: 2026-05-08
- Severity: medium
- Surface: drizzle migrations, RLS
- Repro: `0001_rls.sql` (auth-agent) authored policies for tenant tables
  that existed at that time. `note_shares` did not yet exist (created in
  `0002_note_shares.sql` by notes Phase 1). `0001` therefore had no
  policy for `note_shares`. After both migrations applied, `note_shares`
  had `rowsecurity=false` — a row-level read of share grants from the
  wrong org would have succeeded if accessed directly via Supabase
  client (the repository scope still constrained reads, so the leak was
  defence-in-depth-only).
- Root cause: ordering gap between auth-vs-notes migration timelines.
  `0001` could not policy a not-yet-existing table; no follow-up
  migration was authored by either agent.
- Fix: PR #13 (`6c34f63`) — `drizzle/0003_rls_note_shares.sql` matching
  `0001`'s policy style (no `TO authenticated` clause for pglite
  parity).
- Prevention: orchestrator audit of `pg_policies` after every migration
  merge; documented in NOTES.md 2026-05-08 process learnings.

### BUG-0004 — `Dockerfile` referenced missing `public/` directory

- Reported: 2026-05-08
- Severity: medium
- Surface: Docker build, CI docker-build job
- Repro: `docker build .` failed at
  `COPY --from=build /app/public ./public` because the repo had no
  `public/` directory (Next.js does not require one; foundation never
  created it).
- Root cause: foundation Dockerfile was templated from the Next.js
  `output: standalone` example which assumes `public/` exists.
- Fix: PR #12 (`d9224a4`) — `public/.gitkeep`.
- Prevention: docker-build now part of CI smoke; would re-fail on the
  same surface.

### BUG-0005 — invalid job-level `hashFiles()` blocked all CI runs

- Reported: 2026-05-08
- Severity: high
- Surface: GitHub Actions workflow
- Repro: ci-quality-agent set
  `if: hashFiles('Dockerfile') != ''` at *job-level* on `docker-build`.
  GitHub Actions only allows `hashFiles()` in step-level `if:` /
  expression contexts. The workflow file was rejected by the parser →
  every CI run on every branch failed at workflow load.
- Root cause: agent did not validate the workflow against `actionlint`
  or a known-good schema. Worked locally because no local check was
  run.
- Fix: PR #10 (`07edd62`) — drop the guard; docker-build always runs.
- Prevention: pre-merge run of `actionlint` recommended (queued, not
  wired). Documented in PRE_MERGE_CHECKLIST.md.

### BUG-0006 — `package.json` missing comma blocked all `npm` commands on main

- Reported: 2026-05-08
- Severity: high
- Surface: build tooling
- Repro: PR #18 (seed) and PR #19 (nav-click test) merged
  near-simultaneously; both added a script entry. The combined merge
  result lacked a trailing comma after `"check:nav"` before `"seed"`.
  `package.json` was invalid JSON. `npm run lint`, `npm run test`,
  every CI job, every dev `npm` invocation broke.
- Root cause: line-level conflict resolution that did not re-validate
  the JSON.
- Fix: PR #23 (`05b1fde`, commit `e46f885`) — one-character
  comma-add. Branch `chore/fix-package-json-comma`.
- Prevention: `npm run lint` runs JSON parse implicitly; the issue was
  only that a broken main does not block subsequent merges. Adding a
  pre-merge JSON validation step recommended.

### BUG-0007 — `'server-only'` import crashed seed CLI under plain Node

- Reported: 2026-05-09
- Severity: high
- Surface: AI service, seed CLI, install discipline
- Repro: PR #22 imported `import 'server-only'` in `lib/anthropic.ts`.
  Worked under Next.js webpack (the package is a virtual module that
  webpack treats as a fence). Under plain Node (`tsx`, `vitest`), the
  package is a runtime "you reached me from a client" guard that
  always throws → every `npm run seed` invocation crashed with
  `This module cannot be imported from a Client Component module.`
  Compounded by the fact that the package was *not even installed*.
- Root cause: agent introduced an import without running `npm install`
  for the new dep, *and* without realising the package's runtime
  semantics differ across bundlers.
- Fix: PR #27 (`1d7848d`, commit `e359f31`) — replaced the static
  import with a runtime `typeof window !== 'undefined'` fence
  (equivalent semantics, works under tsx + vitest); also added the
  missing `server-only` dep that PR #22 had introduced without npm
  installing.
- Prevention: queued — pre-merge check that diffs `package.json`
  against actual imports. Same install-vs-import drift caught
  `@anthropic-ai/sdk` at runtime in the same PR.

### BUG-0008 — `0004_search_fts.sql` not applied to cloud Supabase

- Reported: 2026-05-09
- Severity: medium
- Surface: drizzle migrations, search service
- Repro: search-ai-agent generated `0004_search_fts.sql` and registered
  it in the journal, but did not apply against the cloud DB. After
  merge the `tsvector` column + GIN index were repo-side only.
  `/search` returned zero rows in the cloud walkthrough.
- Root cause: agents do not have cloud DB credentials; orchestrator
  must run `npm run db:migrate` against cloud manually. PR #22 review
  did not flag this.
- Fix: orchestrator applied migration via Supabase SQL editor; verified
  hash in `drizzle.__drizzle_migrations` matches repo entry. No code
  change.
- Prevention: queued as DR-PROD-06 — pre-deploy GitHub Action that
  diffs `drizzle/` against target environment's applied migrations,
  blocks deploys on un-applied migrations.

### BUG-0009 — `/onboarding/create-org` page missing `dynamic = 'force-dynamic'`

- Reported: 2026-05-09
- Severity: medium
- Surface: Next.js app router build, auth onboarding flow
- Repro: PR #28 first revision passed lint + typecheck + test but
  failed `npm run build`: `Dynamic server usage` error during static
  prerender of `/onboarding/create-org`. Page calls `cookies()` and
  reads the authenticated user → must be dynamic.
- Root cause: agent did not annotate the new route. Next 15 attempts
  static prerender by default; only routes that explicitly opt out via
  `export const dynamic = 'force-dynamic'` are skipped.
- Fix: amendment to PR #28 (force-pushed) — added the export at
  `app/onboarding/create-org/page.tsx:11`. Final merge: `6d29610`.
- Prevention: queued — lint rule or codemod that flags `cookies()` /
  `headers()` usage in route components without the dynamic export.

### BUG-0010 — Missing `/auth/callback` route broke email confirmation flow (VAL-01)

- Reported: 2026-05-09
- Severity: high
- Surface: auth flow, Supabase email links
- Repro: cloud-Supabase walkthrough — clicked the email confirmation
  link → landed on `/sign-in?code=...&redirectTo=%2F` → sign-in page
  never exchanged the code → session never established → unhandled
  webpack error on render.
- Root cause: PR #8 (auth) wired `signUp` and `requestPasswordReset`
  but did not author the corresponding callback route handler.
  `emailRedirectTo` was set to `${APP_URL}/sign-in` (which has no
  code-exchange logic) instead of `${APP_URL}/auth/callback`.
- Fix: PR #28 (`6d29610`, commit `942c6b3`) — `app/auth/callback/route.ts`
  exchanges the code for a session via `exchangeCodeForSession(code)`
  and 303-redirects to a sanitised `redirectTo` (same-origin paths only,
  open-redirect guard). Updated `signUp` and `requestPasswordReset` to
  pass `emailRedirectTo` / `redirectTo` pointed at the callback.
- Prevention: 5 new tests in `tests/auth-callback.test.ts` covering
  success, default redirect, failure path, missing code, and
  open-redirect rejection.

### BUG-0011 — Sign-up silently redirected when email confirmation enabled (VAL-02)

- Reported: 2026-05-09
- Severity: medium
- Surface: auth flow, sign-up form UX
- Repro: cloud-Supabase walkthrough — submitted sign-up form. Supabase
  returned `data.user` but no `data.session` (email-confirmation
  enabled at the project tier). `signUpAction` redirected to `/`,
  middleware bounced to `/sign-in` because the cookie was never set.
  User had no idea why.
- Root cause: PR #8 `signUp` action did not distinguish
  session-created from session-pending. Always redirected.
- Fix: PR #28 (`942c6b3`) — `signUp` now returns
  `{ ok, userId, sessionCreated }`; action surfaces
  `requiresEmailConfirmation: true` to the form when no session was
  created. Sign-up form renders a "Check your email" `EmptyState` with
  a `resendConfirmationAction` that always returns `ok: true` (does
  not leak email existence).
- Prevention: `tests/sign-up-action.test.ts` covers
  `requiresEmailConfirmation` routing, redirect-on-session,
  resend-does-not-leak.

### BUG-0012 — App shell rendered "No organisation" pill with no path forward (VAL-09)

- Reported: 2026-05-09
- Severity: medium
- Surface: auth flow, app shell, onboarding
- Repro: cloud-Supabase walkthrough — authenticated user with zero
  memberships landed on the app shell. Top bar showed a disabled "No
  organisation" pill. Side nav links 404'd. No path to create the
  first org.
- Root cause: PR #8 `buildRequestContext` threw `no_membership` for
  zero-membership users. Layout caught and rendered a stub. The path
  to `createFirstOrgAction` was never wired into the app shell route
  tree.
- Fix: PR #28 (`942c6b3`) — `lib/require-membership.ts` short-circuits
  the app-shell render: on `no_membership` it redirects to
  `/onboarding/create-org`. New page reuses `AuthCard` and submits to
  the existing `createFirstOrgAction`. `OrgSwitcherSlot` updated to a
  "Create organisation →" link as defence-in-depth.
- Prevention: `lib/require-membership.test.ts` covers ctx
  pass-through, no_membership redirect, unauthenticated rethrow,
  non-AppError rethrow.

### BUG-0013 — Seed `--reset` left orphan `auth.users` causing FK violations on next reseed

- Reported: 2026-05-09
- Severity: low (dev-only; not reproducible in clean prod)
- Surface: seed CLI, dev workflow
- Repro: ran `npm run seed -- --reset` against cloud dev DB. Reset
  truncated `public.users` but Supabase `auth.users` was untouched
  (admin client not invoked). Next reseed attempted to insert seed
  emails that already existed in `auth.users` → email-conflict on
  signup; alternatively, `createFirstOrgAction` would insert into
  `memberships` referencing a `user_id` that auth had but
  `public.users` did not, triggering FK violation on
  `memberships.user_id → users.id`.
- Root cause: `seed --reset` only operates on `public.*` tables; has no
  cross-schema awareness of `auth.*`. `createFirstOrgAction` does not
  self-heal the `public.users` mirror.
- Fix: orchestrator manually deleted seed `auth.users` rows via
  `supabase.auth.admin.listUsers` → filter `*@seed.contrario.dev` →
  `auth.admin.deleteUser`. **Code fix tracked but not yet shipped:**
  VAL-11 (createFirstOrg self-heal) and VAL-12 (seed reset auth
  parity) in TODO.md.
- Prevention: VAL-12 will add `auth.admin.deleteUser` to the seed
  reset path; VAL-11 will add `INSERT ... ON CONFLICT DO NOTHING` to
  `createOrgWithAdmin` ahead of the membership write.

### BUG-0014 — `.next` cache corruption observed after big multi-PR merges (VAL-07)

- Reported: 2026-05-09
- Severity: low
- Surface: dev environment hygiene
- Repro: after merging PR #21 + PR #22 + PR #28 in sequence, `npm run
  dev` produced webpack errors (`Cannot find module …chunks/…`) on
  first compile. Manifested as transient unhandled errors that did not
  reproduce after `rm -rf .next`. Observed twice in the session.
- Root cause: Next 15 webpack cache holds module-graph state that
  becomes stale across large dependency / route changes. Not a code
  bug.
- Fix: documented in TODO.md (VAL-07) — recommend `rm -rf .next && npm
  run dev` or a `npm run dev:clean` script. No PR yet.
- Prevention: doc note only; nothing CI-side.
