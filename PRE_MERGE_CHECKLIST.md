# PRE_MERGE_CHECKLIST.md

Every PR must satisfy this list. Reviewer ticks each box. Unchecked = block.

## Tenancy

- [ ] No new `db.` import outside `repositories/**`
- [ ] Every new query scoped by `orgId`
- [ ] No client-supplied `orgId` trusted
- [ ] Visibility filter applied in SQL, not app code
- [ ] Cross-org test added if new read/write surface
- [ ] AI/file paths re-verified for context leakage

## Permissions

- [ ] Permission check at server entry point (route handler / server action)
- [ ] Permission logic lives in `permissions/`, not duplicated
- [ ] Denied access returns 404 (not 403) for non-existence-disclosing surfaces
- [ ] Role enforcement matches role matrix

## UI/UX (if PR touches UI)

- [ ] Loading state present
- [ ] Error state present
- [ ] Empty state present (where applicable)
- [ ] Mobile (375px) verified
- [ ] Keyboard reachable end-to-end
- [ ] Focus visible
- [ ] No color-only status
- [ ] Uses shadcn primitive when applicable

## Logging

- [ ] Auth events logged
- [ ] Permission denials logged
- [ ] Mutations logged (note CRUD, file upload, org switch)
- [ ] AI requests logged (prompt hash, user, org, note ids referenced)
- [ ] Failures logged with context (no secrets)

## Tests

- [ ] Unit tests cover new logic (TDD: tests written first for domain code)
- [ ] Integration test covers happy path
- [ ] Tenant-isolation test added/extended (high-risk PRs)
- [ ] All tests pass locally
- [ ] CI green

## Build / quality

- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes
- [ ] `npm run build` passes
- [ ] No new lint suppressions without justification comment

## Documentation

- [ ] NOTES.md updated (decisions, risks discovered)
- [ ] TODO.md updated (completed items checked)
- [ ] AI_USAGE.md updated if AI was used to author this PR
- [ ] BUGS.md updated if bug discovered
- [ ] ADR added if architectural shift
- [ ] API_REFERENCE.md updated if API surface changed
- [ ] DATA_FLOW.md / SCHEMAS.md updated if schema/flow changed

## Risk classification

PR must declare one or more labels:

- `low-risk` | `medium-risk` | `high-risk`
- `security-sensitive` (always for: auth, search, AI, files, visibility, org switching)
- `requires-deep-review`
- `frontend-only`
- `infra`

High-risk + security-sensitive PRs require:

- Two reviewers
- Explicit tenancy verification step
- Edge-case test list in PR body
