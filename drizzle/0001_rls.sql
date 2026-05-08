-- ===========================================================================
-- 0001_rls.sql — Row Level Security (defense-in-depth per ADR-0001)
-- ===========================================================================
--
-- Primary tenant scoping is the repository layer (`scopedWhere(ctx, ...)`).
-- These RLS policies are a SECOND fence: even if a query reaches the database
-- without the WHERE clause (a bug, a one-off SQL console), Postgres itself
-- refuses to return rows from another tenant.
--
-- Anchor: the membership-id list a user holds, exposed via Supabase's JWT
-- `app_metadata.org_ids` claim (string array). The `auth.user_org_ids()`
-- helper extracts those claim values into a uuid[] for use in policies.
-- The org-switch endpoint MUST keep this claim in sync (auth-agent task).
--
-- Trade-off:
--   * Service-role key bypasses RLS (Supabase docs). Storage-of-keys
--     discipline is unchanged: never expose service-role to the browser.
--   * RLS denies cross-org reads/writes regardless of role within the org.
--     In-org admin-vs-member rules continue to live in the permissions
--     module — RLS is intentionally NOT a re-implementation of that matrix.
--
-- Tables covered: notes, note_versions, tags, note_tags, files, audit_log.
-- `organizations`, `memberships`, `users` are intentionally NOT covered by
-- table-wide RLS in this migration:
--   - `organizations`: lookups must work pre-membership for sign-up flows.
--   - `memberships`: org-switch validator queries by (user_id, org_id) when
--     no ctx exists yet; covered by application logic instead.
--   - `users`: identity table, mirror of auth.users.
-- All three remain protected by the application's repository layer.
-- ---------------------------------------------------------------------------

-- Helper: returns the array of org ids the current Supabase JWT is a member
-- of. Falls back to '{}' (empty uuid[]) when the claim is missing.
CREATE OR REPLACE FUNCTION public.user_org_ids() RETURNS uuid[]
  LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (
      SELECT array_agg((value)::uuid)
      FROM jsonb_array_elements_text(
        COALESCE(
          (current_setting('request.jwt.claims', true)::jsonb)
            -> 'app_metadata' -> 'org_ids',
          '[]'::jsonb
        )
      )
    ),
    ARRAY[]::uuid[]
  );
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Enable RLS on tenant-scoped tables and install policies.
-- ---------------------------------------------------------------------------

ALTER TABLE "notes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "notes_tenant_select" ON "notes"
  FOR SELECT USING ("org_id" = ANY (public.user_org_ids()));
--> statement-breakpoint
CREATE POLICY "notes_tenant_modify" ON "notes"
  FOR ALL USING ("org_id" = ANY (public.user_org_ids()))
  WITH CHECK ("org_id" = ANY (public.user_org_ids()));
--> statement-breakpoint

ALTER TABLE "note_versions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "note_versions_tenant_select" ON "note_versions"
  FOR SELECT USING ("org_id" = ANY (public.user_org_ids()));
--> statement-breakpoint
CREATE POLICY "note_versions_tenant_modify" ON "note_versions"
  FOR ALL USING ("org_id" = ANY (public.user_org_ids()))
  WITH CHECK ("org_id" = ANY (public.user_org_ids()));
--> statement-breakpoint

ALTER TABLE "tags" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tags_tenant_select" ON "tags"
  FOR SELECT USING ("org_id" = ANY (public.user_org_ids()));
--> statement-breakpoint
CREATE POLICY "tags_tenant_modify" ON "tags"
  FOR ALL USING ("org_id" = ANY (public.user_org_ids()))
  WITH CHECK ("org_id" = ANY (public.user_org_ids()));
--> statement-breakpoint

ALTER TABLE "note_tags" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "note_tags_tenant_select" ON "note_tags"
  FOR SELECT USING ("org_id" = ANY (public.user_org_ids()));
--> statement-breakpoint
CREATE POLICY "note_tags_tenant_modify" ON "note_tags"
  FOR ALL USING ("org_id" = ANY (public.user_org_ids()))
  WITH CHECK ("org_id" = ANY (public.user_org_ids()));
--> statement-breakpoint

ALTER TABLE "files" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "files_tenant_select" ON "files"
  FOR SELECT USING ("org_id" = ANY (public.user_org_ids()));
--> statement-breakpoint
CREATE POLICY "files_tenant_modify" ON "files"
  FOR ALL USING ("org_id" = ANY (public.user_org_ids()))
  WITH CHECK ("org_id" = ANY (public.user_org_ids()));
--> statement-breakpoint

ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "audit_log_tenant_select" ON "audit_log"
  FOR SELECT USING ("org_id" = ANY (public.user_org_ids()));
--> statement-breakpoint
-- audit_log writes are always done by the application logger using the
-- service-role key (which bypasses RLS by design). We still scope SELECTs
-- to the tenant so admins can read their own org's audit trail without
-- seeing others.
CREATE POLICY "audit_log_tenant_insert" ON "audit_log"
  FOR INSERT WITH CHECK ("org_id" = ANY (public.user_org_ids()));
