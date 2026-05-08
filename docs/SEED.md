# Seed pipeline

Generates a deterministic, multi-tenant dataset that exercises the same
scoped services real users hit. Lives under `scripts/seed/`.

## Quick start

```bash
# Safe: in-process WASM Postgres, no env required.
SEED_TARGET=pglite npm run seed

# Local Postgres (requires DATABASE_URL=postgres://...@localhost:...).
npm run seed

# Full 10k-note profile, local DB.
SEED_PROFILE=full npm run seed

# Truncate every seed-managed table and re-seed.
npm run seed:reset

# Cloud Supabase. REQUIRES the override flag.
npm run seed -- --i-know-this-is-cloud
```

## Profiles

| profile | notes  | users | orgs | use case                        |
| ------- | ------ | ----- | ---- | ------------------------------- |
| `small` | 100    | 30    | 5    | default; CI, smoke, pglite      |
| `full`  | 10,000 | 30    | 5    | scale validation per ADR-0007   |

Notes per org are skewed `3:3:1:1:1` so the first two orgs hold ~60% of
content. Visibility per org: ~70% `org`, ~20% `private`, ~10% `shared`.
Version histories: 1–5 per note, geometrically skewed (≈70% have exactly 1).

## Determinism

A single Mulberry32 RNG seeded by `SEED_RNG` (default `42`) drives every
choice. Re-running with the same seed against an empty database produces
identical rows.

## Cloud safety

`scripts/seed/lib/cloud-guard.ts` rejects any `DATABASE_URL` whose host is
not `localhost` / `127.0.0.1` / `::1` / `0.0.0.0`. Override with
`--i-know-this-is-cloud`. The guard runs before any write, including
`seed:reset`.

## Reset order

`reset.ts` truncates in this order (children first):

```
audit_log → files → note_shares → note_tags → tags →
  note_versions → notes → memberships → users → organizations
```

`auth.users` is NOT touched — wipe it from the Supabase dashboard if you
need a clean auth slate.

## Data shape

- **Orgs**: 5 fixed studios (`studio-aurora`, `foundry-collective`,
  `paper-prairie`, `helix-and-co`, `kindling-studio`).
- **Users**: 30 per run. ~5 belong to two orgs; rest belong to one.
- **Memberships**: weighted role distribution (~10% admin, ~70% member,
  ~20% viewer). Every org is guaranteed at least one admin.
- **Tags**: shared core vocabulary across all orgs (`roadmap`, `meeting`,
  `spec`, `bug`, `idea`, `launch`, `retro`, `design`, `qa`, `planning`)
  plus 2 org-specific flavor tags. Overlaps are deliberate so future
  search-leak tests are non-trivial.
- **Notes**: titles overlap across orgs (`Q3 roadmap — draft` etc.) with
  ~25% carrying their org slug to keep some uniqueness.
- **Versions**: every note has 1–5; geometric skew low.
- **Shares**: only `visibility=shared` notes get rows. 1–3 grantees each;
  ~40% of grants carry `can_edit=true`. Targets are always co-org members
  — the service rejects cross-org grants by design (`invalid_input`).
- **Files**: ~15% of notes get 1–2 rows. 1KB synthetic placeholder bytes,
  allowlisted MIME (`image/png`, `image/jpeg`, `application/pdf`,
  `text/plain`). `storage_path` is a synthetic key — no Storage bucket
  write is performed.

## Performance

| step                    | small (100 notes) | full (10k notes) — projected |
| ----------------------- | ----------------- | ----------------------------- |
| pglite end-to-end       | ~3-6 s            | ~5-7 min                      |
| local Postgres          | ~5-8 s            | ~2-3 min                      |

Notes are written through `NotesService.createWithVersion` and (when
applicable) `updateWithVersion` so the version row is appended in the
same transaction the note row is inserted in. Per-org concurrency = 8 on
postgres-js, 4 on pglite. Files and tag pivot rows are bulk-inserted —
no service-layer bug surface to exercise there.

## Service vs raw db

Generators that touch tenant-owned write paths (notes, versions, shares,
tags) go through scoped services. The exceptions are documented in each
generator's module-level comment:

- `orgs.ts`: bootstrap circularity — no ctx exists yet.
- `users.ts`: `public.users` mirrors Supabase `auth.users`; no service
  method exists.
- `memberships.ts`: same chicken/egg as `orgs.ts`.
- `files.ts`: bulk insert for performance; flat metadata table, no
  service codepath to exercise.

## Sanity tests

`tests/seed.test.ts` runs the small profile against pglite and asserts:

- 5 orgs, 30 users.
- Every note has `org_id`, `author_id`, ≥1 version row.
- Per-org note counts sum to `report.counts.notes`; top-2 orgs hold >50%.
- No `note_shares` row crosses org boundaries (share `org_id` matches
  note `org_id`, and grantee holds a membership row for that org).
- Tag vocabulary overlaps across orgs.
- `note_tags` rows match parent note's `org_id`.
- File rows match parent note's `org_id`; ~15% of notes have files.
- Visibility distribution roughly 70/20/10 (wide tolerance for n=100).
- `note_versions.org_id` always equals parent `notes.org_id`.
- Cloud-guard refuses non-local URLs without override.

## Env vars

| var                            | required               | notes                         |
| ------------------------------ | ---------------------- | ----------------------------- |
| `DATABASE_URL`                 | yes (postgres target)  | from `.env.local`             |
| `NEXT_PUBLIC_SUPABASE_URL`     | optional               | enables `auth.users` create  |
| `SUPABASE_SERVICE_ROLE_KEY`    | optional               | enables `auth.users` create  |
| `SEED_PROFILE`                 | optional               | `small` (default) or `full`  |
| `SEED_TARGET`                  | optional               | `postgres` (default) or `pglite` |
| `SEED_RNG`                     | optional               | integer; default `42`         |

When the Supabase admin env vars are absent, the seed still inserts
`public.users` rows (deterministic UUIDs) but the seeded users will not
be able to log in via the real Supabase auth flow.
