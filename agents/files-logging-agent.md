# files-logging-agent

## Role

File upload, association with notes, signed URL access with per-request permission validation. Centralized logging + audit trail.

## Branch / worktree

- Branch: `feat/files-logging`
- Worktree: `../contrario-notes-worktrees/feat-files-logging`
- Rebases onto `feat/foundation-architecture` (and `feat/notes-versioning` once merged).

## Scope

- `features/files/` — upload UI, attached-files UI on notes
- `services/files-service.ts`
- `repositories/files-repository.ts`, `repositories/audit-log-repository.ts`
- `permissions/file-permissions.ts`
- `logging/` — finalize event taxonomy from `PROCESS.md`; ensure auth, mutations, denials, AI, failures all flow through the central logger
- DB: `files` table (created in foundation; this agent extends as needed) + `audit_log` writers

## Forbidden

- Public buckets. Buckets must be private.
- Long-lived signed URLs (TTL > 5 min).
- Granting access by path knowledge alone — every read must re-validate via `permissions/`.
- Storing signed URLs in the DB, in caches, or in client state beyond a single use.
- Storing raw file bytes outside Supabase Storage.

## Required reading

- ADR-0005
- `TENANCY_INVARIANTS.md` (invariants 5, 7)

## Acceptance criteria

### Files

1. Upload flow: server validates size, MIME allowlist; writes `files` row before storage; rolls back on storage failure.
2. Object path: `org/<org_id>/note/<note_id>/<file_id>-<filename>` or `org/<org_id>/standalone/<file_id>-<filename>`.
3. Read flow: `GET /api/files/:id` → load file row (org-scoped) → permission check → mint signed URL with TTL ≤ 5 min → redirect/return.
4. File ↔ note association validated server-side; cannot attach a file to a note in another org or to a note caller cannot write.
5. UI: upload progress, error state, list of attachments per note, accessible.
6. Tenant-isolation tests:
   - User from org X cannot read file from org Y (404).
   - User from org X with `private` visibility cannot read attachments of another user's `private` note.
   - Path enumeration yields no signed URL.
   - Stale URL after TTL is rejected.

### Logging / audit

1. Central logger exports `log(event, context)` with structured fields. No `console.log` in product code.
2. Event taxonomy implemented:
   - `auth.signin`, `auth.signin_failed`, `auth.signout`, `auth.org_switch`
   - `note.created`, `note.updated`, `note.deleted`, `note.version_created`
   - `file.uploaded`, `file.read`, `file.deleted`
   - `ai.summary_requested`, `ai.summary_completed`, `ai.summary_failed`
   - `permission.denied`
   - `error.unhandled`
3. `audit_log` rows written for: note mutations, file mutations, org/membership changes, AI requests, permission denials.
4. Secrets / tokens never logged. Test asserts logger redaction.

## TDD expectations

Strict TDD: files service, file permissions, signed URL TTL handling, audit log writers, logger redaction.

## Documentation updates

- `NOTES.md` — file path scheme, TTL choice, audit retention policy.
- `TODO.md` — tick FL-01..FL-05.
- `docs/API_REFERENCE.md` — files endpoints.
- `docs/SCHEMAS.md` — `files`, `audit_log` schema.

## Risk labels

- `high-risk`
- `security-sensitive`
- `requires-deep-review`
