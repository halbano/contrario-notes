/**
 * UI smoke test.
 *
 * Broader successor to scripts/check-nav.ts. The nav-click crawler asserts
 * every visible <a href> resolves to a 2xx route. This harness goes further:
 * it drives real browser interactions on the visible UI elements of the
 * authenticated shell and snapshots each result, so we catch regressions in
 * shape (DOM contents) and not just status code.
 *
 * Coverage:
 *   1. Public surfaces  — GET each, assert 2xx, snapshot.
 *   2. App-shell nav    — click each side-nav item, assert URL + page h1,
 *                         snapshot.
 *   3. Mobile shell     — emulate 375x812, open the drawer (Sheet), snapshot,
 *                         click a link inside, assert drawer closes + nav.
 *
 * Pre-requisite: Next dev server reachable at BASE_URL (default
 * http://localhost:3000). Run `npm run dev` in another terminal first.
 *
 * Snapshots: .smoke/<viewport>/<surface>.png (gitignored).
 *
 * Skipped (call out as TODO until each surface lands):
 *   - Notifications surface — bell icon / inbox panel does not exist yet.
 *   - Note detail page     — /notes/[id] needs notes-agent Phase 2 + seed
 *                            data so a real id is reachable. Today /notes
 *                            renders the EmptyState placeholder.
 *
 * Exit codes:
 *   0 — every check passed
 *   1 — at least one check failed (full report at bottom)
 *   2 — server unreachable / setup error
 */

import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import { chromium, type Browser, type Page } from '@playwright/test'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'
const SHOTS_DIR = '.smoke'

interface Failure {
  surface: string
  reason: string
}

const failures: Failure[] = []
function recordFail(surface: string, reason: string) {
  failures.push({ surface, reason })
  console.log(`✗ ${surface}  — ${reason}`)
}
function recordPass(surface: string) {
  console.log(`✓ ${surface}`)
}

