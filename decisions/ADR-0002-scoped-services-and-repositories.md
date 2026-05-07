# ADR-0002 — Scoped services + repositories pattern

- Status: accepted
- Date: 2026-05-07

## Context

Tenancy invariants demand every data path carry `orgId`. Naïve approach (passing `orgId` everywhere manually) is error-prone — one missing clause leaks data. Need a structural pattern that makes the unsafe shape syntactically inconvenient and the safe shape default.

## Decision

Two-layer access pattern, factory-built per request:

1. **Repositories** (`repositories/`): only layer with `db` import. Constructed via `createRepositories(ctx)`. Every query method internally applies `eq(table.orgId, ctx.orgId)` — caller cannot omit it.

2. **Services** (`services/`): orchestration + business rules. Compose repositories + permissions. Constructed via `createScopedServices(ctx)` returning a façade.

Server entry points (route handlers, server actions) do:

```ts
const ctx = await buildRequestContext(req)
const services = createScopedServices(ctx)
return services.notes.findVisible({ query })
```

Features and UI components do not import `db`, do not import repositories directly, and do not construct services. They consume the façade.

`RequestContext` shape:

```ts
type RequestContext = {
  userId: string
  orgId: string
  role: 'admin' | 'member' | 'viewer'
}
```

Built once per request from session + active membership. Immutable. No globals.

## Consequences

Pros:

- Org scoping is structurally enforced — repo methods cannot be called without ctx.
- Single grep target for audits: search for `db.` outside `repositories/` flags violations.
- Permissions live in one module, called from services. No duplication.
- Testing is straightforward: stub repos, exercise services with synthetic ctx.

Cons:

- Boilerplate per entity (repo + service + types). Acceptable; predictability beats cleverness.
- Resists ad-hoc one-off queries. By design.

## Alternatives considered

- **AsyncLocalStorage for ctx**: hides scoping, makes audits harder. Rejected.
- **ORM middleware injecting `org_id`**: Drizzle does not support cleanly; opaque magic. Rejected.
- **Postgres RLS as primary control**: too easy to bypass with service role keys; we keep RLS as defense-in-depth, not primary. Aligned with ADR-0001.

## Enforcement

- `PROJECT_STRUCTURE.md` dependency rules.
- `PRE_MERGE_CHECKLIST.md` checks for `db.` imports outside `repositories/`.
- Lint rule (planned in CI agent): forbid `import { db }` outside `repositories/**` and `db/**`.
