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

- [x] F-FIX-01 | P0 | HIGH | notes-agent + search-ai-agent | Move `services.notes.listVisible` visibility predicate INTO SQL (per ADR-0004). — PR #9
- [x] F-RLS-01 | P1 | MEDIUM | auth-agent | Author `drizzle/0001_rls.sql` (defense-in-depth per ADR-0001). — PR #8 + #11 (journal fix) + #13 (note_shares RLS extension)
- [x] F-SHARE-01 | P1 | HIGH | notes-agent | Add `note_shares(note_id, user_id, can_edit)` table for `shared` visibility tier. — PR #9 (table) + PR #14 (CRUD)

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

## Phase 4 — Notes + versioning (notes-agent) — Phase 1 + Phase 2 merged

- [x] N-01 | P1 | MEDIUM | notes | Notes CRUD (server actions + repo + service, TDD) — PR #14
- [x] N-02 | P1 | MEDIUM | notes | Tagging — PR #14
- [x] N-03 | P1 | HIGH | notes | Visibility model (private / org / shared-with) — PR #9 (predicate) + PR #14 (shares CRUD)
- [x] N-04 | P1 | MEDIUM | notes | Append-only `note_versions`; diff view — PR #14
- [x] N-05 | P1 | LOW | notes | Notes UI (list, editor, version history, diff) — PR #14

### Open follow-ups from Phase 4

- [ ] N-FOLLOW-01 | P2 | LOW | notes-agent | Tag history snapshot in `note_versions` — issue #15

## Phase 5 — Search + AI (search-ai-agent)

- [ ] S-01 | P1 | HIGH | search-ai | Postgres FTS: tsvector column + GIN index
- [ ] S-02 | P1 | HIGH | search-ai | Search query: org-scoped + visibility-filtered in SQL
- [ ] S-03 | P1 | HIGH | search-ai | Search UI with permission-safe results
- [ ] S-04 | P1 | HIGH | search-ai | AI summary endpoint with user-visible context only
- [ ] S-05 | P1 | HIGH | search-ai | AI prompt logging (user, org, note ids, prompt hash)
- [ ] S-06 | P1 | MEDIUM | search-ai | AI review-before-accept UX

## Phase 6 — Files + logging (files-logging-agent)

- [x] FL-01 | P1 | HIGH | files-logging | File upload (Supabase Storage, scoped path)
- [x] FL-02 | P1 | HIGH | files-logging | Per-request permission check before signed URL
- [x] FL-03 | P1 | MEDIUM | files-logging | Short-lived signed URLs
- [x] FL-04 | P1 | MEDIUM | files-logging | File ↔ note association
- [x] FL-05 | P1 | MEDIUM | files-logging | Audit log table + writers for mutations

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

