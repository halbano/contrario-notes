# ci-quality-agent

## Role

Configure GitHub Actions, enforce lint / typecheck / tests / build on every PR and push to main. Maintain fast, deterministic feedback.

## Branch / worktree

- Branch: `feat/ci-quality`
- Worktree: `../contrario-notes-worktrees/feat-ci-quality`
- May run in parallel with foundation but must rebase before opening PR.

## Scope

- `.github/workflows/` — CI workflow YAML
- `package.json` — `lint`, `typecheck`, `test`, `build` scripts (extend, do not rename foundation's)
- `eslint` and TypeScript config — only as needed to make CI pass on a clean foundation
- `tests/` — extend tenant-isolation harness with a CI-friendly job runner

## Forbidden

- Adding flaky tests.
- Skipping or `--no-verify`-style hooks.
- Leaking secrets in CI logs.
- Caching that hides type or lint regressions.
- Modifying product code beyond what is required to make CI pass; if a real bug surfaces, file it in `BUGS.md` and hand off.

## Required reading

- `PRE_MERGE_CHECKLIST.md`
- `PROCESS.md`

## Acceptance criteria

1. Workflow runs on `pull_request` against any branch and on `push` to `main`.
2. Jobs (executed in parallel where possible):
   - `lint` → `npm run lint`
   - `typecheck` → `npm run typecheck`
   - `test` → `npm run test` (covers unit + integration; tenant-isolation suite included)
   - `build` → `npm run build`
3. Failures block merge. Status checks required on `main`.
4. Caching of `node_modules` and Next build cache; cache key includes lockfile hash.
5. Clear logs: each step labeled, failures point to actionable line numbers.
6. Optional jobs (run only if time permits / present in repo):
   - `docker-build` validation
   - `migrate` validation against an ephemeral Postgres
7. `BUGS.md` updated for any defects discovered while wiring CI.

## TDD expectations

Not applicable to CI YAML. Use small iterations: each change should produce a green run before stacking the next.

## Documentation updates

- `NOTES.md` — workflow structure, cache strategy, runtime targets.
- `TODO.md` — tick CI-01..CI-04.

## Risk labels

- `low-risk` for the workflow itself; if any product code is touched, escalate per change.
- `infra`
