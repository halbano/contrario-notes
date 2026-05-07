# auth-agent

## Role

Wire Supabase Auth, organization creation/switching, memberships, role enforcement.

## Branch / worktree

- Branch: `feat/auth`
- Worktree: `../contrario-notes-worktrees/feat-auth`
- Rebases onto `feat/foundation-architecture` after foundation merges.

## Scope

- `features/auth/server/` — sign-in, sign-up, sign-out, session bootstrapping
- `features/orgs/server/` — create org, list memberships, switch active org
- `features/auth/components/` — wire frontend forms to server actions (forms themselves come from frontend-builder-agent)
- `services/orgs-service.ts`
- `repositories/orgs-repository.ts`, `repositories/memberships-repository.ts`
- `permissions/role-matrix.ts` (extend, not redefine, what foundation seeded)
- `logging/` — auth event emitters

## Forbidden

- Building a custom auth provider. Use Supabase Auth.
- Storing client-supplied `org_id` directly into `RequestContext`. Always validate against memberships.
- Editing `TENANCY_INVARIANTS.md` or the `RequestContext` type without an ADR.
- Touching `db/` schema directly; if a migration is needed, propose to foundation owner.

## Required reading

- `TENANCY_INVARIANTS.md`
- `PROJECT_STRUCTURE.md`
- ADR-0001, ADR-0002

## Acceptance criteria

1. Sign-up creates a Supabase user; on first sign-in the user lands on org create / accept invite flow.
2. Org create writes `organizations` row + creator's `memberships` row with role `admin`.
3. Active org is stored server-side (cookie or session) — never trusted from query/body.
4. Org switch endpoint validates the user has membership in the requested org before updating session. Failure returns 404.
5. `buildRequestContext` (in `lib/`) consults the active-org cookie + memberships table; rejects if no matching membership.
6. Role enforcement: `admin` can manage memberships; `member` can create notes; `viewer` is read-only. Encoded in `permissions/`.
7. Auth events logged: sign-in success/failure, sign-out, org switch, membership change, denied access attempts. PII restricted to user id + org id.
8. Org switching invalidates any in-flight cached `RequestContext` (per NOTES.md MEDIUM risk).
9. Tenant-isolation tests: cross-org membership lookup, switch attempt to a non-member org (must 404), creating an org does not grant access to any other org.

## TDD expectations

Strict TDD: `services/orgs-service.ts`, `repositories/orgs-repository.ts`, `repositories/memberships-repository.ts`, `lib/build-request-context.ts` extensions.

## Documentation updates

- `NOTES.md` — auth flow, org-switch invalidation strategy.
- `TODO.md` — tick A-01..A-05.
- `docs/API_REFERENCE.md` — auth + orgs endpoints.

## Hand-off output

- Diagram or paragraph: sign-up → org create → sign-in → ctx → resource read.
- Tenant-isolation test count.
- Confirmation that role matrix matches `permissions/`.

## Risk labels

- `high-risk`
- `security-sensitive`
- `requires-deep-review`