- [x] DR-01 | P0 | LOW | orchestrator | Apply `0001_rls.sql` to Supabase cloud DB. — applied 2026-05-08 (manual + journal patched via PR #11)
- [x] DR-02 | P0 | LOW | orchestrator | Verify RLS active. — 7/7 tenant tables `rowsecurity=true` (notes, note_versions, tags, note_tags, files, audit_log, note_shares)
- [x] DR-03 | P0 | LOW | orchestrator | Verify policies present. — 14 policies (12 from 0001 + 2 from 0003)
- [x] DR-04 | P0 | LOW | orchestrator | Verify helper `public.user_org_ids()`. — exists, returns `{}` with no claim
- [ ] DR-05 | P1 | LOW | orchestrator | Smoke test end-to-end: sign-up → create-first-org → create note → confirm visible to author; sign-up second user in second org → confirm note from org A NOT visible (validates RLS in real Postgres, not just pglite). **Pending — needs Supabase JWT app_metadata.org_ids sync wired (DR-PROD-01) for accurate test.**
- [ ] DR-06 | P2 | LOW | orchestrator | `npx drizzle-kit introspect` against live DB, diff against `db/schema.ts` — flag any drift

### Phase 4 — production-readiness (separate slice; high-priority before any prod deploy)

- [ ] DR-PROD-01 | P0 | **HIGH** | auth-agent (followup) | Wire `auth.admin.updateUserById` to write `app_metadata.org_ids` on every membership mutation (`addMember`, `removeMember`, `changeRole`, `createOrgWithAdmin`). Without this, RLS denies legitimate access for users on first session, AND retains DB access for ex-members until their JWT expires. **Block prod deploy on this.**
- [ ] DR-PROD-02 | P1 | MEDIUM | auth-agent (followup) | Configure short JWT expiry (15 min recommended). Reduces stale-claim window after membership change.
- [ ] DR-PROD-03 | P1 | HIGH | auth-agent (followup) | On `removeMember` / role-downgrade, invalidate user sessions: `supabase.auth.admin.signOut(userId, 'global')` (Option B in NOTES.md). Forces fresh JWT issuance with updated claims.
- [ ] DR-PROD-04 | P2 | MEDIUM | ci-quality-agent | CI-04 follow-up: spin up ephemeral Postgres in CI, apply all migrations in order, validate against snapshot. Closes the migrate-validation gap.
- [ ] DR-PROD-05 | P2 | LOW | orchestrator | Document migration runbook in `docs/RUNBOOK.md`: stage vs prod application order, rollback strategy, on-call procedure if a migration corrupts data.
- [ ] DR-PROD-06 | P2 | LOW | orchestrator | Add `pre-deploy` GitHub Action that diffs `drizzle/` vs target environment's applied migrations. Block deploys on un-applied migrations.

## Validation findings (cloud Supabase walkthrough — 2026-05-09)

User-driven manual walkthrough surfaced UX gaps after auth + RLS landed in cloud.
Tracked here as VAL-XX entries; severity flagged inline.

- [x] VAL-01 | P0 | HIGH | auth-agent (followup) | `/auth/callback` route handler — exchanges Supabase code for session and redirects (`exchangeCodeForSession`). `signUp` and `requestPasswordReset` must pass `emailRedirectTo` / `redirectTo` pointed at this callback. Without it, magic-link / confirmation / recovery clicks land on a 404.
- [x] VAL-02 | P0 | MEDIUM | auth-agent (followup) | Sign-up email-confirmation success banner. When Supabase returns a user but no session (email-confirmation enabled), the form must render a "Check your email" view with a Resend action; today it silently redirects to `/` and the user is bounced back to `/sign-in` because the cookie was never set.
- [x] VAL-09 | P1 | MEDIUM | auth-agent (followup) | Org-create CTA when zero memberships. Authenticated user with no membership currently lands on the app shell with a disabled "No organization" pill and no path forward. Layout must redirect orphans to `/onboarding/create-org`; org-switcher fallback link kept as defense-in-depth.

## AI hardening follow-ups (PR #22 carry-over)

Owner: search-ai-agent (followups) + orchestrator. Track risks called out in PR #22 review. Tick as each lands.

- [ ] AI-01 | P2 | LOW | search-ai-agent (followup) | Real Anthropic API smoke. New `scripts/smoke-ai.ts` gated by `process.env.ANTHROPIC_API_KEY`; sends a 1-token request to verify shape + auth + model id. Runs manually after deploy or via opt-in CI job. Defer until first prod rollout.
- [ ] AI-02 | P2 | MEDIUM | search-ai-agent (followup) | Distributed rate limiter. In-memory limiter allows `instances × limit` on multi-instance Railway. Swap to `@upstash/ratelimit` + Upstash Redis HTTP when a second instance is provisioned. ~10 LOC swap; `TODO(redis)` marker exists in code.
- [ ] AI-03 | P1 | HIGH | search-ai-agent (followup) | Prompt-injection edge cases beyond fence-closure escape. Add unit tests in `services/ai-service.test.ts` for: nested CDATA payloads, control-character splices (`\x00`, `\x1b`, zero-width), instruction-override via the `<UNTRUSTED_NOTE>` block (assert system prompt's "ignore in-content directives" rule survives), and length truncation (notes > 100k chars truncated at the prompt builder, not the LLM). Sub-1-day work.
- [ ] AI-04 | P2 | LOW | search-ai-agent (followup) | Golden-output AI quality tests. Opt-in suite gated by `ANTHROPIC_API_KEY` that asserts representative summary outputs against snapshots. Defer until prompt is stable enough that drift matters.
- [ ] AI-05 | P1 | LOW | search-ai-agent (followup) | Wire AI events into `services.audit`. `LOG_EVENTS.AI_*` already pipe through the structured logger; add `services.audit.record(...)` calls in `ai-service.ts` for `ai.summary_requested`, `ai.summary_completed`, `ai.summary_failed`. **Blocks on PR #21 (files+audit infra) merge.** ~20 LOC follow-up commit.

## Validation findings (manual walkthrough against cloud Supabase, 2026-05-09)

Surfaced while clicking through real auth flow + first navigation. Each is a discrete fix; pick + dispatch independently.

### Auth flow

- [ ] VAL-01 | P0 | **HIGH** | auth-agent (followup) | **Missing `/auth/callback` route.** Supabase confirmation/recovery email links land on `/sign-in?code=...&redirectTo=%2F`. The sign-in page never exchanges the code → session never established → unhandled webpack error on render. Fix: add `app/auth/callback/route.ts` that calls `supabase.auth.exchangeCodeForSession(code)` then redirects to `redirectTo` (default `/`). Also update `signUp` and `requestPasswordReset` to pass `options.emailRedirectTo: ${APP_URL}/auth/callback` so the email link points there.
- [ ] VAL-02 | P0 | MEDIUM | auth-agent (followup) | **Sign-up gives no feedback when email confirmation is required.** When Supabase returns `data.user` but no `data.session`, `signUpAction` still `redirect('/')` → middleware bounces back to `/sign-in` → user has no idea why. Fix: extend `AuthResult` with `sessionCreated: boolean`. In the action: if `!sessionCreated`, return `{ ok: true, requiresEmailConfirmation: true }` (no redirect). In `sign-up-form.tsx`: show a success card "Check your email to confirm your account" + "Resend" button (rate-limited). Same fix logic for the password-reset success state.
- [ ] VAL-03 | P2 | LOW | auth-agent (followup) | `requestPasswordReset` (`features/auth/server/auth-server.ts:96`) currently sets `redirectTo: ${APP_URL}/sign-in` — same bug pattern. Update to `/auth/callback?type=recovery` once VAL-01 lands.
- [ ] VAL-04 | P2 | LOW | auth-agent (followup) | Sign-up: option to disable Supabase email confirmation in the dashboard for dev to make iteration faster. Document in `docs/SUPABASE_SETUP.md` (create if missing). Production must keep it on.

### Cloud DB state

- [ ] VAL-05 | P0 | LOW | orchestrator | **Cloud DB has no seed data.** Seed-agent ran in CI/local only. Run `SEED_PROFILE=small npm run seed -- --i-know-this-is-cloud` against cloud `DATABASE_URL` to populate orgs/users/notes for end-to-end testing. (Cloud guard already in place at `scripts/seed/lib/cloud-guard.ts`.) Decision needed: small (100 notes, fast iteration) vs full (10k notes, scale validation).
- [ ] VAL-06 | P1 | LOW | orchestrator | DR-05 cloud RLS smoke test — sign up two real users in two orgs, write notes in each, confirm cross-org reads return 404. Validates RLS round-trip in real Postgres beyond pglite. Blocked on VAL-01 + VAL-05.

### Dev environment hygiene

- [ ] VAL-07 | P2 | LOW | orchestrator | Document `rm -rf .next && npm run dev` workflow in README — webpack caches stale state across big multi-PR merges (observed twice). Either as a doc note or a one-line `npm run dev:clean` script.
- [ ] VAL-08 | P2 | LOW | orchestrator | Sign-up form's "Create account" button has no rate limit. Brute-force protection lives at Supabase tier (per-IP), but worth confirming defaults + adding a note in `docs/SUPABASE_SETUP.md`.
