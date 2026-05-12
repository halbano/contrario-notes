# AI_USAGE.md

Record of how AI assistance was used to build this repo. Written from the
orchestrator's perspective. The orchestrator (a human) drove a Claude Code
(Opus 4.7, 1M ctx) session that dispatched specialised sub-agents into
isolated git worktrees, reviewed every PR by hand, and merged them into
`main`.

Tooling: **Claude Code (Opus 4.7, 1M ctx)** for both orchestration and
sub-agents. No other LLM was used.

---

## Agents dispatched

Each sub-agent had a written spec under `agents/`, a dedicated worktree, a
single feature branch, and an explicit acceptance-criteria list. LOC are
the merge-commit `git diff --shortstat` between merge parents (counts
include tests + docs).

| Agent / slice | Branch | PR | Merge | LOC | Delivered |
|---|---|---|---|---|---|
| foundation-architecture | `feat/foundation-architecture` | #2 | `0e6131d` | +13507 | Next 15.1.3 + TS strict + Drizzle 9 tables + Supabase clients + `RequestContext` + scoped `repositories/`+ `services/` + `permissions/` (37-test matrix) + `logging/` (taxonomy + redaction) + pglite tenant-isolation harness (7 tests) + Dockerfile + railway.toml + 8 ADRs |
| ci-quality | `feat/ci-quality` | #3 | `992ec9d` | +281/-4 | GitHub Actions: lint + typecheck + test + build + optional docker-build, with npm + node_modules + Next-cache + Buildx GHA caches; concurrency group; required-checks doc |
| frontend-builder | `feat/frontend-shell` | #4 | `ef6f0b8` | +4010/-371 | App shell (top bar + side nav + mobile drawer), 11 shadcn primitives, sign-in / sign-up / forgot-password (UI only, action stubs), state primitives (empty/loading/error), typography scale, focus styles, Playwright screenshot harness, 3 visual-polish rounds |
| auth | `feat/auth` | #8 | `7869c2a` | +1937/-55 | Supabase auth (signin/signup/signout/reset, don't-leak-existence on reset), org create/list/switch with httpOnly active-org cookie, membership management (admin-gated), `lib/auth-context.ts`, `permissions/org-permissions.ts` (17 tests), 8 auth event types, **`drizzle/0001_rls.sql`** (12 policies on 6 tenant tables) + 5 pglite RLS isolation tests |
| notes Phase 1 | `feat/notes-versioning` | #9 | `64a7d11` | +1444/-9 | `note_shares` schema (`drizzle/0002_note_shares.sql`) + **SQL-level visibility predicate** (`permissions/note-visibility-sql.ts`) replacing the foundation-tier post-filter + 6 isolation assertions (cross-org private/org/shared symmetry) |
| notes Phase 2 | `feat/notes-phase-2` | #14 | `afa6c97` | +2847/-58 | Notes CRUD + tags + shares CRUD + append-only `note_versions` write path + version-diff UI + list/detail/editor/history/share-panel UI + 19 isolation/permissions tests + Copilot-review polish (char counters, share-picker disabled state, history hint, diff-lib rationale comment) |
| seed | `feat/seed-data` | #18 | `e6a1fb8` | +1696/-201 | Generators (orgs, users, memberships, notes, tags, shares, versions, files) + CLI `npm run seed` routed through scoped services (no raw DB writes) + cloud-guard (`--i-know-this-is-cloud` flag) + reset path |
| auth-jwt-sync | `feat/auth-jwt-sync` | #20 | `6d7e49a` | +782/-1672 | DR-PROD-01: `syncUserOrgIds` + `signOutUserGlobally` helpers; wired into every membership mutation; `RUNBOOK.md` with prod-readiness checklist; tenant-isolation test exercising the full sync flow |
| files-logging | `feat/files-logging` | #21 | `247f7cd` | +2512/-26 | Files repository + `audit_log` repository + file permissions (parent-note share gating); `services.files` (upload, signed-URL, delete) with audit writer; per-request `canReadFile` before signed URL; **single slice for files + audit**; audit writers wired across notes/orgs/files services |
| search-ai | `feat/search-ai` | #22 | `01000cb` | +3263/-35 | `drizzle/0004_search_fts.sql` (tsvector + GIN); `services.search` (visibility-filtered FTS query reusing the Phase 1 SQL predicate); `/search` UI; AI summary service (`services.ai.summarize`) with permission-safe context builder + Anthropic SDK adapter + `prompts/note-summary.md` (versioned template, "treat content as untrusted" system rule); in-memory rate limiter (`TODO(redis)` marker); review-before-accept UI |
| auth-followup VAL-01/02/09 | `feat/auth-followup-val-01-02-09` | #28 | `6d29610` | +881/-78 | `app/auth/callback/route.ts` (exchanges Supabase code → session, sanitised redirect, open-redirect guard); sign-up email-confirmation banner with `resendConfirmationAction`; `lib/require-membership.ts` redirecting orphans to `/onboarding/create-org`; `app/onboarding/create-org/{page,layout}.tsx`; 18 net new tests |

