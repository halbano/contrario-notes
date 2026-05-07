# foundation-architecture-agent

## Role

Establish the correctness floor for the entire app. Everything else depends on this.

## Branch / worktree

- Branch: `feat/foundation-architecture`
- Worktree: `../contrario-notes-worktrees/feat-foundation-architecture`

## Scope

Files / dirs this agent owns:

- `package.json`, `tsconfig.json`, `next.config.*`, `tailwind.config.ts`, `postcss.config.*`, `.eslintrc.*`, `.prettierrc.*`, `.env.example`, `.gitignore`
- `db/` — Drizzle schema, client, migrations
- `repositories/` — base + entity repositories factory
- `services/` — `createScopedServices` factory + base wiring
- `permissions/` — role matrix, can-* helpers, RequestContext type
- `lib/` — RequestContext builder, auth helper, error types
- `logging/` — central logger + event taxonomy
- `tests/` — tenant-isolation harness
- `Dockerfile`, `railway.toml` (or equivalent)
- `app/` — minimal layout shell (no feature pages yet)
- `styles/globals.css`

## Forbidden

- Building feature pages (notes UI, search UI, AI UI, file UI). Belongs to other agents.
- Implementing business rules beyond what's required to validate the pattern (one minimal entity end-to-end is enough as proof).
- Editing `TENANCY_INVARIANTS.md`, `DESIGN_INVARIANTS.md`, `PROJECT_STRUCTURE.md` without orchestrator approval.

## Required reading (before starting)

- `TENANCY_INVARIANTS.md`
- `DESIGN_INVARIANTS.md`
- `PROJECT_STRUCTURE.md`
- `PROCESS.md`
- `PRE_MERGE_CHECKLIST.md`
- ADR-0001..0007

## Acceptance criteria

1. Next.js (latest stable) + TS strict + App Router scaffolded.
2. Tailwind + shadcn/ui initialized; theme tokens defined per `DESIGN_INVARIANTS.md`.
3. Drizzle schema with: `users`, `organizations`, `memberships`, `notes`, `note_versions`, `tags`, `note_tags`, `files`, `audit_log`. Every tenant-owned table has `org_id` (per ADR-0001).
4. Migrations generated and reproducible.
5. Supabase client(s): server, anon, admin variants. Env keys read from env vars only.
6. `RequestContext` builder implemented and unit-tested. Builds from session + active membership; rejects users with no membership.
7. `repositories/` exports `createRepositories(ctx)`. Base repository enforces `eq(table.orgId, ctx.orgId)`. Tenant-isolation tests prove cross-org reads return empty / writes fail.
8. `services/` exports `createScopedServices(ctx)`. Façade returns at least `notes`, `orgs`. Methods composed from repos + permissions.
9. `permissions/` exports the role matrix and `can*` helpers. Unit tests cover every role × action × visibility combination relevant to `notes`.
10. `logging/` exports a structured logger with the event taxonomy from `PROCESS.md`. Auth, mutations, denials, AI, failures.
11. Dockerfile builds a production image. Railway config present. `.env.example` documents all required env vars (no secret values).
12. Tenant-isolation test harness in `tests/` runs in CI; demonstrates with synthetic data that cross-org access fails.
13. App boots locally with `npm run dev`, root layout renders an empty shell with the theme applied.

## TDD expectations

Strict TDD for: `repositories/`, `services/`, `permissions/`, `lib/request-context.ts`, `logging/`. Pragmatic for: config files, layout shell, Docker.

## Documentation updates

- `NOTES.md` — record any deviations from ADRs or new risks discovered.
- `TODO.md` — tick F-01..F-12 as completed.
- `decisions/` — open a new ADR for any architectural decision not already covered (e.g., logger choice, test runner specifics if novel).
- `docs/SCHEMAS.md` — initial DB schema reference.
- `docs/DATA_FLOW.md` — UI → Features → Services → Repositories → DB diagram.

## Hand-off output

PR description must include:

- Confirmation that all 13 acceptance criteria are met (or list what is intentionally deferred and why).
- Diagram or paragraph showing how a sample request flows: client → route → buildRequestContext → createScopedServices → notes service → notes repo → DB.
- Tenant-isolation test count and what they assert.
- Open risks added to `NOTES.md`.

## Risk labels (default for this PR)

- `high-risk`
- `security-sensitive`
- `requires-deep-review`
- `infra`
