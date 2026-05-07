# frontend-builder-agent

## Role

Build the frontend shell and shared UI primitives. Establish the visual language. No feature data fetching — feature agents own that.

## Branch / worktree

- Branch: `feat/frontend-shell`
- Worktree: `../contrario-notes-worktrees/feat-frontend-shell`
- Rebases onto `feat/foundation-architecture` after foundation merges.

## Scope

- `app/(marketing)/` and `app/(app)/layout.tsx` — top bar, side nav, content frame
- `components/` — shared UI: app shell, org switcher (presentation only), empty/loading/error states, theme provider, breadcrumbs
- `app/(auth)/` — sign-in / sign-up screens (UI; auth wiring belongs to auth-agent)
- `styles/` — typography scale, spacing tokens, focus styles
- `app/page.tsx` — landing / authenticated home placeholder

## Forbidden

- Implementing feature data fetching (notes list, search results, file UI, AI UI). Belongs to feature agents.
- Importing `services/`, `repositories/`, or `db/`.
- Inventing a custom UI framework parallel to shadcn (per `DESIGN_INVARIANTS.md` invariant 14).
- Animation beyond the rules in `DESIGN_INVARIANTS.md`.

## Required reading

- `DESIGN_INVARIANTS.md`
- `PROJECT_STRUCTURE.md`
- `PRE_MERGE_CHECKLIST.md`
- Reference site: https://www.contrario.ai/

## Acceptance criteria

1. App shell: top bar (logo, org switcher slot, user menu slot) + side nav + content area. Mobile collapses side nav into a sheet/drawer.
2. Empty / loading / error state primitives exist as exported components and are used by at least the home placeholder.
3. Theme tokens applied (light by default; dark mode optional but variables defined for it).
4. Typography scale defined once, reused everywhere (no ad-hoc font sizes in components).
5. Focus visible on every interactive element. Keyboard navigation reaches every nav item.
6. Mobile breakpoint (375px) verified for shell, nav, sign-in, sign-up.
7. Sign-in and sign-up screens implemented as UI only (form structure, validation surface). Action wiring is left as a clearly-marked TODO for auth-agent.
8. shadcn primitives used wherever applicable. No custom alternatives.

## TDD expectations

UI components: tests not required by TDD-strict rule, but include component-level tests for any non-trivial logic (e.g., responsive nav state machine).

## Documentation updates

- `NOTES.md` — record visual choices (typography scale, accent color, density).
- `TODO.md` — tick FE-01..FE-06.
- `docs/DESIGN_NOTES.md` (create if helpful) — typography + spacing + color tokens reference.

## Hand-off output

PR description must include:

- Screenshots or descriptions of: app shell, sign-in, sign-up, mobile nav.
- Confirmation of UI checklist items in `PRE_MERGE_CHECKLIST.md`.
- List of shadcn primitives added (`npx shadcn add ...`).

## Risk labels

- `low-risk`
- `frontend-only`
