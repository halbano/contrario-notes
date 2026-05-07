# ADR-0005 — File storage and signed URL access

- Status: accepted
- Date: 2026-05-07

## Context

Users upload files and attach them to notes. Files inherit visibility from the parent note (or org default if note-less). Direct bucket access must be impossible; URLs must be short-lived and re-validated per request.

## Decision

Use Supabase Storage with private buckets. Object paths embed scope: `org/<org_id>/note/<note_id>/<file_id>-<filename>` (or `org/<org_id>/standalone/<file_id>-<filename>`).

Two strict rules:

1. **Path is not a credential.** Knowing the path grants no access. All reads go through a server endpoint that:
   - Authenticates the user.
   - Loads `RequestContext`.
   - Loads the file record from `files` repository (org-scoped).
   - Calls `permissions.canReadFile(ctx, file)` (which itself checks the parent note visibility).
   - Only on success, mints a signed URL with TTL ≤ 5 minutes via Supabase Storage admin client.

2. **Signed URLs are not cached.** Each request mints a fresh URL. No long-lived links shared in clients, emails, or AI prompts.

Uploads:

- Server-side validation: size cap, MIME allowlist, virus-scan hook (deferred; placeholder).
- Files row written before storage write; rollback on storage failure.
- File ↔ note linkage validated server-side (note must exist in caller's org and be writeable by caller).

## Consequences

Pros:

- Permission check runs every read. Path enumeration yields nothing.
- TTL ≤ 5 min limits damage if a URL leaks.
- Supabase Storage handles the heavy lifting.

Cons:

- Every read costs a DB lookup + permission check + signed URL mint. Acceptable; cache the file record per request if needed.
- No CDN edge caching of authenticated content. Correct tradeoff for permissioned files.

## Alternatives considered

- **Public buckets with hard-to-guess paths**: classic mistake. Rejected.
- **Long-lived signed URLs**: leaks become long-lived breaches. Rejected.
- **Direct client → Storage with RLS**: feasible but doubles the permission surface. Centralizing on the server is more reviewable.

## Enforcement

- `TENANCY_INVARIANTS.md` invariant 5.
- `PRE_MERGE_CHECKLIST.md` file section.
- Tenant-isolation tests must include file read attempts across orgs and across visibility tiers.
