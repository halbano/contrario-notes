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
- [ ] G-08 | P0 | LOW | orchestrator | Write ADR-0001..0007
- [ ] G-09 | P0 | LOW | orchestrator | Write 9 agent specs in `/agents`
- [ ] G-10 | P0 | LOW | orchestrator | Wire `.github/pull_request_template.md`
- [ ] G-11 | P0 | LOW | orchestrator | Create 7 worktrees + branches

## Phase 1 — Foundation (foundation-architecture-agent)

- [ ] F-01 | P0 | HIGH | foundation | Scaffold Next.js app (App Router, TS strict)
- [ ] F-02 | P0 | LOW | foundation | Tailwind + shadcn/ui init, theme tokens
- [ ] F-03 | P0 | HIGH | foundation | Drizzle schema: `users`, `organizations`, `memberships`, `notes`, `note_versions`, `tags`, `note_tags`, `files`, `audit_log`
- [ ] F-04 | P0 | HIGH | foundation | Supabase client (server + client variants), env config
- [ ] F-05 | P0 | HIGH | foundation | `RequestContext` builder + auth helper (session → ctx)
- [ ] F-06 | P0 | HIGH | foundation | `repositories/` base + scoped factory (TDD)
- [ ] F-07 | P0 | HIGH | foundation | `services/` scoped factory `createScopedServices(ctx)` (TDD)
- [ ] F-08 | P0 | HIGH | foundation | `permissions/` module + role matrix (TDD)
- [ ] F-09 | P0 | MEDIUM | foundation | `logging/` central logger + event taxonomy
- [ ] F-10 | P0 | MEDIUM | foundation | Tenant-isolation test harness in `tests/`
- [ ] F-11 | P0 | LOW | foundation | Dockerfile + Railway config
- [ ] F-12 | P0 | LOW | foundation | `.env.example`, `.gitignore`, baseline scripts

## Phase 2 — Frontend shell (frontend-builder-agent)

- [ ] FE-01 | P1 | LOW | frontend | App layout (top bar + side nav, Contrario aesthetic)
- [ ] FE-02 | P1 | LOW | frontend | Org switcher component (data-driven, scoped)
- [ ] FE-03 | P1 | LOW | frontend | Auth screens (sign-in / sign-up via Supabase)
- [ ] FE-04 | P1 | LOW | frontend | Empty / loading / error state components
- [ ] FE-05 | P1 | LOW | frontend | Mobile breakpoints + nav drawer
- [ ] FE-06 | P1 | LOW | frontend | Theme tokens, typography scale, focus styles

## Phase 3 — Auth + Orgs (auth-agent)

- [ ] A-01 | P1 | HIGH | auth | Supabase auth wiring (server + client)
- [ ] A-02 | P1 | HIGH | auth | Org create / list / switch endpoints
- [ ] A-03 | P1 | HIGH | auth | Membership management (admin/member/viewer)
- [ ] A-04 | P1 | HIGH | auth | Org-switching cache invalidation
- [ ] A-05 | P1 | MEDIUM | auth | Auth event logging

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

- [ ] CI-01 | P0 | LOW | ci-quality | GitHub Actions: lint + typecheck + test + build on PR + main
- [ ] CI-02 | P1 | MEDIUM | ci-quality | Tenant-isolation test job (must pass to merge)
- [ ] CI-03 | P2 | LOW | ci-quality | Optional: Docker build validation
- [ ] CI-04 | P2 | LOW | ci-quality | Optional: migration validation

## Phase 9 — Review (review-agent, continuous)

- [ ] R-01 | continuous | varies | review | Run review pass on every open PR against PRE_MERGE_CHECKLIST.md
- [ ] R-02 | continuous | varies | review | Maintain REVIEW.md with carry-over findings
