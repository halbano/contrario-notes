/**
 * VAL-13 — onboarding top bar surface tests.
 *
 * Authenticated user with no membership must always have a sign-out escape
 * hatch. We render the component tree to static markup and assert:
 *   - Logo present (link to "/")
 *   - User's email rendered ("Signed in as ...")
 *   - A form whose action is the sign-out server action with a Sign out button
 *
 * No DOM testing library — we use React's built-in
 * `renderToStaticMarkup` (already a dependency via react-dom). Radix's
 * dropdown is closed by default in static markup, but its trigger button
 * and menu content are still emitted in the SSR tree for a11y; we only
 * need to assert the menu content's structure.
 */

import { describe, expect, it, vi } from 'vitest'

// signOutAction is a server action; we never invoke it in this surface
// test. The mock just keeps the import graph light (no Supabase wiring at
// test time). `async () => {}` mirrors the real signature.
vi.mock('@/app/(auth)/_components/auth-actions', () => ({
  signOutAction: async () => undefined,
}))

import { renderToStaticMarkup } from 'react-dom/server'
import * as React from 'react'
import { OnboardingTopBar } from './onboarding-top-bar'

describe('VAL-13 — OnboardingTopBar', () => {
  it('renders the logo linking home', () => {
    const html = renderToStaticMarkup(
      React.createElement(OnboardingTopBar, { email: 'orphan@example.com' }),
    )
    expect(html).toContain('Contrario')
    expect(html).toMatch(/href="\/"/)
    expect(html).toMatch(/aria-label="Contrario Notes home"/)
  })

  it('shows the signed-in email', () => {
    const html = renderToStaticMarkup(
      React.createElement(OnboardingTopBar, { email: 'orphan@example.com' }),
    )
    expect(html).toContain('Signed in as')
    expect(html).toContain('orphan@example.com')
  })

  it('falls back to a generic label when email is null (defence-in-depth)', () => {
    const html = renderToStaticMarkup(
      React.createElement(OnboardingTopBar, { email: null }),
    )
    expect(html).toContain('Account')
    // The literal "null" must NEVER appear in user-facing chrome.
    expect(html).not.toContain('>null<')
  })

  it('renders a Sign out form posting to a server action', () => {
    const html = renderToStaticMarkup(
      React.createElement(OnboardingTopBar, { email: 'orphan@example.com' }),
    )
    // The dropdown menu items render in SSR for a11y. The form must be
    // present with a submit button labelled "Sign out".
    expect(html).toContain('Sign out')
    expect(html).toMatch(/<form[^>]*>/)
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>/)
  })

  it('does NOT render a side nav or org switcher (orphan state has nowhere to go)', () => {
    const html = renderToStaticMarkup(
      React.createElement(OnboardingTopBar, { email: 'orphan@example.com' }),
    )
    // These strings are signature labels of the in-app shell. Their
    // presence here would mean the orphan user is being shown navigation
    // they can't use.
    expect(html).not.toMatch(/aria-label="Sidebar"/)
    expect(html).not.toMatch(/Switch organization/i)
  })
})
