# Runbook

Operational checklists. Append-only — every entry must be reproducible from
this document alone.

## Production-readiness checklist

### DR-PROD-01 — `app_metadata.org_ids` sync

- Wired in `features/auth/server/jwt-sync.ts`. Called from
  `services/orgs-service.ts` on `createOrg` / `addMember` / `removeMember`,
  and from `features/orgs/server/orgs-actions.ts#createFirstOrgAction`.
- `removeMember` additionally calls `signOutUserGlobally` to revoke any
  in-flight JWTs that still encode the old `org_ids`.
- Smoke check before flipping production: invoke each mutation against a
  staging Supabase project and confirm `auth.users.app_metadata.org_ids`
  reflects the new memberships rows.

### DR-PROD-02 — short JWT expiry

- Set JWT expiry to **900 seconds** in Supabase: dashboard → Auth → Settings
  → API → "JWT expiry". Reduces the stale-claim window after a membership
  change.
- Confirm `app_metadata.org_ids` sync (DR-PROD-01) is wired and verified
  before flipping JWT expiry — otherwise legitimate users may briefly hit
  RLS denials between the membership write and the next token refresh.
- After flipping, monitor the `auth.jwt_synced` and `auth.jwt_sync_failed`
  log events for 24 h. Spikes in failures indicate the service-role key is
  missing or rate-limited.

## Rollback

- DR-PROD-02 is a dashboard toggle; revert by setting JWT expiry back to
  3600 s.
- DR-PROD-01 cannot be rolled back without re-introducing the security
  blocker (removed members retaining DB access). If sync is failing in
  production, prefer fixing the service-role configuration over disabling
  the helper.
