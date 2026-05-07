/**
 * Visual iteration screenshot harness.
 *
 * Captures the four UI surfaces owned by frontend-builder-agent at two
 * viewports each (desktop 1280x800, mobile 375x812) and writes PNGs into
 * `.screenshots/round-N/`. Round N is the smallest integer not already
 * present, unless ROUND env var is provided.
 *
 * Pre-requisite: Next dev server must already be running at
 *   http://localhost:3000
 * Boot it separately, e.g. `npm run dev &`, then call `npm run screenshot`.
 */

import { chromium, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'
const ROOT = path.resolve(process.cwd(), '.screenshots')

const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 375, height: 812 },
} as const

type ViewportName = keyof typeof VIEWPORTS

interface Surface {
  name: string
  path: string
  viewports: ViewportName[]
  setup?: (page: Page) => Promise<void>
}

const SURFACES: Surface[] = [
  { name: 'home', path: '/', viewports: ['desktop', 'mobile'] },
  { name: 'sign-in', path: '/sign-in', viewports: ['desktop', 'mobile'] },
  { name: 'sign-up', path: '/sign-up', viewports: ['desktop', 'mobile'] },
  {
    name: 'forgot-password',
    path: '/forgot-password',
    viewports: ['desktop', 'mobile'],
  },
  {
    name: 'home-mobile-nav-open',
    path: '/',
    viewports: ['mobile'],
    setup: async (page) => {
      await page.getByRole('button', { name: /open navigation menu/i }).click()
      await page.waitForTimeout(350)
    },
  },
]

function nextRound(): number {
  if (process.env.ROUND) return Number(process.env.ROUND)
  if (!fs.existsSync(ROOT)) return 1
  const existing = fs
    .readdirSync(ROOT)
    .map((n) => /^round-(\d+)$/.exec(n)?.[1])
    .filter((x): x is string => Boolean(x))
    .map(Number)
  return existing.length === 0 ? 1 : Math.max(...existing) + 1
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
    `Dev server at ${BASE_URL} did not become ready within 60s: ${String(lastError)}`
  )
}

async function main() {
  await waitForServer()

  const round = nextRound()
  const outDir = path.join(ROOT, `round-${round}`)
  fs.mkdirSync(outDir, { recursive: true })

  const browser = await chromium.launch({ headless: true })

  try {
    for (const surface of SURFACES) {
      for (const viewport of surface.viewports) {
        const size = VIEWPORTS[viewport]
        const context = await browser.newContext({
          viewport: size,
          deviceScaleFactor: 2,
          colorScheme: 'light',
        })
        const page = await context.newPage()
        await page.goto(`${BASE_URL}${surface.path}`, {
          waitUntil: 'networkidle',
        })
        if (surface.setup) await surface.setup(page)

        const outPath = path.join(outDir, `${surface.name}-${viewport}.png`)
        await page.screenshot({ path: outPath, fullPage: true })
        // eslint-disable-next-line no-console
        console.log(`captured ${surface.name} @ ${viewport} -> ${outPath}`)
        await context.close()
      }
    }
  } finally {
    await browser.close()
  }

  // eslint-disable-next-line no-console
  console.log(`\nRound ${round} complete -> ${outDir}`)
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exit(1)
})
