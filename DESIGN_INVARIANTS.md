# DESIGN_INVARIANTS.md

UI/UX rules. Apply to every component and screen.

## Aesthetic

Reference: https://www.contrario.ai/

- Modern SaaS minimalism
- Typography-first hierarchy
- Restrained color (1 accent max per surface)
- Subtle borders, generous whitespace
- Calm UI, low visual density
- Highly readable, accessible

Avoid: dashboard clutter, heavy gradients, decorative animation, custom UI frameworks.

## Stack

- shadcn/ui primitives (do not invent custom equivalents)
- Tailwind utilities
- CVA for variants when justified
- Semantic HTML
- Lucide icons

## Invariants

1. All interactive elements keyboard accessible (`Tab`, `Enter`, `Esc`, arrow keys where natural).
2. Empty states include a clear next action.
3. Loading states mandatory for async surfaces (skeletons preferred over spinners).
4. Error states mandatory; messages are actionable, not generic.
5. No color-only status indicators (pair with icon or text).
6. Mobile responsiveness mandatory (test at 375px).
7. Focus states always visible (`focus-visible:ring-2`).
8. Dialogs trap focus and restore on close.
9. Tables adapt to mobile (stacked rows or horizontal scroll with sticky col).
10. Forms validate inline; error messages tied to field via `aria-describedby`.
11. Destructive actions never hidden behind hover-only affordances; require confirmation.
12. Typography hierarchy consistent (define scale once, reuse).
13. Use shadcn primitives whenever they exist for the use case.
14. Do not invent a custom component system parallel to shadcn.

## Spacing scale

Tailwind default. Prefer multiples of `4` (`p-2`, `p-4`, `p-6`, `p-8`). No arbitrary `p-[13px]`.

## Color tokens

Defined in `tailwind.config.ts` via shadcn theme variables. No hex literals in components.

## Density modes

Default = comfortable. Compact mode opt-in via prop, never default for content surfaces.

## Animation

- Transitions ≤ 200ms.
- Use only for state clarity (open/close, loading).
- No looping or attention-grabbing animation.
- Respect `prefers-reduced-motion`.

## Pre-merge UI checklist

- [ ] Keyboard reachable end-to-end
- [ ] Loading state present
- [ ] Error state present
- [ ] Empty state present
- [ ] Mobile (375px) verified
- [ ] Focus visible on every interactive element
- [ ] No color-only status
- [ ] Uses shadcn primitive if one exists
