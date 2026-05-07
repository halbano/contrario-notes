# ARCHITECTURAL_DECISIONS.md

Index of ADRs. One file per decision in `/decisions`.

## Format

`decisions/ADR-NNNN-kebab-title.md`

Each ADR contains:

- Status: proposed | accepted | superseded-by ADR-XXXX
- Date
- Context
- Decision
- Consequences
- Alternatives considered

## Index

| ID | Title | Status | Date |
|---|---|---|---|
| ADR-0001 | Shared-schema multi-tenancy | accepted | 2026-05-07 |
| ADR-0002 | Scoped services + repositories pattern | accepted | 2026-05-07 |
| ADR-0003 | Stack: Next.js + Drizzle + Supabase + shadcn | accepted | 2026-05-07 |
| ADR-0004 | Search via Postgres FTS (tsvector) | accepted | 2026-05-07 |
| ADR-0005 | File storage in Supabase Storage with signed URLs | accepted | 2026-05-07 |
| ADR-0006 | AI context restricted to user-visible notes | accepted | 2026-05-07 |
| ADR-0007 | Worktree + branch-per-agent execution model | accepted | 2026-05-07 |

## Update rules

- New ADR: append row, create file, link in NOTES.md.
- Superseding: mark old as `superseded-by ADR-NNNN`, do not delete.
- Material change to architecture without ADR → block PR.
