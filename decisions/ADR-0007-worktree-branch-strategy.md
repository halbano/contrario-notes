# ADR-0007 — Worktree + branch-per-agent execution model

- Status: accepted
- Date: 2026-05-07

## Context

Multiple agents will operate in parallel. Need physical separation that prevents one agent from clobbering another's working tree, while keeping a single source of truth (one repo, one main branch, one migration timeline).

## Decision

Use git worktrees, one per agent, sibling to the main checkout:

```text
/Users/hernanalbano/Documents/Proyectos/contrario-notes              # main
/Users/hernanalbano/Documents/Proyectos/contrario-notes-worktrees/
  feat-foundation-architecture/
  feat-frontend-shell/
  feat-notes-versioning/
  feat-search-ai/
  feat-files-logging/
  feat-seed-data/
  feat-ci-quality/
```

Branches:

- `feat/foundation-architecture`
- `feat/frontend-shell`
- `feat/notes-versioning`
- `feat/search-ai`
- `feat/files-logging`
- `feat/seed-data`
- `feat/ci-quality`

Rules:

- Each agent owns exactly one worktree + branch.
- `feat/foundation-architecture` lands first; all others rebase onto it before opening PRs.
- Migrations are owned by `foundation-architecture` until it merges. Other agents proposing schema changes do so via ADR + handoff.
- An agent may not push to another agent's branch.
- An agent may not merge any PR.

Cleanup:

- After merge: `git worktree remove <path>` and `git branch -d <branch>`.

## Consequences

Pros:

- Filesystem-level isolation. No cross-agent file-system races.
- Single repo means one history, one CI, one set of conventions.
- Worktrees are cheap to create and destroy.

Cons:

- Migration coordination required. Mitigated by single-owner rule until foundation merges.
- Agents need awareness of `cwd` differences. Each agent dispatch carries its worktree path.

## Alternatives considered

- **One repo, all agents on main**: race conditions, unreviewable history. Rejected.
- **Forks**: heavyweight, breaks single-history goal. Rejected.

## Enforcement

- `PROCESS.md` agent boundaries.
- Orchestrator dispatches each agent with explicit `cwd` set to its worktree.
