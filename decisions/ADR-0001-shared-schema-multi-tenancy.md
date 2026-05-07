# ADR-0001 — Shared-schema multi-tenancy

- Status: accepted
- Date: 2026-05-07

## Context

App must serve many organizations from one Postgres database. Options: schema-per-tenant, database-per-tenant, shared-schema with tenant column.

Constraints:

- Tenant count expected to be large (hundreds → thousands).
- Operational simplicity matters; we run on Supabase + Railway, no DBA.
- Cross-tenant analytics not required; cross-tenant data leak is the dominant risk.
- Search must be permission-safe at SQL level (rules out app-tier multiplexing).

## Decision

Shared-schema multi-tenancy with mandatory `org_id` column on every tenant-owned table. Tenant scoping enforced at the repository layer — every query includes `eq(table.orgId, ctx.orgId)`. Postgres RLS policies layered as defense-in-depth (not primary control).

Tables that hold tenant data must:

- Include `org_id uuid not null references organizations(id) on delete cascade`.
- Carry composite indexes leading with `org_id` for query plans.
- Be referenced only via repositories that accept `RequestContext`.

## Consequences

Pros:

- Single migration timeline. Single connection pool. Cheap to run.
- Search/FTS, joins, and analytics stay simple.
- RLS gives independent layer of protection.

Cons:

- Bug in `WHERE` clause = potential cross-tenant leak. Mitigation: forbid raw db outside repositories; tenant-isolation tests on every PR; eventual lint rule.
- Per-tenant restore is painful (must filter by `org_id`). Acceptable for product stage.
- Noisy-neighbor risk on shared FTS index. Acceptable at planned scale (~10k notes total in seed).

## Alternatives considered

- **Schema-per-tenant**: best logical isolation but Drizzle migration tooling and Supabase pooler complicate it. Operational cost high.
- **DB-per-tenant**: strongest isolation but conflicts with Supabase free/standard tiers and SaaS economics.

## Enforcement

- `TENANCY_INVARIANTS.md` invariants 1, 2, 8.
- Every new table added in PR must declare `org_id` (PR checklist item).
- Tenant-isolation tests assert cross-org reads/writes fail.
