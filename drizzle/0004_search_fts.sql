-- ===========================================================================
-- 0004_search_fts.sql — Postgres full-text search infrastructure for notes
-- ===========================================================================
--
-- Adds a generated `search_tsv` tsvector column on `notes` aggregating
-- (title, content, tags_text), plus a GIN index for fast `@@` queries.
--
-- Per ADR-0004, the visibility predicate is composed in
-- `permissions/note-visibility-sql.ts` and AND-ed into the search query in
-- `repositories/search-repository.ts`. This migration only provisions the
-- index; it does NOT relax tenant scoping — every search query is still
-- gated by `notes.org_id = ctx.orgId` AND the visibility predicate.
--
-- Dictionary choice: `simple` (no stemming, no stop-word stripping). v1 has
-- no defined language story across orgs; `simple` is the conservative
-- default. Switch to a language-specific dictionary when the product fixes
-- a language contract.
--
-- ---------------------------------------------------------------------------
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "search_tsv" tsvector
  GENERATED ALWAYS AS (
    to_tsvector(
      'simple',
      coalesce("title", '') || ' ' || coalesce("content", '') || ' ' || coalesce("tags_text", '')
    )
  ) STORED;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notes_search_tsv_idx" ON "notes" USING GIN ("search_tsv");
