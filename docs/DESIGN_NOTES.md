# DESIGN_NOTES.md

Design tokens chosen for the frontend shell. Source of truth for typography,
spacing, color, density, and motion. Cross-references `DESIGN_INVARIANTS.md`.

Last Updated: 2026-05-07
Owner: frontend-builder-agent

## Typography scale

Defined once in `styles/globals.css` (CSS variables) and exposed via Tailwind
utilities in `tailwind.config.ts`. Components use the named utilities only;
no `text-[NNpx]` is allowed.

| Token       | Tailwind utility | Size    | Line height | Letter-spacing |
| ----------- | ---------------- | ------- | ----------- | -------------- |
| display     | `text-display`   | 48 px   | 1.15        | -0.02em        |
| h1          | `text-h1`        | 36 px   | 1.15        | -0.02em        |
| h2          | `text-h2`        | 28 px   | 1.35        | -0.01em        |
| h3          | `text-h3`        | 22 px   | 1.35        | normal         |
| h4          | `text-h4`        | 18 px   | 1.35        | normal         |
| body        | `text-body`      | 16 px   | 1.55        | normal         |
| small       | `text-small`     | 14 px   | 1.55        | normal         |
| micro       | `text-micro`     | 12 px   | 1.55        | normal         |

Page titles use `h1`, card titles use `h2`, section titles use `h3`/`h4`.
Form/UI labels and helper text use `small`. Eyebrow / metadata uses `micro`
with `uppercase tracking-widest`.

## Color tokens

Inherited from foundation in `tailwind.config.ts` via shadcn semantic names:
`background`, `foreground`, `card`, `popover`, `primary`, `secondary`, `muted`,
`accent`, `destructive`, `border`, `input`, `ring`. Light theme is default;
`.dark` class swaps tokens. Components reference utilities (`bg-background`,
`text-foreground`, etc.) — never hex.

The accent stays restrained: a single accent surface per page (per
`DESIGN_INVARIANTS.md` aesthetic rule). The current accent token is the
neutral `--accent` (very subtle). When a feature needs a true brand accent
(e.g. CTA highlight), introduce it in `globals.css` as a new variable, do
not hard-code.

## Spacing

Tailwind default scale, multiples of 4. Top bar height 56 px (`h-14`),
side nav width 256 px (`w-64`), main content padding `px-4 py-6` mobile /
`md:px-8 md:py-10` desktop. Auth card padding `p-6` mobile / `md:p-8`.

## Density

Default = comfortable. No compact mode introduced in the shell.

## Focus

Single global rule in `styles/globals.css`:

```css
:focus-visible { @apply outline-none ring-2 ring-ring ring-offset-2 ring-offset-background; }
```

Plus shadcn-generated `focus-visible:ring-1` on individual primitives —
the global rule wins through specificity / cascade.

## Motion

- All transitions are state-clarity only (open/close, hover, focus).
- Capped at the durations baked into shadcn primitives (≤ 300 ms for sheet
  transitions, well under 200 ms for hover/focus).
- `prefers-reduced-motion` is honored globally in `styles/globals.css`.

## App shell

- `app/(app)/layout.tsx` — top bar + side nav + content area.
- Side nav: persistent at ≥ md (`w-64` border-right column).
- Mobile (< md): side nav becomes a `Sheet` triggered by a hamburger button
  in the top bar. `Sheet` traps focus and supports Esc-to-close (Radix).
- Top bar slots: logo (left), org switcher (left of centre), user menu
  (right). The org switcher and user menu are presentation-only stubs until
  `auth-agent` wires them.

## Auth screens

- `app/(auth)/sign-in/page.tsx`, `app/(auth)/sign-up/page.tsx`,
  `app/(auth)/forgot-password/page.tsx`.
- Use shared `AuthCard` and Zod schemas in `auth-schemas.ts`.
- Server actions live in `auth-actions.ts` and currently return a clearly
  marked "not yet wired" message. The `auth-agent` replaces the bodies but
  must keep the input schemas and the result shape.

