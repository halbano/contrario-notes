/**
 * Nav-click regression test.
 *
 * Boots a Playwright browser, walks the app shell, collects every
 * <a href> visible in the navigation, visits each link, and fails on
 * any non-2xx response. Catches the class of bug where a nav item
 * points at a route that doesn't exist (404) or errors (500).
 *
 * Surfaced after a Phase 1 incident where /notes /search /files /ai
 * /settings all 404'd because the placeholder pages hadn't been
 * authored yet — the screenshot harness only captured a hardcoded
 * surface list and never clicked anything.
 *
 * Pre-requisite: Next dev server running at http://localhost:3000.
 *
 * Exit codes:
 *   0 — every visited link returned a 2xx
 *   1 — at least one link returned non-2xx (URL + status reported)
 *   2 — server unreachable / setup error
 */

import { chromium } from '@playwright/test'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'

/**
 * Where to start the crawl. /sign-in is the public app shell entry point
 * that exposes the auth-related links; /(app)/* would require a logged-in
 * session which the dev environment doesn't have.
 *
 * Authenticated surfaces (/, /notes, /search, /files, /ai, /settings) are
 * crawled by visiting them directly — Next.js' middleware lets the app
 * shell render even without a session (placeholder routes), so this works
 * until auth gating is enabled.
 */
const ENTRY_POINTS = ['/', '/sign-in', '/sign-up', '/forgot-password']

// Routes we explicitly DO NOT want to follow (external, mailto, etc).
function shouldVisit(href: string): boolean {
  if (!href) return false
  if (href.startsWith('mailto:') || href.startsWith('tel:')) return false
  if (href.startsWith('http://') || href.startsWith('https://')) {
    // Only follow same-origin absolute URLs.
    return href.startsWith(BASE_URL)
  }
  if (href.startsWith('#')) return false
  return true
}

function normalize(href: string): string {
  if (href.startsWith(BASE_URL)) return href.slice(BASE_URL.length)
  return href
}

async function waitForServer(): Promise<void> {
  const deadline = Date.now() + 60_000
  let lastError: unknown = null
  while (Date.now() < deadline) {
    try {
      const res = await fetch(BASE_URL, { method: 'GET' })
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

async function collectHrefs(page: import('@playwright/test').Page): Promise<string[]> {
  const links = page.locator('a[href]')
  const count = await links.count()
  const hrefs: string[] = []
  for (let i = 0; i < count; i++) {
    const href = await links.nth(i).getAttribute('href')
    if (href) hrefs.push(href)
  }
  return hrefs
}

async function main() {
  await waitForServer()

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()

  const visited = new Set<string>()
  const queue: string[] = [...ENTRY_POINTS]
  const failures: { url: string; status: number; from?: string }[] = []

  // Eagerly add the placeholder app-shell routes too, in case nothing
  // links to them in the rendered HTML at this time (e.g. side nav
  // hidden on mobile).
  const KNOWN_APP_ROUTES = ['/notes', '/search', '/files', '/ai', '/settings']
  for (const route of KNOWN_APP_ROUTES) queue.push(route)

  try {
    while (queue.length > 0) {
      const route = queue.shift()!
      if (visited.has(route)) continue
      visited.add(route)

      let response
      try {
        response = await page.goto(`${BASE_URL}${route}`, {
          waitUntil: 'domcontentloaded',
          timeout: 15_000,
        })
      } catch (e) {
        failures.push({ url: route, status: -1 })
        // eslint-disable-next-line no-console
        console.log(`✗ ${route}  ERROR ${String(e)}`)
        continue
      }

      const status = response?.status() ?? 0
      if (status >= 200 && status < 400) {
        // eslint-disable-next-line no-console
        console.log(`✓ ${route}  ${status}`)
      } else {
        failures.push({ url: route, status })
        // eslint-disable-next-line no-console
        console.log(`✗ ${route}  ${status}`)
      }

      // Discover more links from this page if it loaded successfully.
      if (status < 400) {
        const hrefs = await collectHrefs(page)
        for (const href of hrefs) {
          if (!shouldVisit(href)) continue
          const norm = normalize(href)
          if (!visited.has(norm)) queue.push(norm)
        }
      }
    }
  } finally {
    await browser.close()
  }

  // eslint-disable-next-line no-console
  console.log(
    `\nVisited ${visited.size} routes. ${failures.length === 0 ? 'All OK.' : `${failures.length} failed.`}`,
  )

  if (failures.length > 0) {
    // eslint-disable-next-line no-console
    console.log('Failures:')
    for (const f of failures) {
      // eslint-disable-next-line no-console
      console.log(`  ${f.url}  status=${f.status}`)
    }
    process.exit(1)
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exit(2)
})
