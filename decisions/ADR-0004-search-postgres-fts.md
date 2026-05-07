# ADR-0004 — Search via Postgres full-text search

- Status: accepted
- Date: 2026-05-07

## Context

Notes search must be:

- Org-scoped (no leak across orgs).
- Visibility-filtered (no leak across visibility tiers within org).
- Fast at ~10k notes (seeded), with headroom.
- Operationally simple (no extra service to run).

Search-tier leakage is the highest-risk surface in the app. Filter MUST run inside the SQL query, not in app code.

## Decision

Use Postgres full-text search:

- Add `search_tsv tsvector generated always as (...) stored` column on `notes` aggregating `title || ' ' || content || ' ' || tags_text`.
- GIN index on `search_tsv`.
- Search query in SQL:

```sql
SELECT n.*
FROM notes n
WHERE n.org_id = $1
  AND <visibility predicate for $userId>
  AND n.search_tsv @@ plainto_tsquery($2)
ORDER BY ts_rank(n.search_tsv, plainto_tsquery($2)) DESC
LIMIT 50;
```

Visibility predicate is composed from `permissions/` and inlined into the query — never applied as a post-filter.

Tags participate via a denormalized `tags_text` column (or trigger-maintained), updated on note save. Reduces join cost in hot path.

## Consequences

Pros:

- Single-DB, single-query path. No external search service.
- Visibility/org filtering happen in the same `WHERE` as ranking — leak surface is small and reviewable.
- Performance acceptable for the planned scale; GIN scales sublinearly with corpus size.

Cons:

- Multilingual stemming is mediocre vs Elasticsearch / Meilisearch. Acceptable for v1.
- Re-indexing tag updates needs care. Trigger or service-layer upsert.

## Alternatives considered

- **Meilisearch / Typesense**: better relevance, but extra service to run and a second permissions surface to enforce. Rejected.
- **pg_trgm only**: cheaper but worse ranking. Rejected as primary; may layer for fuzzy matching later.
- **App-tier filtering after broad SQL**: violates `TENANCY_INVARIANTS.md` invariant 4. Rejected.

## Risks

- HIGH: visibility predicate must be unit-tested with cross-user/cross-org synthetic data.
- MEDIUM: query latency at scale; `EXPLAIN ANALYZE` on seed dataset must show index usage.
