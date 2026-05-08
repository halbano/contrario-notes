# TODO.md — Backlog

Format: `[ ] <id> | <priority> | <risk> | <owner-agent> | <description>`

Priority: P0 (blocker) / P1 (next) / P2 (later).
Risk: HIGH / MEDIUM / LOW.

---

## Phase 0 — Governance (orchestrator)

- [x] G-01 | P0 | LOW | orchestrator | Write TENANCY_INVARIANTS.md
- [x] G-02 | P0 | LOW | orchestrator | Write DESIGN_INVARIANTS.md
- [x] G-03 | P0 | LOW | orchestrator | Write PROJECT_STRUCTURE.md
- [x] G-04 | P0 | LOW | orchestrator | Write PRE_MERGE_CHECKLIST.md
- [x] G-05 | P0 | LOW | orchestrator | Write PR_TEMPLATE.md
- [x] G-06 | P0 | LOW | orchestrator | Write PROCESS.md
- [x] G-07 | P0 | LOW | orchestrator | Write NOTES.md (initial)
- [x] G-08 | P0 | LOW | orchestrator | Write ADR-0001..0007
- [x] G-09 | P0 | LOW | orchestrator | Write 9 agent specs in `/agents`
- [x] G-10 | P0 | LOW | orchestrator | Wire `.github/pull_request_template.md`
- [x] G-11 | P0 | LOW | orchestrator | Create 7 worktrees + branches

## Phase 1 — Foundation (foundation-architecture-agent) — landed local on `feat/foundation-architecture`

- [x] F-01 | P0 | HIGH | foundation | Scaffold Next.js app (App Router, TS strict)
- [x] F-02 | P0 | LOW | foundation | Tailwind + shadcn/ui init, theme tokens
- [x] F-03 | P0 | HIGH | foundation | Drizzle schema (9 tables, all tenant-owned have `org_id`)
- [x] F-04 | P0 | HIGH | foundation | Supabase clients (server / browser / admin), env config
- [x] F-05 | P0 | HIGH | foundation | `RequestContext` builder + auth helper
- [x] F-06 | P0 | HIGH | foundation | `repositories/` base + scoped factory (TDD)
- [x] F-07 | P0 | HIGH | foundation | `services/` scoped factory `createScopedServices(ctx)` (TDD)
- [x] F-08 | P0 | HIGH | foundation | `permissions/` role matrix (TDD, 37 tests)
- [x] F-09 | P0 | MEDIUM | foundation | `logging/` central logger + event taxonomy + redaction
- [x] F-10 | P0 | MEDIUM | foundation | Tenant-isolation test harness (pglite, 7 assertions)
- [x] F-11 | P0 | LOW | foundation | Dockerfile + Railway config
- [x] F-12 | P0 | LOW | foundation | `.env.example`, `.gitignore`, baseline scripts

### Carry-over from foundation phase

- [ ] F-FIX-01 | P0 | HIGH | notes-agent + search-ai-agent | Move `services.notes.listVisible` visibility predicate INTO SQL (per ADR-0004). Stopgap post-filter in `services/notes-service.ts:50-57` violates TENANCY_INVARIANTS invariant 4.
- [ ] F-RLS-01 | P1 | MEDIUM | auth-agent | Author `drizzle/0001_rls.sql` (defense-in-depth per ADR-0001).
- [ ] F-SHARE-01 | P1 | HIGH | notes-agent | Add `note_shares(note_id, user_id, can_edit)` table for `shared` visibility tier.

## Phase 2 — Frontend shell (frontend-builder-agent)

- [x] FE-01 | P1 | LOW | frontend | App layout (top bar + side nav, Contrario aesthetic)
- [~] FE-02 | P1 | LOW | frontend | Org switcher component (data-driven, scoped) — **slot only** (presentation); auth-agent wires data
- [x] FE-03 | P1 | LOW | frontend | Auth screens (sign-in / sign-up via Supabase) — **UI only** with TODO(auth-agent) action stubs
- [x] FE-04 | P1 | LOW | frontend | Empty / loading / error state components
- [x] FE-05 | P1 | LOW | frontend | Mobile breakpoints + nav drawer
- [x] FE-06 | P1 | LOW | frontend | Theme tokens, typography scale, focus styles
- [x] FE-07 | P1 | LOW | frontend | Visual polish — Playwright screenshot iteration loop against Contrario aesthetic
- [x] FE-08 | P1 | LOW | frontend | /forgot-password stub UI

## Phase 3 — Auth + Orgs (auth-agent)

- [x] A-01 | P1 | HIGH | auth | Supabase auth wiring (server + client)
- [x] A-02 | P1 | HIGH | auth | Org create / list / switch endpoints
- [x] A-03 | P1 | HIGH | auth | Membership management (admin/member/viewer)
- [x] A-04 | P1 | HIGH | auth | Org-switching cache invalidation
- [x] A-05 | P1 | MEDIUM | auth | Auth event logging

## Phase 4 — Notes + versioning (notes-agent)

- [ ] N-01 | P1 | MEDIUM | notes | Notes CRUD (server actions + repo + service, TDD)
- [ ] N-02 | P1 | MEDIUM | notes | Tagging
- [ ] N-03 | P1 | HIGH | notes | Visibility model (private / org / shared-with)
- [ ] N-04 | P1 | MEDIUM | notes | Append-only `note_versions`; diff view
- [ ] N-05 | P1 | LOW | notes | Notes UI (list, editor, version history, diff)

