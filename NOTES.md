# NOTES.md — Operational Journal

Live record of plans, decisions, risks, lessons. Append-only spirit (don't rewrite history).

---

## 2026-05-07 — Project bootstrap

### Plan

- Multi-tenant team notes app per master orchestrator brief.
- Stack: Next.js (latest stable) + TS + Tailwind + shadcn/ui + Drizzle + Supabase. Deploy to Railway via Docker.
- Architecture: shared-schema multi-tenancy, scoped services + repositories, centralized permissions, Postgres FTS.

### Session decisions

- Plan-heavy bootstrap chosen over feature dive. Governance docs and agent specs land before any feature code.
- Worktree-per-agent execution: 7 worktrees, foundation-architecture lands first, others rebase onto it.
- TDD strict for domain (services, repositories, permissions, search, AI); pragmatic for scaffolding (config, layout shells).

### Tenancy guardrails set

- `TENANCY_INVARIANTS.md` → 8 invariants. Raw db forbidden outside `repositories/`. Cross-org returns 404 not 403.
- `RequestContext` is the only allowed source of `orgId`. Built once per request from session + active membership.

### Architecture decisions queued as ADRs

- ADR-0001 shared-schema multi-tenancy
- ADR-0002 scoped services + repositories pattern
- ADR-0003 stack choice
- ADR-0004 search via Postgres FTS
- ADR-0005 file storage (Supabase Storage + signed URLs)
- ADR-0006 AI permission-safe context
- ADR-0007 worktree + branch-per-agent

### Risks identified at bootstrap

- HIGH: search visibility filtering must run inside SQL or it leaks across orgs/visibility tiers.
- HIGH: AI summary endpoint must reject any note id the requesting user cannot read; risk of bulk org-context leakage.
- HIGH: signed URL generation must validate per-request permission, not on upload only.
- MEDIUM: org switching must invalidate any cached `RequestContext` to avoid stale-org reads.
- MEDIUM: full-text index on ~10k notes — confirm tsvector + GIN index meets latency budget.
- LOW: Drizzle migration ordering across worktrees; need single migration timeline owner.

### Next steps

1. Finish ADR-0001..0007. ✅
2. Write 9 agent specs in `/agents`. ✅
3. Stand up GitHub PR template, NOTES/TODO scaffolding. ✅
4. Create 7 worktrees + branches. ✅
5. Dispatch `foundation-architecture-agent` first; rest blocked until foundation merges. ✅

---

## 2026-05-07 — foundation-architecture-agent landed (local)

Branch: `feat/foundation-architecture` — three commits, tree clean, **71/71 tests green**, lint/typecheck/build all pass.

### Acceptance criteria

13/13 met. Stack: Next.js 15.1.3 + TS strict + Drizzle + Supabase clients (server/browser/admin) + Tailwind/shadcn tokens + Vitest + pglite for tenant-isolation tests + Dockerfile + railway.toml.

### Schema landed (Drizzle 0000_init.sql)

`users`, `organizations`, `memberships` (uniq `(org_id,user_id)`), `notes`, `note_versions`, `tags`, `note_tags`, `files`, `audit_log`. Every tenant-owned table has `org_id` + composite indexes leading with `org_id`. Cascade on `org_id` delete.

### Pattern proof

- `lib/build-request-context.ts:42` — builds ctx from session + active membership; rejects users without membership.
- `repositories/base-repository.ts:26` (`scopedWhere`), `:48` (`withOrgId`) — auto-scope every query.
- `services/index.ts:32` (`createScopedServices`) — façade returns `{notes, orgs}`.
- `permissions/note-permissions.ts:25` — full role × visibility × action matrix, 37 tests.
- `logging/logger.ts:42` + `logging/events.ts` — taxonomy (auth, note, file, ai, permission.denied, error.unhandled), redaction tested.
- `tests/tenant-isolation.test.ts:50+` — 7 assertions on cross-org reads/writes against real Postgres (pglite).

### New ADR

- ADR-0008 — pglite chosen for tenant-isolation tests (over testcontainers / mocks). Reason: real Postgres + 0000 migration applied + sub-second cold-start in unit context.

### New risks discovered

| Level | Description | Owner | Status |
|---|---|---|---|
| **HIGH** | `services.notes.listVisible` post-filters by `canReadNote` in app code (STOPGAP). Violates TENANCY_INVARIANTS invariant 4. Notes/search-ai agents MUST move predicate into SQL before list/search UI ships. | notes-agent + search-ai-agent | open |
| LOW | `db/migrate.ts` uses `console.log` (operational script, not product code). | foundation | accepted |
| LOW | pglite cold-start ~6s (acceptable for CI). | foundation | accepted |

### Open questions for orchestrator (deferred decisions)

1. **RLS migration** (defense-in-depth per ADR-0001). Not authored here. Should foundation ship `drizzle/0001_rls.sql` or auth-agent? **Decision: auth-agent.** RLS depends on auth.uid() and Supabase session shape — keep with auth.
2. **`note_shares` table** for `shared` visibility tier. Permissions layer expects `sharedWithUserIds` field on the loaded note. Foundation did not add `note_shares`. **Decision: notes-agent** owns it (visibility model is theirs per spec).
3. **FTS column** (`tsvector` + GIN per ADR-0004). Deferred to search-ai-agent. ✅ Schema stable for them to extend.

---

## Risk register (live, updated)

| Level | Description | Owner | Status |
|---|---|---|---|
| **HIGH** | JWT `app_metadata.org_ids` sync — RLS denies legitimate access for new memberships AND retains ex-member DB access until JWT expiry | auth-agent (DR-PROD-01) | **open / blocks prod deploy** |
| HIGH | Search visibility filtering must be SQL-level | search-ai-agent | open |
| HIGH | AI summary context must respect user-visible notes only | search-ai-agent | open |
| HIGH | Signed URL generation requires per-request permission check | files-logging-agent | open |
| MEDIUM | Org switching cache invalidation | auth-agent | resolved (PR #8 — `switchOrgAction` calls `revalidatePath('/', 'layout')`) |
| MEDIUM | FTS performance at ~10k notes | search-ai-agent | open |
| MEDIUM | Next 15.1.3 CVE-2025-66478 flagged by npm audit; investigate + bump if needed | foundation/orchestrator | open |
| MEDIUM | Drizzle journal entry for 0001_rls missing on initial PR #8 — caused `npm run db:migrate` to silently skip the RLS migration on cloud DB | orchestrator | resolved (PR #11) |
| LOW | `services.notes.listVisible` post-filters; must move to SQL before list/search UI | notes-agent + search-ai-agent | resolved (PR #9 — Drizzle SQL fragment in `permissions/note-visibility-sql.ts`) |
| LOW | Migration ordering across worktrees (foundation owns 0000, others propose deltas) | orchestrator | resolved (0000 foundation, 0001 auth, 0002 notes-phase-1, 0003 RLS-extension) |
| LOW | RLS not yet implemented (defense-in-depth gap) | auth-agent | resolved (PR #8 + #13 — 7/7 tenant tables, 14 policies on cloud) |
| LOW | `note_shares` table not covered by 0001 RLS (predated table) | orchestrator | resolved (PR #13 — 0003_rls_note_shares) |
| LOW | CI-04 migrate validation deferred (needs Supabase test instance) | ci-quality-agent | deferred |
| LOW | CI workflow had invalid job-level `hashFiles()` → blocked all CI runs | ci-quality-agent | resolved (PR #10) |
| LOW | Docker build failed on missing `public/` directory | frontend | resolved (PR #12) |
| LOW | Side-nav links 404'd (Notes/Search/Files/AI/Settings routes absent) | frontend | resolved (PR #7) |

## Auth flow (auth-agent)

```text
sign-up → users mirror row → sign-in (Supabase) → first-org check
   → if zero memberships: createFirstOrgAction (writes org + admin membership + active-org cookie)
   → else: getRequestContext() reads active-org cookie HINT, validates against memberships
   → ctx (userId, orgId, role) → repos/services scoped to ctx → resource read/write
```

Active org is **server-side only** (`active_org` httpOnly cookie). The cookie
is a *hint*: `getActiveMembershipFromDb` verifies the user holds a membership
for that org and otherwise falls back to the deterministic default (oldest
membership). Strict 404 path lives in `validateOrgSwitch` — invoked by
`switchOrgAction` BEFORE the cookie is rewritten.

Cache invalidation: `switchOrgAction` and `createFirstOrgAction` both call
`revalidatePath('/', 'layout')` after the cookie write so the RSC tree is
rebuilt with the new ctx.

Defense-in-depth: `drizzle/0001_rls.sql` enables RLS on `notes`,
`note_versions`, `tags`, `note_tags`, `files`, and `audit_log`. Policies key
off the JWT claim `app_metadata.org_ids` (uuid[]). The org-switch endpoint
keeps the JWT claim in sync (TODO once Supabase admin client is wired in
Phase 4 — currently we rely on app-layer scoping; RLS is exercised by the
isolation harness against pglite). Tests in `tests/rls-isolation.test.ts`
impersonate a non-owner role and verify zero-row + WITH CHECK rejection.

## Confidence score (live, updated 2026-05-08)

| Area | Weight | Score (0-1) | Weighted |
|---|---|---|---|
| Tenant isolation | 40 | 0.85 | 34.0 |
| Permission enforcement | 20 | 0.80 | 16.0 |
| Feature completeness | 20 | 0.50 | 10.0 |
| Review discipline | 10 | 0.80 | 8.0 |
| Observability | 10 | 0.65 | 6.5 |

**Total: 74.5 / 100**. Up from 49.0 after auth (#8) + notes Phase 1 (#9) + RLS-extension (#13) + Phase 2 (#14) merged.

Drivers of the bump:

- **Tenant isolation 0.55 → 0.85**: SQL-level visibility predicate replaced post-filter; 19 new pglite isolation assertions; 7/7 tenant tables under RLS on cloud.
- **Permission enforcement 0.55 → 0.80**: org-permissions matrix + 17 unit tests; share grant validation; 4-corner role × visibility coverage.
- **Feature completeness 0.20 → 0.50**: notes CRUD + versioning + tagging + sharing UI + version diff are end-to-end functional.
- **Review discipline 0.65 → 0.80**: 13 PRs landed with consistent risk labels, conflict resolution, and Copilot-review responses.
- **Observability 0.55 → 0.65**: auth event taxonomy + structured logging in place; mutation audit log writers still pending (files-logging-agent slice).

Hard-fail conditions: still NONE confirmed. JWT-claim-sync gap is a **block-prod-deploy** item (DR-PROD-01); does not affect dev confidence.

---

## 2026-05-08 — Auth + Notes Phase 1/2 + chore PRs merged

User merged a batch of 7 PRs covering auth, notes, RLS, and infrastructure fix-ups.

### What landed

- **PR #8 auth-agent**: Supabase auth wiring (signin/signup/signout/reset, don't-leak-existence on reset), org create / list / switch with httpOnly active-org cookie, membership management (admin-gated), `lib/auth-context.ts` extending `buildRequestContext` with cookie + memberships consultation, role matrix in `permissions/org-permissions.ts` (17 tests), 8 new auth event types, **`drizzle/0001_rls.sql` validated against pglite** (5 RLS isolation tests).
- **PR #9 notes-agent (phase 1)**: `note_shares` schema (`drizzle/0002_note_shares.sql`), SQL-level visibility predicate in `permissions/note-visibility-sql.ts` (replaces stopgap post-filter), 6 new isolation assertions covering all tiers + symmetry.
- **PR #10 ci-quality**: removed invalid job-level `hashFiles()` from docker-build job (workflow parse error fix).
- **PR #11 orchestrator**: registered `0001_rls` in `drizzle/meta/_journal.json` (auth-agent's PR didn't update it; `npm run db:migrate` was silently skipping the RLS migration).
- **PR #12 frontend**: `public/.gitkeep` so Docker `COPY --from=build /app/public ./public` succeeds.
- **PR #13 orchestrator**: `drizzle/0003_rls_note_shares.sql` extending RLS to the `note_shares` table; matched 0001's exact policy style (no `TO authenticated` clause — pglite has no Supabase auth schema, so role doesn't exist there).
- **PR #14 notes-agent (phase 2)**: full notes CRUD + versioning write-path + tagging + share CRUD + version diff UI. 5 commits + Copilot-review polish (char counters, share-picker disabled state, history hint, diff-lib rationale comment). 19 new isolation assertions (146 tests total).

### Cloud DB state

- 4 migrations applied: `0000_init`, `0001_rls`, `0002_note_shares`, `0003_rls_note_shares`.
- 7/7 tenant tables under RLS: `notes`, `note_versions`, `tags`, `note_tags`, `files`, `audit_log`, `note_shares`.
- 14 policies installed.
- `public.user_org_ids()` helper present, returns `{}` with no JWT claim.
- `drizzle.__drizzle_migrations` patched after manual 0001 application — repo + cloud now match exactly (hashes verified).

### Process learnings

- **Drizzle journal can drift silently**: when two parallel branches add migrations and resolve `_journal.json` conflicts, an entry can vanish. The `db:migrate` script applies based on what's in the journal, not what's on disk — silent skip if disk has more files than journal records. Mitigation: PR #11 added the missing entry; future agents should diff `ls drizzle/*.sql` vs journal entries before pushing.
- **RLS policy authoring on pglite**: `TO authenticated` fails because pglite has no Supabase auth schema → role doesn't exist. Either omit the role (policies apply to PUBLIC) or guarantee the role is created before policies. We chose the former for consistency with 0001.
- **Sub-agent parallelism**: stalls happen (~600s watchdog). Mitigation: prompts now mandate "commit every 10-15 min" with discrete commits per scope chunk. Saved Phase 2's 5-commit plan after a previous full-scope dispatch stalled mid-rebase.
- **Background agent observability**: the `.output` file is the full JSONL transcript and overflows context if read directly. Safer signal: poll the agent's worktree git log for new commits + `grep` JSONL for tool-use counts and last text snippet.

### Open follow-ups (tracked in TODO.md + risk register)

- **DR-PROD-01** (block-prod-deploy): JWT `app_metadata.org_ids` sync via Supabase admin client + session invalidation on member removal.
- **DR-PROD-04**: CI-04 migrate validation against ephemeral Postgres.
- **DR-05** smoke test: needs DR-PROD-01 to be accurate.
- **Issue #15**: tag history snapshot in `note_versions`.
- **Phase 5**: search-ai-agent dispatch (FTS + AI summary endpoint).
- **Phase 6**: files-logging-agent dispatch (Supabase Storage + signed URLs + audit log writers).
- **Phase 7**: seed-agent (currently running in background, will produce ~10k notes against cloud DB once spec is reviewed).
- Nav-click 404 assertion in screenshot harness.

---

## 2026-05-07 — Foundation, CI, Frontend PRs merged to main

User merged: PR #2 (foundation), PR #3 (ci-quality), PR #4 (frontend-shell + visual polish + forgot-pw stub). Main now contains:

- Full Next.js scaffold + Drizzle schema (9 tables) + Supabase clients + scoped repos/services + permissions + logger + tenant-isolation harness (foundation).
- GitHub Actions CI: lint + typecheck + test + build + optional Docker (ci-quality).
- App shell + sign-in / sign-up / forgot-password UI (stubs) + state primitives + Playwright screenshot harness (frontend).

Open: PR #5 (chore template fix — broken `../PRE_MERGE_CHECKLIST.md` link in `.github/pull_request_template.md`; reviewers can't navigate from PR description). Bodies of #2-#4 already patched via REST API.

### Process learnings

- PR template's `../PRE_MERGE_CHECKLIST.md` doesn't render correctly in PR descriptions — `..` walks out of repo. Use absolute github.com URL going forward.
- `gh pr view --json` and `gh pr edit` need `read:project` scope (newer gh requirement). REST `gh api -X PATCH repos/.../pulls/N` works without it. Document for agents.
- Worktrees branched from b5b3f5c needed rebase onto origin/main after user pushed c7e8cec. NOTES.md / TODO.md merge conflicts trivial to resolve (HEAD always wins for orchestrator-side accounting).

---

## 2026-05-07 — Foundation architecture session

### Delivered

- Next.js 15.1.3 (App Router), TypeScript strict + `noUncheckedIndexedAccess`.
- Tailwind + shadcn-style theme tokens (no shadcn CLI invoked — equivalent
  tokens in `styles/globals.css` and `tailwind.config.ts`).
- Drizzle schema for all 9 tables with composite indexes leading on `org_id`.
  Migration `drizzle/0000_init.sql` generated and reproducible.
- Supabase clients: `lib/supabase/{server,browser,admin}.ts` reading env vars
  only.
- `lib/build-request-context.ts` with 5 unit tests covering auth, missing
  membership, requestedOrgId hint, immutability.
- `repositories/{base-repository,notes-repository,orgs-repository}.ts` with
  the `createRepositories(ctx, db?)` factory. Base helpers `scopedWhere` and
  `withOrgId` are the only places `eq(orgId, ctx.orgId)` is composed.
- `services/{notes-service,orgs-service,index.ts}` with
  `createScopedServices(ctx, opts)` factory.
- `permissions/note-permissions.ts` with role × visibility × action matrix.
  37 unit tests cover every combination.
- `logging/{events,logger,redact}.ts` — pino-style structured logger, full
  event taxonomy from `agents/files-logging-agent.md`, recursive secret
  redaction tested.
- `tests/tenant-isolation.test.ts` — 7 tests on real Postgres (pglite WASM)
  with the actual migrations applied. Asserts cross-org reads return null,
  cross-org writes silently no-op, and foreign-`orgId` payloads are
  rejected at the repo boundary.
- Dockerfile (multi-stage, `output: standalone`) + `railway.toml`.
- ESLint rule `no-restricted-imports` blocks `@/db` outside `repositories/`
  and `db/` (defense in depth alongside review).

### Decisions

- ADR-0008 added: pglite for the tenant-isolation harness. Real Postgres
  semantics, zero external dependencies, fast.
- Logger location: `logging/` exports a pino-style sink-injectable logger.
  `console.log` not used in product code. (No new ADR — covered by ADR-0003
  binding "Logging: pino-style structured JSON".)
- Privacy-holds-for-admins rule: even an org admin cannot read another
  user's `private` note. Encoded in `note-permissions.ts` and tested.
- 404-not-403 surface: `services.notes.update` and `.remove` throw
  `AppError('not_found')` for both missing rows and forbidden rows.
  `permission_denied` is reserved for the `create` path, where
  non-existence is not the relevant signal.

### Risks discovered

- MEDIUM: `services.notes.listVisible` currently post-filters by
  `canReadNote` after the SQL fetch. This is a STOPGAP for the foundation
  slice; the search-ai-agent and notes-agent must move the visibility
  predicate INTO SQL per ADR-0004 invariant 4 before any list/search UI
  ships. Documented in code comment in `services/notes-service.ts`.
- LOW: `db/migrate.ts` writes to stdout via `console.log` (one-shot
  operational script). Justified — not product code path.
- LOW: tenant-isolation tests take ~6s due to pglite WASM bootstrap. CI
  acceptable; revisit if it grows.

### Open questions for orchestrator

1. RLS policies (defense-in-depth per ADR-0001) — not authored here. Should
   foundation include `drizzle/0001_rls.sql` or is that owned by the auth
   agent? Current branch ships migration 0000 only.
2. The `note_shares` table for the `shared` visibility tier is not in the
   foundation schema. Permissions assume the shared list is loaded
   alongside the note (`sharedWithUserIds` field on `NoteForPermission`).
   Notes-agent will need to add this table.
3. Search FTS column (`tsvector` + GIN per ADR-0004) is intentionally NOT
   in this migration — owned by search-ai-agent. Schema is stable enough
   for them to add it without a foundation rework.

---

## 2026-05-07 — ci-quality-agent landed (local)

Branch: `feat/ci-quality` — rebased onto `feat/foundation-architecture`. All four foundation scripts pass locally (lint, typecheck, test 71/71, build).

### Workflow structure (`.github/workflows/ci.yml`)

- **Triggers**: `pull_request` (any base branch) + `push` to `main`.
- **Concurrency**: cancels in-flight runs for non-main refs; main runs always complete.
- **Permissions**: `contents: read` only (least privilege).
- **Node**: 22 (matches Dockerfile base image).
- **Env**: `NODE_OPTIONS=--max-old-space-size=4096` so the pglite tenant-isolation suite has memory headroom on the runner.

### Job graph

```text
install (cache deps)
  ├─ lint       → npm run lint
  ├─ typecheck  → npm run typecheck
  ├─ test       → npm run test -- --reporter=verbose   # includes tenant-isolation pglite suite
  ├─ build      → npm run build                        # restores .next/cache
  └─ docker-build (optional, runs only if Dockerfile present)
```

The four primary jobs depend on `install` only — they run in parallel after the dependency cache is warm.

### Cache strategy

| Cache | Path | Key | Purpose |
|---|---|---|---|
| npm registry | (managed by `actions/setup-node@v4` with `cache: npm`) | `package-lock.json` hash | Fast `npm ci` on cache miss. |
| `node_modules` | `node_modules` | `node_modules-${runner.os}-node22-${hash(package-lock.json)}` | Skip `npm ci` when lockfile unchanged. |
| Next.js build | `.next/cache` | `next-${runner.os}-node22-${hash(package-lock.json)}-${hash(**/*.{ts,tsx,js,jsx})}` with lockfile-only restore-keys fallback | Faster incremental builds; restore-key falls back to last build with same lockfile when source changes. |
| Docker layers | GHA cache (`type=gha`) | Buildx-managed | Faster image rebuilds. |

Hit/miss expectations:

- First PR / lockfile change: full miss on all caches; ~2–3 min install, full build.
- Same-branch follow-up commits: `node_modules` HIT; Next cache HIT-or-restore (source change → restore-key fallback rebuilds incrementally).
- Cache key changes deterministically with `package-lock.json` so type/lint regressions cannot be hidden by a stale cache.

### Required status checks (apply via GitHub UI / `gh api` once CI runs once on `main`)

Repo admin must protect `main` with these required checks:

- `lint`
- `typecheck`
- `test`
- `build`

Optional (do not require until proven stable):

- `docker-build (optional)`

CLI shortcut once CI has run at least once:

```bash
gh api -X PUT \
  repos/:owner/:repo/branches/main/protection \
  -f required_status_checks.strict=true \
  -f 'required_status_checks.contexts[]=lint' \
  -f 'required_status_checks.contexts[]=typecheck' \
  -f 'required_status_checks.contexts[]=test' \
  -f 'required_status_checks.contexts[]=build' \
  -F enforce_admins=true \
  -F required_pull_request_reviews.required_approving_review_count=1 \
  -F restrictions=
```

### Risks / observations

- pglite startup observed at ~4.5s in this worktree's local run — comfortable inside the 15-min `test` timeout. No flake observed across local invocations.
- Next 15.1.3 has a published CVE (CVE-2025-66478) flagged on `npm install`. Tracked as a foundation upgrade decision, not a CI defect — left for foundation-agent / orchestrator to schedule.
- No `BUGS.md` entries opened by ci-quality wiring; foundation scripts are clean.

---

## Risk register (live)

| Level | Description | Owner | Status |
|---|---|---|---|
| HIGH | Search visibility filtering must be SQL-level | search-ai-agent | open |
| HIGH | AI summary context must respect user-visible notes only | search-ai-agent | open |
| HIGH | Signed URL generation requires per-request permission check | files-logging-agent | open |
| MEDIUM | Org switching cache invalidation | foundation-architecture-agent | open |
| MEDIUM | FTS performance at ~10k notes | search-ai-agent | open |
| LOW | Migration ordering across worktrees | foundation-architecture-agent | open |

---

## 2026-05-07 — frontend-builder-agent landed (local)

Branch: `feat/frontend-shell` (rebased onto `feat/foundation-architecture`).
Lint, typecheck, build, and the 71 foundation tests all pass.

### Acceptance criteria status

1. App shell — done (`app/(app)/layout.tsx`, `components/app-shell/*`).
2. State primitives — done; `EmptyState` consumed by home placeholder.
3. Theme tokens — extended (typography scale only); foundation's tokens kept.
4. Typography scale — defined once in `globals.css` + `tailwind.config.ts`.
   See `docs/DESIGN_NOTES.md`.
5. Focus visible — global `:focus-visible` + skip-link in root layout.
6. Mobile (375 px) — verified for shell, mobile drawer, sign-in, sign-up
   (visual review against Tailwind breakpoints; `Sheet` covers nav < md).
7. Sign-in + sign-up — UI complete, server actions are stubs marked
   `TODO(auth-agent)` in `app/(auth)/_components/auth-actions.ts`.
8. shadcn primitives — `button input label sheet dropdown-menu avatar
   separator card alert skeleton form` installed via the official CLI.

### Visual decisions (recorded in `docs/DESIGN_NOTES.md`)

- Typography: 8-step scale with named utilities `text-display`/`-h1..-h4`/
  `-body`/`-small`/`-micro`. No ad-hoc font sizes anywhere.
- Accent: kept restrained (single-accent rule). No bespoke brand color
  introduced — uses the foundation's neutral `--accent` token.
- Density: comfortable; no compact mode added.
- Font: system stack via inline `--font-sans` (no network fetch, no
  next/font dependency for the shell).

### New risks / discoveries

- LOW: shadcn-generated `components/ui/form.tsx` triggered the strict
  type-import lint rule. Patched in place — future shadcn updates may
  reintroduce. Documented for `ci-quality-agent`.
- LOW: `'use server'` modules can only export async functions, so the auth
  Zod schemas live in `auth-schemas.ts` (separate from `auth-actions.ts`).
  `auth-agent` must keep this split.
- INFO: org switcher and user menu are presentation-only stubs (disabled
  controls with explicit aria labels). `auth-agent` must replace, not
  extend, them — the slot files contain `TODO(auth-agent)` markers.

### Files added (grouped)

- App routes: `app/(app)/layout.tsx`, `app/(app)/page.tsx`,
  `app/(auth)/layout.tsx`, `app/(auth)/sign-in/page.tsx`,
  `app/(auth)/sign-up/page.tsx`,
  `app/(auth)/_components/{auth-card,sign-in-form,sign-up-form,
  auth-actions,auth-schemas}.{ts,tsx}`.
- Shared UI: `components/brand/logo.tsx`,
  `components/app-shell/{top-bar,side-nav,mobile-nav,
  org-switcher-slot,user-menu-slot,nav-items,index}.{ts,tsx}`,
  `components/states/{empty-state,loading-state,error-state,index}.{ts,tsx}`.
- shadcn primitives: `components/ui/{button,input,label,sheet,
  dropdown-menu,avatar,separator,card,alert,skeleton,form}.tsx`.
- Tokens: `styles/globals.css` (typography vars, reduced-motion),
  `tailwind.config.ts` (named font-size tokens), `components.json`
  (shadcn config).
- Docs: `docs/DESIGN_NOTES.md`.

### Open questions (frontend-shell)

1. Is the home route (`/`) intended to live inside `(app)` (auth-gated) or
   should there be a public marketing landing? Current choice: auth-gated.
2. The "Forgot password" link is a placeholder href to `/sign-in`. Should
   the frontend stub a `forgot-password` route now or leave it for
   `auth-agent`?

## Confidence score (live)

| Area | Weight | Score (0-1) | Weighted |
|---|---|---|---|
| Tenant isolation | 40 | 0.10 | 4.0 |
| Permission enforcement | 20 | 0.10 | 2.0 |
| Feature completeness | 20 | 0.00 | 0.0 |
| Review discipline | 10 | 0.30 | 3.0 |
| Observability | 10 | 0.00 | 0.0 |

**Total: 9.0 / 100**. Bootstrap baseline. Score updates per merge.

Hard-fail conditions (any one → revert + post-mortem):

- Confirmed cross-tenant leakage
- Unsafe file access
- AI accessing unauthorized data

---

## 2026-05-08 — files-logging slice landed

### Files (ADR-0005)

- Bucket: `note-files` (private, configurable via `SUPABASE_FILES_BUCKET`).
  Create manually in Supabase dashboard → Storage → New bucket → uncheck
  "Public bucket". Migrations cannot create buckets.
- Object path scheme:
  `org/<org_id>/note/<note_id>/<file_id>-<sanitized_filename>` or
  `org/<org_id>/standalone/<file_id>-<filename>`.
- Size cap v1: 10 MB (`FILES_MAX_BYTES`). MIME allowlist: png/jpeg/webp/svg,
  pdf, plain text, markdown.
- Signed URL TTL: 300 s (hard cap `MAX_SIGNED_URL_TTL_SECONDS`). Each
  download mints a fresh URL after `canReadFile`. Path is not a credential.
- Rollback semantics: row inserted first; on storage failure the row is
  hard-deleted. Storage delete is non-blocking on remove; janitor reconciles.

### Audit retention

- `audit_log` is org-scoped, append-only. Pre-org-context auth events
  (signin/signout/signup/password_reset_requested) flow through the
  structured logger only — `audit_log.org_id` is NOT NULL.
- Mutations writing audit_log: notes (created/updated/deleted/version_created),
  files (uploaded/read/deleted), orgs (created/membership add/change_role/remove,
  org_switch).
- Retention: open question — recommend 1 year on row, 30 days hot, archived
  to S3 quarterly. Decision deferred to ops.

### Env / config

- `SUPABASE_FILES_BUCKET` (optional, default `note-files`).
- `FILES_MAX_BYTES` (optional, default 10 MB).
