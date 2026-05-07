# ADR-0006 — AI summary endpoint with permission-safe context

- Status: accepted
- Date: 2026-05-07

## Context

AI summary feature must produce structured summaries from note content. Highest leakage risk: the LLM context window can pull in notes the user is not allowed to see, and the model will surface them in output. AI prompts are also a vector for prompt-injection escalation across tenants.

## Decision

AI endpoint contract:

1. Caller passes a list of `note_id`s they want summarized (or a single `note_id` for solo summary).
2. Server loads each note via the **same scoped service the user uses for reads**: `services.notes.findVisibleByIds(ids)`. Notes the user cannot read are silently dropped (or the request 404s if zero remain).
3. AI prompt is composed only from the surviving notes' content + the user's instruction.
4. Prompt template is loaded from `prompts/` (versioned). System prompt explicitly bounds: "Summarize only the provided notes. Do not invent facts. Do not reference any data not in the input."
5. LLM provider call. No org-wide context, no embeddings of unrelated notes, no retrieval over the full corpus.
6. Response is returned to the user for **review-before-accept**. Nothing is auto-saved as a note.

Logging (per request):

- `userId`, `orgId`, `noteIds[]` (from input), `noteIdsUsed[]` (after permission filter), `promptTemplateId`, `promptHash`, `responseTokens`, `latencyMs`, `outcome`.
- No raw prompt or response stored by default. Hash is sufficient for replay/audit.

Rate limiting:

- Per-user and per-org limits enforced in middleware.
- 429 on excess; logged.

Prompt-injection containment:

- Note content is wrapped in fenced delimiters in the prompt and labeled as untrusted.
- System prompt instructs the model to ignore in-content instructions that try to redirect behavior.

## Consequences

Pros:

- AI cannot see anything the user cannot already read. Visibility is enforced once, in the scoped service.
- Audit trail exists without storing user content.
- Review-before-accept gives users a chance to spot hallucinations before they enter the note record.

Cons:

- "Summarize my org" is not supported as a one-click action. By design.
- Latency includes the per-note permission check loop. Acceptable.

## Alternatives considered

- **Embed all org notes, retrieve top-k**: each retrieval call is a permission boundary; too many places for filter to be wrong. Rejected for v1. May revisit with vector store keyed by `(org_id, visibility_class)` and per-user post-filter — still risky.
- **Auto-save AI output as version**: removes review-before-accept; encourages hallucinations into the canonical record. Rejected.

## Enforcement

- `TENANCY_INVARIANTS.md` invariants 6 and 7.
- AI endpoint integration tests must include: caller requests notes from another org → response excludes them; caller requests a private note they don't own → excluded; prompt-injection note content does not exfiltrate other notes.
