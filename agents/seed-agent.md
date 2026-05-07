# seed-agent

## Role

Generate realistic seed data to validate scale, tenant isolation, search correctness.

## Branch / worktree

- Branch: `feat/seed-data`
- Worktree: `../contrario-notes-worktrees/feat-seed-data`
- Operates after schema stabilizes (post foundation + notes merges).

## Scope

- `scripts/seed.ts` — top-level CLI entry
- `scripts/seed/` — generators per entity (orgs, users, memberships, notes, versions, tags, files)
- `tests/seed.test.ts` — sanity assertions on the seed output
- `package.json` — `seed`, `seed:reset` scripts

## Forbidden

- Bypassing services / repositories. Seed must use the same scoped services real users use, so any access bug it would mask is also a bug under real traffic.
- Hard-coding production-shaped secrets.
- Running against any non-local database without explicit confirmation.

## Required reading

- ADR-0001
- `TENANCY_INVARIANTS.md`
- `agents/notes-agent.md` (for visibility model)

## Acceptance criteria

1. Generates: 5 organizations, ~30 users, mixed roles (admin/member/viewer) per org with overlapping memberships, ~10,000 notes total spread across orgs.
2. Visibility mix per org: ~70% `org`, ~20% `private`, ~10% `shared` with explicit `note_shares` rows.
3. Overlapping tags and titles across orgs (deliberate near-duplicates) so search-leak tests are non-trivial.
4. Version histories: every note has 1–5 versions (skewed low).
5. ~10–20% of notes have one or more attached files (small synthetic blobs, allowlisted MIMEs).
6. Reproducible: deterministic seed (RNG seeded), `seed:reset` cleanly truncates and re-seeds.
7. Performance: seed runs in under 60 s on a developer laptop against local Postgres.
8. Sanity tests:
   - Cross-org note count matches expectations.
   - No `note_shares` row crosses org boundaries.
   - All notes have valid `org_id`, `author_id` (where applicable), and at least one version.

## TDD expectations

Sanity tests in `tests/seed.test.ts` written alongside generators. Strict TDD not required for pure data generation, but use clear, testable functions.

## Documentation updates

- `NOTES.md` — seed parameters and how to reproduce.
- `TODO.md` — tick SD-01..SD-03.
- `docs/SEED.md` (create) — how to run, what's generated, expected counts.

## Risk labels

- `low-risk`
- `infra`
