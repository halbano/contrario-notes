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

## Review loop on PRs (humans + Copilot + orchestrator)

PR review combines three voices:

1. **GitHub Copilot review** runs automatically on every PR open / push. Surfaces nits, possible improvements, and the occasional real defect. Output is an inline review with comments threaded on file:line.
2. **The user (owner of the flow)** reviews PRs in GitHub directly. Marks blockers, approves, or leaves inline questions. Acts as the final merge authority.
3. **The orchestrator (this assistant)** reads the comments via `gh api repos/<owner>/<repo>/issues/<n>/comments` + `pulls/<n>/comments`, triages, fixes in-PR or opens follow-up issues, then replies on the thread.

### Reply convention

All comments posted via `gh` from the orchestrator are prefixed with `Claude Response: ` so reviewers can distinguish AI-authored replies from the user's own comments (the `gh` token is the user's, so author shows as `halbano` regardless). This is a durable rule — see the user-feedback memory.

### Triage shape

When a review lands, the orchestrator categorizes each item:

- **Fix in this PR** — small, scoped, no scope creep. Land as a follow-up commit on the same branch.
- **Open issue / follow-up TODO** — material additional scope (e.g., schema change). Open a GitHub issue with full context + acceptance criteria; reference in the reply.
- **No action** — unsupported by the spec, or a process artifact already documented elsewhere. Reply explaining why.

### Reply format

The reply summarizes outcomes in a small table: `# | Item | Status` so reviewers can confirm coverage at a glance. Cite commit hashes for in-PR fixes; cite issue numbers for deferred items.

### Conflict resolution

When `main` advances during review, the orchestrator resolves conflicts on the feature branch and pushes. For complementary changes (e.g., audit-log writes from one PR + JWT-sync calls from another both touching the same service method), keep BOTH; document the ordering choice in the merge-commit message. Never silently drop one side of a conflict.
