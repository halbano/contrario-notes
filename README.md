# contrario-notes

Multi-tenant team notes app. Built as an AI-assisted engineering exercise: branch-per-agent worktrees, strict tenant isolation, defense-in-depth permissions, review-discipline-first.

## Stack

Next.js 15 (App Router) · TypeScript strict · Drizzle ORM · Supabase (Auth + Postgres + Storage) · TailwindCSS · shadcn/ui · Vitest · Playwright · Docker · Railway.

## Quickstart

```bash
git clone git@github.com:halbano/contrario-notes.git
cd contrario-notes
npm install
cp .env.example .env.local        # fill Supabase keys + DB URLs
npm run db:migrate                # applies drizzle/*.sql to your DB
npm run dev                       # http://localhost:3000
```

Test:

```bash
npm run lint
npm run typecheck
npm run test                      # includes pglite tenant-isolation harness
npm run build
```

## Architecture in one diagram

```text
UI / Routes                      app/, components/
       ↓
Features                         features/<domain>/
       ↓
Services        (createScopedServices(ctx) façade)
       ↓
Repositories    (only layer with `db` import; auto-applies eq(orgId, ctx.orgId))
       ↓
Postgres        (RLS as defense-in-depth — see decisions/ADR-0001)
```

`RequestContext = { userId, orgId, role }` is built once per request and threaded through. Client-supplied `org_id` is never trusted. Visibility predicates run inside SQL `WHERE`, never as app-tier post-filters.

## Status

| Phase | State |
|---|---|
| 0 — Governance, ADRs, agent specs | ✅ |
| 1 — Foundation (schema, repos, services, permissions, logger, CI, Docker) | ✅ |
| 2 — Frontend shell (auth UI, app layout, design tokens, screenshot harness) | ✅ |
| 3 — Auth + orgs + RLS | ✅ |
| 4 — Notes (visibility predicate + note_shares) — Phase 1 | ✅ |
| 4 — Notes (CRUD UI + versioning + tagging + share CRUD) — Phase 2 | in flight |
| 5 — Search + AI | pending |
| 6 — Files + audit logging | pending |
| 7 — Seed data | pending |

## Governance

Read before contributing. All non-negotiable.

- [TENANCY_INVARIANTS.md](./TENANCY_INVARIANTS.md) — 8 rules, violation blocks merge
- [DESIGN_INVARIANTS.md](./DESIGN_INVARIANTS.md) — 14 UI rules
- [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) — layer rules, dependency flow
- [PROCESS.md](./PROCESS.md) — branch / agent / PR workflow
- [PRE_MERGE_CHECKLIST.md](./PRE_MERGE_CHECKLIST.md) — every PR must satisfy
- [ARCHITECTURAL_DECISIONS.md](./ARCHITECTURAL_DECISIONS.md) — ADR index
- [agents/](./agents/) — per-agent specs
- [docs/](./docs/) — schemas, data flow, design notes

## Living documents

- [NOTES.md](./NOTES.md) — operational journal: decisions, risks, lessons
- [TODO.md](./TODO.md) — backlog with priority + risk + owner
- [BUGS.md](./BUGS.md) · [REVIEW.md](./REVIEW.md) · [AI_USAGE.md](./AI_USAGE.md)

## License

Private project. No license granted.
