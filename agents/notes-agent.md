# notes-agent

## Role

Build notes CRUD, tagging, visibility model, append-only versioning, version diffs. Frontend list/editor surfaces.

## Branch / worktree

- Branch: `feat/notes-versioning`
- Worktree: `../contrario-notes-worktrees/feat-notes-versioning`
- Rebases onto `feat/foundation-architecture` (and `feat/auth` once merged) before opening PR.

## Scope

- `features/notes/` — pages, components, hooks, server actions
- `services/notes-service.ts`
- `repositories/notes-repository.ts`, `repositories/note-versions-repository.ts`, `repositories/tags-repository.ts`
- `permissions/note-permissions.ts`
- `db/` — schema additions only via coordination with foundation owner; if foundation has merged with placeholders, may extend with PR review

## Visibility model

Three tiers (encoded in `notes.visibility`):

- `private` — only the author can read/write.
- `org` — any member of the org can read; `member`/`admin` can write per role rules.
- `shared` — explicit user-level grants via `note_shares(note_id, user_id, can_edit)`.

Visibility checks are SQL-level (per ADR-0004). The same predicate composition is reused by search.

## Versioning

- `note_versions` is append-only. Every create/update inserts a new row; the `notes` row points to the latest.
- No deletes from `note_versions` (except hard-delete cascade when the parent note is deleted).
- Diff computed server-side between any two versions; client renders.

## Forbidden

- Soft-deletes that bypass visibility (a "deleted" note must still be invisible to non-owners).
- Editing `TENANCY_INVARIANTS.md` or shared contracts.
- Direct `db.` imports in feature/UI code.
- Cross-feature edits without orchestrator approval (e.g., touching search or AI code).

## Required reading

- `TENANCY_INVARIANTS.md`
- `DESIGN_INVARIANTS.md`
- ADR-0001, ADR-0002

## Acceptance criteria

1. CRUD via server actions; org-scoped; permission-checked.
2. Tagging UI + server logic; tags scoped to org.
3. Visibility model implemented per spec; exhaustive permission tests across roles × visibility tiers × ownership.
4. Versions written on every create/update; diff endpoint returns structured diff between two version ids.
5. Notes list UI: empty/loading/error states, mobile responsive, keyboard reachable.
6. Note editor UI: shadcn primitives, focus management, autosave-to-version semantics clearly UX'd.
7. Version history UI: list of versions, diff view between selected pair.
8. Tenant-isolation tests: cross-org read returns 404; user without `shared` grant cannot read a `shared` note; `viewer` cannot mutate.

## TDD expectations

Strict TDD: services, repositories, permissions, diff logic.

## Documentation updates

- `NOTES.md` — visibility decisions, autosave UX choices.
- `TODO.md` — tick N-01..N-05.
- `docs/API_REFERENCE.md` — notes endpoints + server actions.
- `docs/SCHEMAS.md` — additions/edits.

## Risk labels

- `medium-risk` for general CRUD; `high-risk` + `security-sensitive` for visibility model and version permissions.
