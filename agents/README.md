# /agents — Agent Specifications

One spec per file. Each spec is the agent's contract. The orchestrator dispatches an agent only after reading its spec into context.

## Roster

| Agent | Branch | Worktree | Phase |
|---|---|---|---|
| foundation-architecture-agent | feat/foundation-architecture | feat-foundation-architecture | 1 |
| frontend-builder-agent | feat/frontend-shell | feat-frontend-shell | 2 |
| auth-agent | feat/foundation-architecture (initially), then feat/auth | (shared with foundation) | 3 |
| notes-agent | feat/notes-versioning | feat-notes-versioning | 4 |
| search-ai-agent | feat/search-ai | feat-search-ai | 5 |
| files-logging-agent | feat/files-logging | feat-files-logging | 6 |
| seed-agent | feat/seed-data | feat-seed-data | 7 |
| ci-quality-agent | feat/ci-quality | feat-ci-quality | 8 (parallel) |
| review-agent | none (read-only) | none | continuous |

## Spec format

Each spec includes:

1. Role
2. Scope (files / dirs)
3. Forbidden actions
4. Inputs (docs to read before starting)
5. Acceptance criteria (Definition of Done)
6. Required documentation updates
7. Hand-off output

## Universal contract (applies to every agent)

- Read `TENANCY_INVARIANTS.md`, `DESIGN_INVARIANTS.md`, `PROJECT_STRUCTURE.md`, `PROCESS.md`, `PRE_MERGE_CHECKLIST.md`, and your spec before starting.
- Follow TDD for domain code (services, repositories, permissions, search, AI). Pragmatic for scaffolding.
- Never edit `TENANCY_INVARIANTS.md`, `DESIGN_INVARIANTS.md`, `PROJECT_STRUCTURE.md` without orchestrator approval (an ADR).
- Never merge a PR. Never push to another agent's branch.
- Open PR with `PR_TEMPLATE.md`, declare risk labels, tick all relevant checklist boxes.
- Update `NOTES.md`, `TODO.md`, and any other docs your changes touched.
- Add tenant-isolation tests for any new read/write surface.
