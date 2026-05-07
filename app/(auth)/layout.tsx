import * as React from 'react'
import Link from 'next/link'

import { Logo } from '@/components/brand/logo'

/**
 * Auth layout. No app shell; centred card on a calm background per
 * DESIGN_INVARIANTS.md (typography-first, low density).
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between px-4 py-4 md:px-8">
        <Logo />
        <Link
          href="/"
          className="text-small text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Back to home
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">{children}</div>
      </main>
      <footer className="px-4 py-6 text-center text-micro text-muted-foreground md:px-8">
        Contrario Notes
      </footer>
    </div>
  )
}
