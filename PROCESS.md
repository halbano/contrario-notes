# PROCESS.md

How work flows. How agents collaborate. How risks surface.

## Roles

- **Orchestrator (this assistant)**: prioritizes, delegates, reviews, maintains docs and risk register. Does not autonomously merge.
- **Specialized agents**: scoped to one branch / worktree / domain. Operate per their spec in `/agents`.
- **Review agent**: independent pass over PRs against `PRE_MERGE_CHECKLIST.md`.
- **User**: final approver. Merges PRs.

## Lifecycle of a feature

1. **Backlog**: item exists in `TODO.md` with priority + risk + owner agent.
2. **ADR (if architectural)**: written + accepted before code.
3. **Branch + worktree**: agent creates `feat/<scope>` worktree from main.
4. **TDD (domain code)**: failing test → impl → green → refactor.
5. **Implementation**: scoped to declared files; no cross-feature edits without escalation.
6. **Self-review**: agent runs lint, typecheck, test, build locally before pushing.
7. **PR**: agent opens PR using `PR_TEMPLATE.md`, applies risk labels.
8. **Review**: review agent + user inspect against `PRE_MERGE_CHECKLIST.md`.
9. **CI**: must be green.
10. **Merge**: user merges. Agent updates `TODO.md`, `NOTES.md`, `VERSION_LOG.md`.
11. **Risk reconciliation**: open risks updated; new risks added.

## Branch naming

- `feat/foundation-architecture`
- `feat/frontend-shell`
- `feat/notes-versioning`
- `feat/search-ai`
- `feat/files-logging`
- `feat/seed-data`
- `feat/ci-quality`
- `fix/<short-desc>` for bugs
- `chore/<short-desc>` for non-feature work

## Worktree layout

`../contrario-notes-worktrees/<branch-name>` — sibling to main checkout.

## Agent boundaries

Agents may:

- Create their declared branch
- Edit files within their declared scope
- Add tests, docs, ADRs scoped to their work
- Open PRs

Agents may NOT:

- Merge PRs
- Edit `TENANCY_INVARIANTS.md`, `DESIGN_INVARIANTS.md`, `PROJECT_STRUCTURE.md` without orchestrator approval
- Modify another agent's branch
- Bypass `PRE_MERGE_CHECKLIST.md`
- Change shared contracts (`RequestContext`, scoped services factory, base repository signature) without ADR

## Escalation

Escalate to orchestrator when:

- Tenancy invariant cannot be honored as designed
- Cross-feature edit required
- Shared contract change required
- Risk classification unclear
- Test cannot be made deterministic

## Dependency order between branches

```text
feat/foundation-architecture
       ↓
feat/frontend-shell ──┐
                      ├──→ feat/notes-versioning ──→ feat/search-ai
                      │                                  ↓
feat/ci-quality       └──→ feat/files-logging  ────────────→ feat/seed-data
```

`foundation-architecture` lands first. Others rebase onto it.

## Communication channels

- `NOTES.md` — durable journal (decisions, risks, lessons).
- `TODO.md` — backlog + status.
- ADRs — architectural choices.
- PR body — change-specific context.
- `BUGS.md` — known issues + fixes.
- `REVIEW.md` — review findings carry-overs.

## Definition of done

- Tenancy invariants honored
- Permissions enforced
- Tests cover acceptance criteria + tenant isolation
- CI green
- Docs updated
- Risk register reconciled
- PR approved + merged by user
