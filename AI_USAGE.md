# AI_USAGE.md

Record of AI-assisted authorship in this repo. One row per PR or session that used AI.

| Date | Author | PR / Branch | Tooling | Scope | Notes |
|---|---|---|---|---|---|
| 2026-05-07 | hernanalbano | bootstrap (main) | Claude Code (Opus 4.7, 1M ctx) | Governance docs, agent specs, ADRs, TODO backlog | Plan-heavy bootstrap. No application code. |

## Rules

- Every AI-authored PR ticks the AI_USAGE box in PR template and adds a row here.
- Prompts that touched user data or AI-summary internals must be linked to `prompts/` template ids.
- Secrets must never appear in prompts. Strip identifiers and tokens before sharing.
