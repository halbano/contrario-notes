/**
 * VAL-13 — onboarding layout structural test.
 *
 * The layout must render the OnboardingTopBar above the centred card slot.
 * Crucially, the bar surfaces the authenticated user's email (escape-hatch
 * UX) and includes a sign-out form even when Supabase returns no user
 * (defence-in-depth, since middleware already gates this tree).
 */

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: 'user-aaa', email: 'first@example.com' } },
        error: null,
      }),
    },
  }),
}))
vi.mock('@/app/(auth)/_components/auth-actions', () => ({
  signOutAction: async () => undefined,
}))

import { renderToStaticMarkup } from 'react-dom/server'
import * as React from 'react'
import OnboardingLayout from './layout'

describe('VAL-13 — OnboardingLayout', () => {
  it('renders the OnboardingTopBar above the children slot', async () => {
    const tree = await OnboardingLayout({
      children: React.createElement('div', { 'data-testid': 'child' }, 'CHILD_CONTENT'),
    })
    const html = renderToStaticMarkup(tree)
    expect(html).toContain('first@example.com')
    expect(html).toContain('CHILD_CONTENT')
    // top bar appears before the main content in document order
    expect(html.indexOf('first@example.com')).toBeLessThan(html.indexOf('CHILD_CONTENT'))
    // No side nav — the orphan user has nowhere to navigate.
    expect(html).not.toMatch(/aria-label="Sidebar"/)
  })
})
