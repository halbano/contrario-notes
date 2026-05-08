-- ===========================================================================
-- 0003_rls_note_shares.sql — extend RLS to note_shares
-- ===========================================================================
--
-- Closes the RLS gap left by 0001_rls.sql + 0002_note_shares.sql:
--   * 0001_rls authored RLS for the 6 tenant tables that existed at the time.
--   * 0002_note_shares introduced the note_shares table later (notes-agent
--     PR #9).
--   * Result: note_shares had rowsecurity=false, no policies — the only
--     tenant table without a DB-level safety net.
--
-- Policies mirror the shape used for the other 6 tables:
--   * SELECT scoped to caller's org_ids.
--   * ALL (insert/update/delete) scoped to caller's org_ids on both USING
--     and WITH CHECK so a row cannot be planted with a foreign org_id.
--
-- Helper public.user_org_ids() is reused (declared in 0001_rls.sql).
-- ---------------------------------------------------------------------------

ALTER TABLE "note_shares" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "note_shares_tenant_select" ON "note_shares"
  FOR SELECT USING ("org_id" = ANY (public.user_org_ids()));
--> statement-breakpoint
CREATE POLICY "note_shares_tenant_modify" ON "note_shares"
  FOR ALL USING ("org_id" = ANY (public.user_org_ids()))
  WITH CHECK ("org_id" = ANY (public.user_org_ids()));
