# ADR-0008 — Tenant-isolation tests run against in-process Postgres (pglite)

- Status: accepted
- Date: 2026-05-07

## Context

The tenant-isolation harness is the single most load-bearing test in the
repo. It must catch any regression where a query's `WHERE` clause forgets
the org filter, or a repository accepts a foreign-`orgId` payload. Mocking
the database here defeats the point — the bug class lives in real SQL
semantics (predicate composition, index usage, soft-delete behavior).

Options:

1. Mock Drizzle. Cheap, but the test passes even when the SQL is wrong.
   Rejected — it tests the assertion, not the system.
2. Spin up a Postgres container per test run (testcontainers). Faithful,
   but slow CI cold-start, requires Docker in CI, and creates platform
   variance for local dev.
3. `@electric-sql/pglite` — Postgres compiled to WASM, runs in-process.
   Real SQL semantics. ~1s bootstrap.

## Decision

Use pglite for tenant-isolation tests. The harness in
`tests/helpers/pglite-db.ts` reads the same migration SQL files Drizzle
generates for production, applies them to a fresh pglite instance, and
hands a Drizzle handle back to the test. The repositories are then
constructed with that handle via `createRepositories(ctx, db)` —
exercising the production code path verbatim.

## Consequences

Pros:

- Real Postgres parser + planner. Predicate composition behaves like prod.
- Zero external dependencies in CI (no Docker daemon required).
- Fast: ~5-6s for the current 7-test suite cold; subsequent tests share
  bootstrap if grouped.
- Same migrations as production are validated by being applied here.

Cons:

- pglite lags upstream Postgres on some extensions (e.g. `pg_trgm`,
  `vector`). Acceptable: we don't depend on those for tenant isolation.
- WASM cold-start adds latency. Tolerable at current scale.

## Alternatives considered

- **testcontainers**: revisit if we need extensions pglite doesn't ship.
  Until then the simplicity wins.
- **Stub Drizzle**: explicitly rejected; tests would lose meaning.

## Enforcement

- `tests/tenant-isolation.test.ts` is required to pass in CI.
- Adding a new repository or a new tenant-owned table requires extending
  this test file with cross-org assertions for the new surface.
