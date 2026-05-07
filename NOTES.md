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
| **HIGH** | `services.notes.listVisible` post-filters; must move to SQL before list/search UI | notes-agent + search-ai-agent | open |
| HIGH | Search visibility filtering must be SQL-level | search-ai-agent | open |
| HIGH | AI summary context must respect user-visible notes only | search-ai-agent | open |
| HIGH | Signed URL generation requires per-request permission check | files-logging-agent | open |
| MEDIUM | Org switching cache invalidation | auth-agent | open |
| MEDIUM | FTS performance at ~10k notes | search-ai-agent | open |
| LOW | Migration ordering across worktrees (foundation owns 0000, others propose deltas) | orchestrator | open |
| LOW | RLS not yet implemented (defense-in-depth gap) | auth-agent | open |

## Confidence score (live, updated)

| Area | Weight | Score (0-1) | Weighted |
|---|---|---|---|
| Tenant isolation | 40 | 0.55 | 22.0 |
| Permission enforcement | 20 | 0.55 | 11.0 |
| Feature completeness | 20 | 0.05 | 1.0 |
| Review discipline | 10 | 0.50 | 5.0 |
| Observability | 10 | 0.50 | 5.0 |

**Total: 44.0 / 100**. Up from 9.0 at bootstrap.

Note: tenant isolation scored 0.55 — pattern is in place + 7 isolation tests pass, but the `listVisible` post-filter is a known violation pending the notes-agent fix. Will rise to ~0.85 after that fix lands.

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