Operational chore PRs (orchestrator, not agent-authored): #5 PR-template
link, #7 nav placeholder routes, #10 CI hashFiles fix, #11 drizzle journal
patch, #12 Docker `public/.gitkeep`, #13 RLS for `note_shares`, #16
post-merge doc updates, #17 README expansion, #19 nav-click 404 test, #23
package.json comma fix, #24 broader smoke harness, #25 + #26 + #29 TODO
tracking, #27 `server-only` runtime fence + missing dep install.

---

## How work was split

**Two-phase notes split.** The notes spec was deliberately cut after the
foundation flagged its `services.notes.listVisible` post-filter as a
HIGH-risk stopgap (NOTES.md 2026-05-07, foundation entry). Phase 1 (PR #9)
was scoped to *only* the SQL visibility predicate + `note_shares` schema —
no UI, no CRUD. This was the prerequisite for everything downstream:
search needed the same predicate, AI needed it, and Phase 2 needed it.
Phase 2 (PR #14) shipped the UI/CRUD/versioning on top, after the
predicate was merged and the search/AI agents could safely depend on it.

**Search-AI reuse of the visibility predicate.** PR #22 commit B
(`e89956f`) imports `notesVisibleToUserPredicate` from
`permissions/note-visibility-sql.ts` (the artifact of PR #9) into the FTS
query. Same for the AI service (commit D, `feaa9f1`): note ids are routed
through that predicate before the prompt builder sees them. Single source
of truth — search and AI cannot leak what `listVisible` does not show.

**Files-logging as one slice, not two.** The agent spec separated
`files-logging-agent` from a notional `audit-agent`. We collapsed them
into a single PR (#21) for two reasons: (a) the audit-log writers are
mutation-side and need to live in the same services that own the
mutations (notes, orgs, files), so splitting them would have produced a
file-touch overlap; (b) `audit_log` is itself just another tenant-scoped
table, so the same RLS + repository pattern carries the audit slice with
near-zero extra surface. Result: 6 commits in one branch, no rebase
conflict against parallel work.

---

## What ran in parallel

The worktree-per-agent strategy (ADR-0007) was designed to enable
parallelism. Concrete moments:

- **frontend-builder + ci-quality** ran concurrently after foundation
  merged. PR #3 (`992ec9d`, ci) and PR #4 (`ef6f0b8`, frontend) merged
  six hours apart but shared no source files; the frontend agent was
  iterating on visual polish while ci-quality wrote workflows.
- **auth + notes Phase 1** ran concurrently. PR #8 (`7869c2a`, auth) and
  PR #9 (`64a7d11`, notes Phase 1) merged minutes apart on 2026-05-08.
  Both added Drizzle migrations on top of `0000_init` — auth landed
  `0001_rls.sql`, notes Phase 1 landed `0002_note_shares.sql`. The
  parallel migration authoring caused the journal-drift bug below.
- **seed + auth-jwt-sync + nav-click test** were three concurrent chore
  branches (PRs #18, #19, #20) merged within the same window. The
  near-simultaneous merges of #18 and #19 produced the broken
  `package.json` (PR #23 fix).
- **files-logging + search-ai** ran concurrently for the final feature
  push. PR #21 (`247f7cd`, files) merged ~two hours before PR #22
  (`01000cb`, search-ai). Search-ai had to rebase to pick up the audit
  infra; the merge commit `603008e` (inside PR #22) reconciled both.

---

## Where agents were wrong

Specifics, with the PR that fixed each. These are not all the agent
mistakes — they are the ones that escaped the agent's own test pass and
were caught by orchestrator review or runtime.

| # | Agent | Mistake | Caught by | Fix |
|---|---|---|---|---|
| 1 | foundation | `services.notes.listVisible` post-filtered by `canReadNote` in app code — violates TENANCY_INVARIANTS invariant 4 (visibility must be SQL-level). Foundation acknowledged this as a stopgap in code comment + NOTES.md. | Spec review | PR #9 (`9c3c2ac`) — SQL predicate replaces post-filter |
| 2 | auth | `drizzle/0001_rls.sql` shipped on disk, but the `_journal.json` entry was lost during rebase against parallel notes work. `npm run db:migrate` silently skipped the RLS migration on the cloud DB. | Manual cloud verification | PR #11 (`872a3f9`) — register entry; PR #13 (`6c34f63`) — extend RLS to `note_shares` (predated the table) |
| 3 | search-ai | Imported `'server-only'` in `lib/anthropic.ts` without installing the package. Worked under Next.js webpack but crashed `npm run seed` in plain Node (`tsx` + vitest treat the virtual module as runtime-throw). | Seed CLI runtime | PR #27 (`e359f31`) — replace with `typeof window` runtime fence + `npm install server-only` |
| 4 | search-ai | `0004_search_fts.sql` migration generated and registered in journal, but **not applied to cloud Supabase** before merge. Discovered when `/search` returned zero rows in the cloud walkthrough. | Manual cloud walkthrough | Orchestrator applied via Supabase SQL editor + verified hash |
| 5 | foundation | `Dockerfile` referenced `public/` (`COPY --from=build /app/public ./public`) but the repo had no `public/` directory. Docker validation job was the first to fail. | CI docker-build job | PR #12 (`d9224a4`) — `public/.gitkeep` |
| 6 | ci-quality | `if: hashFiles('Dockerfile') != ''` was set at job-level on `docker-build`. GitHub Actions does not allow `hashFiles()` in job-level `if:` (only step-level / expression contexts) — the workflow file was rejected by the parser, blocking *every* CI run. | First CI run | PR #10 (`07edd62`) — drop the guard |
| 7 | auth-followup | `app/onboarding/create-org/page.tsx` reads cookies and authenticated user → must be dynamic; without `export const dynamic = 'force-dynamic'`, Next attempted to statically prerender at build, throwing `Dynamic server usage` against `cookies()`. | CI build job | PR #28 amendment (force-pushed) — added the export at line 11 |
| 8 | notes / search-ai | Both edited `drizzle/meta/_journal.json` in parallel. Conflict resolution dropped one entry. The `note_shares` table itself was created (PR #9) but the `0001_rls` policies skipped it because the table didn't exist yet at 0001 time, and no policy-extension migration was authored. | Orchestrator audit of policies | PR #13 — `0003_rls_note_shares.sql` |

Pattern: **6 of 8 mistakes are install/journal/build-config drift, not
logic bugs.** Agents are reliable on the specified slice; they are
unreliable on cross-cutting infrastructure they did not author.

---

## Where the orchestrator (human) intervened

Concrete moments:

- **Manual application of `0001_rls.sql` to cloud Supabase.** Because the
  drizzle journal had dropped the entry (mistake #2 above), `npm run
  db:migrate` was a no-op. Applied via Supabase SQL editor and patched
  `drizzle.__drizzle_migrations` so the cloud journal hash matched the
  repo. Verified `rowsecurity=true` on 6 tables + 12 policies.
- **Manual deletion of seed auth users between reseeds.** `seed --reset`
  truncated `public.users` but left `auth.users` untouched, leaving
  orphans that broke FK on next reseed. Cleaned via
  `supabase.auth.admin.listUsers` → filter `*@seed.contrario.dev` →
  delete. VAL-12 tracks the proper fix in the seed agent.
- **Force-pushed PR #28 amendment** after CI flagged the static-prerender
  bug (mistake #7). Single-line addition on top of an already-reviewed
  PR; force-push was the cleanest path versus a revert + re-PR.
- **Manual cloud-Supabase walkthrough** on 2026-05-09 surfaced VAL-01..09
  (commit `50c4cc0`) and VAL-10..13 (commit `38259e2`). Auth flow
  walkthrough exposed: the missing `/auth/callback` route (VAL-01), the
  silent sign-up redirect when email confirmation is enabled (VAL-02),
  the dead-end "no organisation" pill on first login (VAL-09), and the
  FK violation when `public.users` mirror is missing (VAL-11). None were
  caught by tests because tests mocked the Supabase auth surface.
- **Resolved merge conflicts** on PR #8 (`2c3f311` — NOTES.md), PR #9
  (`permissions/index.ts` + service tests), PR #22 (`603008e` — 4 files
  reconciling audit + jwt-sync + package.json comma).
- **Bumped AI default model** to `claude-sonnet-4-6` (`3d7a443`, inside
  PR #22) after the agent pinned an older model.

---

## What the orchestrator does not trust agents to do

Opinionated, based on observed failures across this session.

1. **Cross-cutting refactors that span 5+ files an agent did not author
   originally.** Rebase conflict math is unreliable; the journal-drift
   bug (#2) and the package.json comma (PR #23) both came from rebase /
   parallel-merge collisions. Refactors of this shape should be
   orchestrator-driven or single-author single-branch.
2. **End-to-end auth flows against real services.** Mocking misleads.
   PR #8 had passing tests; the manual walkthrough still surfaced four
   real-flow gaps (VAL-01, VAL-02, VAL-09, VAL-11). For auth, manual
   smoke against the real provider is non-negotiable before sign-off.
3. **Migration ordering across parallel branches.** Drizzle's journal
   merge logic + agent autonomy = silent omission risk (#2, #4, #8).
   Either single-author migration timeline, or a CI gate that diffs
   `ls drizzle/*.sql` against journal entries (DR-PROD-04 / CI-04 is
   queued for this).
4. **Dependency installation when introducing a new import.** Two strikes
   in one session: PR #22 imported `'server-only'` without installing
   (PR #27 fix), and the same PR introduced `@anthropic-ai/sdk` as a
   second install-vs-import drift (caught at install time, not in
   review). A pre-merge check that diffs `package.json` against actual
   imports would close this.

---

## 2026-05-12 addendum — follow-up fixes (no new agents)

Two PRs landed inline (no agent dispatch) because both were narrow,
single-file UX defects discovered by walking the deployed app:

| PR | Surface | LOC | Why no agent |
|---|---|---|---|
| #48 — search prefix-match (BUG-0021) | `repositories/search-repository.ts` + 1 test | ~25 | Single file, single-function helper. Faster than the agent-prompt round-trip. |
| #49 — note share by email | `features/notes/components/share-panel.tsx` | ~74 | Pure UI swap (`<select>` → `<input type="email">` + `<datalist>`). No service contract change. |

Both were diagnosed by reading user-supplied screenshots (search), then
the existing code paths, then implementing the smallest possible diff.
Pattern: **once the codebase is mature and conventions are
established, the orchestrator + Edit/Write/Bash tools beat a fresh
agent on round-trip latency for sub-100-LOC fixes**. Agents pay off
when the task is large enough to amortize the prompt-design cost.
