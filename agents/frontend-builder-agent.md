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

## Visual iteration loop (screenshot + refine)

After implementing the shell, sign-in, sign-up surfaces, the agent runs a Playwright-driven visual review loop until the result matches `DESIGN_INVARIANTS.md` and the https://www.contrario.ai/ aesthetic.

Setup (one-time):

- Install dev dep: `npm i -D @playwright/test`
- Install browsers: `npx playwright install chromium`
- Add `.screenshots/` to `.gitignore`
- Add `npm run screenshot` script that boots Next dev server (or assumes one is running on `:3000`) and runs `scripts/screenshot.ts`.

`scripts/screenshot.ts` captures, at minimum:

| Surface | Viewports |
|---|---|
| `/` (authenticated home placeholder) | 1280×800, 375×812 |
| `/(auth)/sign-in` | 1280×800, 375×812 |
| `/(auth)/sign-up` | 1280×800, 375×812 |
| App shell with nav drawer open | 375×812 |

Captures both light and dark theme if dark is implemented.

PNGs save to `.screenshots/<surface>-<viewport>-<theme>.png` (timestamped folder optional). The directory is gitignored.

Iteration loop (repeat until polished, max 3-4 rounds or until acceptance criteria met):

1. Run screenshots.
2. Read each PNG via the Read tool.
3. Review against `DESIGN_INVARIANTS.md` (typography hierarchy, restrained color, spacing scale, focus visible, mobile layout, calm UI) and Contrario reference (typography-first, generous whitespace, subtle borders, no clutter).
4. Note specific defects (e.g., "header padding too tight on mobile", "focus ring missing on input", "typography scale collapses at 375px").
5. Edit components/styles to fix.
6. Re-screenshot. Compare. Repeat.
7. Stop when no defects remain or you've stabilized.

Document each round in `docs/DESIGN_NOTES.md` under a "Visual iteration log" section: round number, defects found, fixes applied, before/after notes.

Forbidden during iteration:

- Editing files outside this agent's declared scope.
- Adding decorative animation to "make it pop".
- Inflating dependencies — Playwright is the only addition justified for screenshots; no design tooling.

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
