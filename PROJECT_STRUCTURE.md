# PROJECT_STRUCTURE.md

Domain-oriented layout. Optimized for multi-agent collaboration, tenant safety, reviewability.

## Layout

```text
.
├── app/                  # Next.js App Router. Routes only. Thin handlers.
├── components/           # Shared, presentation-focused UI. No data fetching.
├── features/             # Domain feature modules (notes, search, files, ai).
│   └── <feature>/
│       ├── components/   # Feature-scoped UI
│       ├── hooks/        # Feature-scoped client hooks
│       └── server/       # Feature server actions / route handlers
├── services/             # Business orchestration. Compose repositories.
├── repositories/         # ONLY layer with raw db access. Org-scoped.
├── permissions/          # Centralized access checks. Single source of truth.
├── lib/                  # Cross-cutting utilities (errors, types, fetchers).
├── db/                   # Drizzle schema, client, migrations.
├── hooks/                # Cross-feature client hooks.
├── styles/               # Tailwind globals.
├── types/                # Shared TS types and zod schemas.
├── logging/              # Centralized logger + event taxonomy.
├── prompts/              # AI prompt templates.
├── tests/                # Integration + tenant-isolation suites.
├── scripts/              # One-off ops scripts (seed, migrate-data).
├── docs/                 # Living documentation.
├── agents/               # Agent specifications (one .md per agent).
├── decisions/            # ADRs (ADR-NNNN-title.md).
├── public/
└── <root governance docs>
```

## Dependency flow

```text
UI (app/, components/, features/components/)
↓
Features (features/<x>/server/, hooks/)
↓
Services (services/)
↓
Repositories (repositories/)
↓
Database (db/)
```

Forbidden cross-cuts:

- `app/` → `db/` direct import → ❌
- `components/` → `services/` (data fetch from presentation) → ❌
- `services/` → `db/` direct (must go via `repositories/`) → ❌
- `features/<a>/` → `features/<b>/` (cross-feature coupling) → ❌; share via `services/` or `lib/`.

## Module rules

| Layer | May import | May NOT import |
|---|---|---|
| `app/` | `features/`, `components/`, `lib/`, `permissions/` | `db/`, `repositories/` |
| `components/` | `lib/`, shadcn | `services/`, `repositories/`, `db/` |
| `features/` | `services/`, `permissions/`, `components/`, `lib/` | `db/`, `repositories/` |
| `services/` | `repositories/`, `permissions/`, `logging/`, `lib/` | `db/` directly, `app/`, `components/` |
| `repositories/` | `db/`, `lib/` | `services/`, `permissions/`, `app/` |
| `permissions/` | `lib/`, `types/` | `db/`, `repositories/`, `services/` |
| `db/` | `drizzle-orm`, `lib/` | everything else |

## Naming

- Files: kebab-case. Components: `PascalCase.tsx` (the export, not the file — file kebab).
- Repositories: `<entity>-repository.ts`, export `create<Entity>Repository(ctx)`.
- Services: `<entity>-service.ts`, export `create<Entity>Service(ctx, repos)`.
- Permissions: `can-<action>-<entity>.ts` or grouped `<entity>-permissions.ts`.

## Scoped services factory

`services/index.ts`:

```ts
export function createScopedServices(ctx: RequestContext) {
  const repos = createRepositories(ctx)
  return {
    notes: createNotesService(ctx, repos),
    search: createSearchService(ctx, repos),
    files: createFilesService(ctx, repos),
    ai: createAiService(ctx, repos),
    orgs: createOrgsService(ctx, repos),
  }
}
```

Every server entry point builds `ctx`, calls `createScopedServices`, uses returned façade.