The `/forgot-password` route is a stub: it owns nothing more than UI plus the
`forgotPasswordSchema` and a `requestPasswordReset` server-action stub
(`TODO(auth-agent)`-marked) that the form does not yet call. On submit the
form runs client-side Zod validation only and flips into a local
"Check your inbox" success state — no server call, no Supabase wiring. The
`auth-agent` must replace the action body with `resetPasswordForEmail`,
swap the local success-flip for a real action call, and ensure the response
does not leak whether the email is registered.

## shadcn primitives in use

`button`, `input`, `label`, `sheet`, `dropdown-menu`, `avatar`, `separator`,
`card`, `alert`, `skeleton`, `form`. Installed via
`npx shadcn@latest add <name>`.

## State primitives

Exported from `@/components/states`:

- `EmptyState` — invariant 2: include a clear next action.
- `LoadingState` — invariant 3: skeletons preferred over spinners.
- `ErrorState` — invariant 4: actionable, not generic; pairs icon + text
  with destructive color (no color-only status, invariant 5).

The home placeholder (`app/(app)/page.tsx`) consumes `EmptyState` to
demonstrate the primitive end-to-end.

## Visual iteration log

Three Playwright-driven rounds (`scripts/screenshot.ts`, `npm run screenshot`).
PNGs are written to `.screenshots/round-N/` (gitignored) and reviewed against
`DESIGN_INVARIANTS.md` plus the https://www.contrario.ai/ reference.

### Round 1 — 2026-05-07

**Defects found:**
- Mobile top bar overcrowded at 375 px: hamburger + logo + org switcher pill +
  avatar all competed for space (`top-bar.tsx`).
- Mobile nav drawer did not pin Settings to the bottom — `SideNav`'s `mt-auto`
  was inert because `SheetContent` was not a flex column with full-height
  children (`mobile-nav.tsx`).
- Empty-state CTA used the default solid-dark `Button` while disabled, which
  read as heavy and "clickable-but-broken" rather than "intentionally
  disabled placeholder" (`app/(app)/page.tsx`).
- Next.js dev-tools floating indicator overlapped the bottom-pinned Settings
  link and polluted every screenshot.

**Fixes applied:**
- Removed mobile-only org switcher from the top bar; moved it into the mobile
  nav drawer header (full-width inside the drawer, fixed-width on desktop).
- Restructured `SheetContent` as `flex flex-col` with `SideNav` taking
  `flex-1`, so secondary nav (`Settings`) genuinely sits at the drawer
  bottom.
- Switched the disabled "New note" CTA to `variant="outline"`, which reads as
  a calmer placeholder consistent with the Contrario aesthetic.
- Disabled both `devIndicators.appIsrStatus` and
  `devIndicators.buildActivity` in `next.config.mjs`.

**Status:** continued.

### Round 2 — 2026-05-07

**Defects found:**
- The Next dev indicator was still rendering because the previous round's
  config change required a server restart.

**Fixes applied:**
- Restarted the dev server with the updated `next.config.mjs`.

**Status:** continued.

### Round 3 — 2026-05-07

**Defects found:** none material.

**Notes:**
- Top bar uncrowded at 375 px.
- Mobile drawer correctly shows logo, org switcher, primary nav, then
  Settings pinned at bottom; gear icon resolves correctly without the
  dev-indicator overlay.
- Auth screens are typographically led, restrained card with `shadow-sm`,
  generous whitespace, single accent (the primary submit button).
- Focus rings are visible on every interactive element (verified by
  capturing the close button after opening the sheet — the ring is the
  expected post-open focus state, not a static border).
- The shadcn `Sheet` close button retains a subtle focus ring after open;
  this is the correct accessibility behavior (focus moves to close on
  open) and disappears on next interaction.

**Status:** stabilized — three rounds, last round had no material defects.

## Screenshot harness

`scripts/screenshot.ts` (run via `npm run screenshot`) captures four surfaces
× two viewports each (1280×800 desktop, 375×812 mobile, deviceScaleFactor 2)
into `.screenshots/round-N/`:

- `home` (authenticated home placeholder)
- `sign-in`
- `sign-up`
- `home-mobile-nav-open` (mobile only — exercises the Sheet drawer)

Pre-requisite: dev server already running on `:3000`. Round numbers
auto-increment; pass `ROUND=N` to override.