async function waitForServer(): Promise<void> {
  const deadline = Date.now() + 60_000
  let lastError: unknown = null
  while (Date.now() < deadline) {
    try {
      const res = await fetch(BASE_URL)
      if (res.status < 500) return
    } catch (e) {
      lastError = e
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(
    `Dev server at ${BASE_URL} did not become ready within 60s: ${String(lastError)}`,
  )
}

async function shot(page: Page, viewport: 'desktop' | 'mobile', name: string) {
  const dir = join(SHOTS_DIR, viewport)
  await mkdir(dir, { recursive: true })
  await page.screenshot({ path: join(dir, `${name}.png`), fullPage: false })
}

// ---------------------------------------------------------------------------
// Section 1 — public surfaces (GET + snapshot)
// ---------------------------------------------------------------------------

const PUBLIC_SURFACES: { path: string; name: string }[] = [
  { path: '/sign-in', name: 'sign-in' },
  { path: '/sign-up', name: 'sign-up' },
  { path: '/forgot-password', name: 'forgot-password' },
]

async function checkPublicSurfaces(page: Page) {
  for (const { path, name } of PUBLIC_SURFACES) {
    const surface = `public:${name}`
    try {
      const res = await page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle' })
      const status = res?.status() ?? 0
      if (status < 200 || status >= 400) {
        recordFail(surface, `status ${status}`)
        continue
      }
      await shot(page, 'desktop', name)
      recordPass(surface)
    } catch (e) {
      recordFail(surface, `nav error ${String(e)}`)
    }
  }
}

// ---------------------------------------------------------------------------
// Section 2 — app-shell nav (click + assert h1 + snapshot)
// ---------------------------------------------------------------------------

const APP_NAV: { label: string; expectedPath: string; expectedH1: string }[] = [
  { label: 'Home', expectedPath: '/', expectedH1: 'Welcome back.' },
  { label: 'Notes', expectedPath: '/notes', expectedH1: 'Notes' },
  { label: 'Search', expectedPath: '/search', expectedH1: 'Search' },
  { label: 'Files', expectedPath: '/files', expectedH1: 'Files' },
  { label: 'AI', expectedPath: '/ai', expectedH1: 'AI' },
  { label: 'Settings', expectedPath: '/settings', expectedH1: 'Settings' },
]

async function checkAppNavClicks(page: Page) {
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' })
  // If the app-shell route redirected us to /sign-in (auth middleware), the
  // nav links aren't on the page. Detect this and skip with an actionable
  // log line rather than emitting noisy timeouts.
  if (page.url().includes('/sign-in')) {
    console.log(
      'skipped — / redirected to /sign-in. Provision a test user (TEST_USER_EMAIL / TEST_USER_PASSWORD) and inject a Supabase session before this section to exercise the authenticated shell.',
    )
    return
  }
  for (const { label, expectedPath, expectedH1 } of APP_NAV) {
    const surface = `nav-click:${label.toLowerCase()}`
    try {
      const link = page.locator(`nav a:has-text("${label}")`).first()
      await link.click({ timeout: 5000 })
      await page.waitForURL(`**${expectedPath}`, { timeout: 5000 })
      // Verify the heading text is present (page actually rendered, not just URL changed).
      await page.waitForSelector(`h1:has-text("${expectedH1}")`, { timeout: 5000 })
      await shot(page, 'desktop', `nav-${label.toLowerCase()}`)
      recordPass(surface)
    } catch (e) {
      recordFail(surface, String(e).split('\n')[0] ?? 'unknown')
    }
  }
}

// ---------------------------------------------------------------------------
// Section 3 — mobile shell + drawer interaction
// ---------------------------------------------------------------------------

async function checkMobileShell(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } })
  const page = await ctx.newPage()
  try {
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' })
    if (page.url().includes('/sign-in')) {
      // Auth-gated shell — snapshot what an unauthenticated mobile visitor sees,
      // skip the drawer assertions until a test session can be provisioned.
      await shot(page, 'mobile', 'sign-in-redirect')
      console.log(
        'skipped mobile drawer — / redirected to /sign-in. Same fixture-user TODO as desktop nav-click section.',
      )
      return
    }
    await shot(page, 'mobile', 'home')

    // Open the drawer (hamburger). Component sets aria-label "Open navigation".
    const surface1 = 'mobile:drawer-open'
    try {
      const trigger = page.locator('button[aria-label*="Open" i], button[aria-label*="menu" i]').first()
      await trigger.click({ timeout: 5000 })
      // Sheet uses role="dialog" once open. Wait for it.
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 })
      await shot(page, 'mobile', 'drawer-open')
      recordPass(surface1)
    } catch (e) {
      recordFail(surface1, String(e).split('\n')[0] ?? 'unknown')
      return
    }

    // From inside the drawer, click "Notes" → drawer should close and URL should change.
    const surface2 = 'mobile:drawer-click-notes'
    try {
      const link = page.locator('[role="dialog"] a:has-text("Notes")').first()
      await link.click({ timeout: 5000 })
      await page.waitForURL('**/notes', { timeout: 5000 })
      await page.waitForSelector('h1:has-text("Notes")', { timeout: 5000 })
      // Drawer should be gone.
      const dialogStillOpen = await page.locator('[role="dialog"]').count()
      if (dialogStillOpen > 0) {
        recordFail(surface2, 'drawer remained open after navigation')
        return
      }
      await shot(page, 'mobile', 'after-drawer-click-notes')
      recordPass(surface2)
    } catch (e) {
      recordFail(surface2, String(e).split('\n')[0] ?? 'unknown')
    }
  } finally {
    await ctx.close()
  }
}

// ---------------------------------------------------------------------------
// Section 4 — TODOs (deferred until the surface exists)
// ---------------------------------------------------------------------------

function reportSkipped() {
  // Kept inline so they show in CI logs as visible reminders, not as silent
  // gaps. Each entry should be promoted to a real check when its feature lands.
  console.log('')
  console.log('skipped — feature not yet built or fixture missing:')
  console.log(
    '  - authenticated shell: provision TEST_USER_EMAIL / TEST_USER_PASSWORD,',
  )
  console.log(
    '    inject session via supabase.auth.signInWithPassword + cookies into Playwright context',
  )
  console.log(
    '  - notifications: bell icon / inbox panel — TODO when surface lands',
  )
  console.log(
    '  - note-detail: /notes/[id] — TODO when notes Phase 2 + seed data merge',
  )
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

async function main() {
  await waitForServer()
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  try {
    console.log('--- public surfaces (desktop) ---')
    await checkPublicSurfaces(page)
    console.log('')
    console.log('--- app-shell nav clicks (desktop) ---')
    await checkAppNavClicks(page)
    console.log('')
    console.log('--- mobile shell (375x812) ---')
    await checkMobileShell(browser)
    reportSkipped()
  } finally {
    await ctx.close()
    await browser.close()
  }

  console.log('')
  if (failures.length === 0) {
    console.log(`All checks passed. Snapshots in ${SHOTS_DIR}/`)
    return
  }
  console.log(`${failures.length} check(s) failed:`)
  for (const f of failures) console.log(`  ${f.surface}  — ${f.reason}`)
  process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(2)
})
