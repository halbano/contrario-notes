# DATA_FLOW.md

Last Updated: 2026-05-07

## Request flow

```
   Client (browser)
        │
        ▼
┌─────────────────────────────────────────┐
│ app/  — Route handlers / server actions │
│   1. Authenticate (Supabase server)     │
│   2. const ctx = buildRequestContext()  │  ← lib/build-request-context.ts
│   3. const services =                   │
│        createScopedServices(ctx)        │  ← services/index.ts
│   4. await services.<entity>.<action>() │
└─────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────┐
│ services/  — orchestration              │
│   - Calls permissions.* helpers         │  ← permissions/
│   - Logs events via logger              │  ← logging/
│   - Throws AppError on denial / 404     │  ← lib/errors.ts
└─────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────┐
│ repositories/  — only db caller         │
│   - scopedWhere(ctx, table, …)          │  ← repositories/base-repository.ts
│   - withOrgId(ctx, payload)             │
└─────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────┐
│ db/  — drizzle schema + client          │
│   Postgres (Supabase)                   │
└─────────────────────────────────────────┘
```

## Sample read

User opens a note.

1. `app/(notes)/[id]/page.tsx` (owned by notes-agent, not built here)
   creates the Supabase server client, calls `buildRequestContext()`.
2. `buildRequestContext` resolves session → `userId`, looks up active
   membership → `{ orgId, role }`. Frozen ctx returned.
3. `createScopedServices(ctx)` returns `{ notes, orgs }`.
4. `services.notes.findById(id)` → `repos.notes.findById(id)`:
   `db.select().from(notes).where(scopedWhere(ctx, notes, eq(notes.id, id), isNull(deletedAt)))`.
5. Service applies `canReadNote(ctx, note)` — null on miss or denial.
6. Page renders. If null → 404.

## Sample write

User creates a note (server action).

1. Action receives `FormData`. NEVER reads `orgId` from form.
2. Builds `ctx`, builds services.
3. Calls `services.notes.create({ title, content, visibility, authorId: ctx.userId })`.
4. Service: `canCreateNote(ctx)` → `repos.notes.create(input)`.
5. Repo applies `withOrgId(ctx, input)` — rejects any caller-supplied `orgId`.
6. Drizzle insert. Logger emits `note.created`.

## Tenancy chokepoint

The `repositories/` module is the ONLY layer that imports `db/`. Every
table access funnels through `scopedWhere` / `withOrgId`. A grep for
`from '@/db'` outside `repositories/` and `db/` should match nothing —
the ESLint `no-restricted-imports` rule enforces this.
