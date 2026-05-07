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

1. Finish ADR-0001..0007.
2. Write 9 agent specs in `/agents`.
3. Stand up GitHub PR template, NOTES/TODO scaffolding.
4. Create 7 worktrees + branches.
5. Dispatch `foundation-architecture-agent` first; rest blocked until foundation merges.

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