## Phase 5 — Search + AI (search-ai-agent)

- [ ] S-01 | P1 | HIGH | search-ai | Postgres FTS: tsvector column + GIN index
- [ ] S-02 | P1 | HIGH | search-ai | Search query: org-scoped + visibility-filtered in SQL
- [ ] S-03 | P1 | HIGH | search-ai | Search UI with permission-safe results
- [ ] S-04 | P1 | HIGH | search-ai | AI summary endpoint with user-visible context only
- [ ] S-05 | P1 | HIGH | search-ai | AI prompt logging (user, org, note ids, prompt hash)
- [ ] S-06 | P1 | MEDIUM | search-ai | AI review-before-accept UX

## Phase 6 — Files + logging (files-logging-agent)

- [ ] FL-01 | P1 | HIGH | files-logging | File upload (Supabase Storage, scoped path)
- [ ] FL-02 | P1 | HIGH | files-logging | Per-request permission check before signed URL
- [ ] FL-03 | P1 | MEDIUM | files-logging | Short-lived signed URLs
- [ ] FL-04 | P1 | MEDIUM | files-logging | File ↔ note association
- [ ] FL-05 | P1 | MEDIUM | files-logging | Audit log table + writers for mutations

## Phase 7 — Seed (seed-agent)

- [ ] SD-01 | P2 | LOW | seed | Seed script: 5 orgs, 30 users, mixed roles
- [ ] SD-02 | P2 | LOW | seed | ~10k notes with overlapping tags/titles + visibility mix
- [ ] SD-03 | P2 | LOW | seed | Version histories + attached files

## Phase 8 — CI / quality (ci-quality-agent)

- [x] CI-01 | P0 | LOW | ci-quality | GitHub Actions: lint + typecheck + test + build on PR + main
- [x] CI-02 | P1 | MEDIUM | ci-quality | Tenant-isolation test job (must pass to merge) — included in `test` job (covers `tests/tenant-isolation.test.ts` via pglite)
- [x] CI-03 | P2 | LOW | ci-quality | Optional: Docker build validation (`docker-build` job, no push)
- [ ] CI-04 | P2 | LOW | ci-quality | Optional: migration validation — deferred (requires ephemeral Postgres + secrets handling, out of scope for this slice)

## Phase 9 — Review (review-agent, continuous)

- [ ] R-01 | continuous | varies | review | Run review pass on every open PR against PRE_MERGE_CHECKLIST.md
- [ ] R-02 | continuous | varies | review | Maintain REVIEW.md with carry-over findings

## Drizzle / RLS follow-ups (execute after PR #8 merges)

Owner: orchestrator (manual) + auth-agent (Phase 4 prod-readiness slice).
Each box should be ticked here as the task lands.

### Immediate (post-merge, manual)

- [ ] DR-01 | P0 | LOW | orchestrator | Apply `0001_rls.sql` to Supabase cloud DB: `npm run db:migrate` (or via Supabase MCP `apply_migration`)
- [ ] DR-02 | P0 | LOW | orchestrator | Verify RLS active: `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public'` — every tenant table must show `t`
- [ ] DR-03 | P0 | LOW | orchestrator | Verify policies present: `SELECT count(*) FROM pg_policies WHERE schemaname='public'` — expect ≥ 24 (4 actions × 6 tables)
- [ ] DR-04 | P0 | LOW | orchestrator | Verify helper `public.user_org_ids()` exists and returns `{}` with no JWT claim
- [ ] DR-05 | P1 | LOW | orchestrator | Smoke test end-to-end: sign-up → create-first-org → create note → confirm visible to author; sign-up second user in second org → confirm note from org A NOT visible (validates RLS in real Postgres, not just pglite)
- [ ] DR-06 | P2 | LOW | orchestrator | `npx drizzle-kit introspect` against live DB, diff against `db/schema.ts` — flag any drift

### Phase 4 — production-readiness (separate slice; high-priority before any prod deploy)

- [ ] DR-PROD-01 | P0 | **HIGH** | auth-agent (followup) | Wire `auth.admin.updateUserById` to write `app_metadata.org_ids` on every membership mutation (`addMember`, `removeMember`, `changeRole`, `createOrgWithAdmin`). Without this, RLS denies legitimate access for users on first session, AND retains DB access for ex-members until their JWT expires. **Block prod deploy on this.**
- [ ] DR-PROD-02 | P1 | MEDIUM | auth-agent (followup) | Configure short JWT expiry (15 min recommended). Reduces stale-claim window after membership change.
- [ ] DR-PROD-03 | P1 | HIGH | auth-agent (followup) | On `removeMember` / role-downgrade, invalidate user sessions: `supabase.auth.admin.signOut(userId, 'global')` (Option B in NOTES.md). Forces fresh JWT issuance with updated claims.
- [ ] DR-PROD-04 | P2 | MEDIUM | ci-quality-agent | CI-04 follow-up: spin up ephemeral Postgres in CI, apply all migrations in order, validate against snapshot. Closes the migrate-validation gap.
- [ ] DR-PROD-05 | P2 | LOW | orchestrator | Document migration runbook in `docs/RUNBOOK.md`: stage vs prod application order, rollback strategy, on-call procedure if a migration corrupts data.
- [ ] DR-PROD-06 | P2 | LOW | orchestrator | Add `pre-deploy` GitHub Action that diffs `drizzle/` vs target environment's applied migrations. Block deploys on un-applied migrations.
