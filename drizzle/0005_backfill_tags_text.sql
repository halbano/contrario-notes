-- ===========================================================================
-- 0005_backfill_tags_text.sql — backfill notes.tags_text from note_tags
-- ===========================================================================
--
-- Bug: `repositories/tags-repository.ts:setTagsForNote` wrote join rows
-- to `note_tags` but never updated `notes.tags_text`. Since
-- `notes.search_tsv` is a STORED generated column over
-- `title || content || tags_text`, the FTS index had empty tag text on
-- every note → search-by-tag returned no matches (VAL-17).
--
-- Code fix lands in the same PR; this migration backfills every
-- existing note's `tags_text` from the current `note_tags` join so the
-- generated `search_tsv` re-computes on the next row touch (Postgres
-- recomputes stored generated columns on UPDATE of any referenced
-- column).
--
-- Idempotent: re-running just rewrites the same denormalized string.
-- Tag-name order is sorted to keep churn deterministic across reruns.
-- ---------------------------------------------------------------------------
UPDATE "notes" n
SET "tags_text" = COALESCE(
  (
    SELECT string_agg(t."name", ' ' ORDER BY t."name")
    FROM "note_tags" nt
    JOIN "tags" t ON t."id" = nt."tag_id"
    WHERE nt."note_id" = n."id" AND nt."org_id" = n."org_id"
  ),
  ''
);
