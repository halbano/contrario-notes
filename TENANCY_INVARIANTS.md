# TENANCY_INVARIANTS.md

Non-negotiable rules. Violation blocks merge.

## Invariants

1. Every data access is organization-scoped. No exceptions.
2. `org_id` ownership is server-controlled. Derived from `RequestContext`, never request body/query/header.
3. Client-provided `org_id` is untrusted input. Must be validated against the user's memberships before use.
4. Search must enforce permissions and visibility at query level (`WHERE` clauses), not post-filtered in app code.
5. File access requires permission validation before signed URL generation. URLs must be short-lived.
6. AI endpoints may only read note content the requesting user can already access. Never bulk-load org notes for context.
7. Visibility rules apply uniformly across pages, APIs, search, uploads, AI features. No surface bypasses them.
8. Raw unscoped DB access is forbidden outside `repositories/`. UI/Features/Services must not import `db` directly.

## Enforcement

- Every repository accepts `RequestContext` as first arg.
- Every query includes `eq(table.orgId, ctx.orgId)` — no exceptions.
- Lint rule (eventual): forbid `db` import outside `repositories/**` and `db/**`.
- Tenant-isolation tests run on every PR. Cross-org access attempts must return 404, not 403 (avoid existence disclosure).

## RequestContext contract

```ts
type RequestContext = {
  userId: string
  orgId: string
  role: 'admin' | 'member' | 'viewer'
}
```

- Built once per request from session + active org membership.
- Immutable within request scope.
- Passed explicitly to scoped services. No globals, no AsyncLocalStorage shortcuts unless ADR approves.

## Forbidden patterns

```ts
// ❌ Raw db in feature/UI/service code
db.select().from(notes)

// ❌ Trusting client org_id
const { orgId } = req.body

// ❌ Post-filtering for visibility
const all = await repo.findAll()
return all.filter(n => canSee(user, n))

// ❌ AI context leak
const allNotes = await repo.findByOrg(orgId) // bypasses user visibility
```

## Required patterns

```ts
const ctx = await buildRequestContext(req)
const services = createScopedServices(ctx)
const visible = await services.notes.findVisible({ query })
```

## Hard-fail conditions

- Confirmed cross-tenant data leak → revert + post-mortem.
- AI prompt includes notes user cannot read → revert + audit AI logs.
- Signed URL grants access without permission check → revert + rotate keys.

## Review checklist (per PR)

- [ ] All new queries scoped by `orgId`
- [ ] No `db.` imports added outside `repositories/`
- [ ] No client-provided `orgId` trusted
- [ ] Visibility filter applied in SQL, not app code
- [ ] Tenant-isolation test added if new read/write surface
- [ ] AI/file endpoints re-checked for context leakage
