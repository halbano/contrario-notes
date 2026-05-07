# ADR-0003 — Stack choice

- Status: accepted
- Date: 2026-05-07

## Context

Stack imposed by orchestrator brief: TypeScript, Next.js (latest stable), Supabase, Drizzle, shadcn/ui, TailwindCSS. Deployment to Docker + Railway.

Document the rationale and the binding versions / patterns we will use.

## Decision

| Concern | Choice |
|---|---|
| Language | TypeScript (strict) |
| Framework | Next.js latest stable, App Router only |
| Auth | Supabase Auth |
| Database | Postgres (Supabase-managed) |
| ORM | Drizzle ORM + drizzle-kit migrations |
| UI primitives | shadcn/ui |
| Styling | Tailwind CSS |
| Storage | Supabase Storage |
| Deployment | Docker image → Railway |
| Test runner | Vitest (unit + integration) + Playwright (critical E2E only) |
| Logging | Centralized logger in `logging/` (pino-style structured JSON) |

Conventions:

- App Router exclusively. No `pages/` directory.
- Server Components by default. Client Components opt-in.
- Server Actions for mutations.
- `tsconfig` strict + `noUncheckedIndexedAccess`.
- ESLint with `@typescript-eslint`, `eslint-plugin-import` for layering.
- Prettier for formatting. Format-on-save expected.

## Consequences

Pros:

- Stack is opinionated and well-trodden. Low yak-shaving cost.
- Drizzle gives us SQL-shaped types and migrations we can read.
- shadcn keeps UI consistent without lock-in (we own the component code).
- Supabase covers auth + storage + Postgres in one hop.

Cons:

- Drizzle is younger than Prisma; tooling occasionally rough. Mitigation: pin versions, monitor releases.
- Server Actions have evolving semantics. Mitigation: keep mutations behind a thin service layer so swap-out is local.

## Alternatives considered

- **Prisma**: better tooling but heavier client; SQL feels further away. Drizzle wins for reviewability.
- **Clerk** for auth: nice DX but adds a vendor; Supabase already in stack.
- **Pages Router**: legacy. Rejected.

## Binding decisions

- No additional UI kits. shadcn primitives only.
- No additional ORMs. Drizzle only.
- No additional auth providers. Supabase only.
- Adding any new top-level dependency requires an ADR or PR justification.
