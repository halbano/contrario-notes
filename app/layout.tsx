import type { Metadata } from 'next'
import '@/styles/globals.css'

export const metadata: Metadata = {
  title: 'Contrario Notes',
  description: 'Multi-tenant team notes',
}

/**
 * Root layout. Provides theme tokens, system font stack, and the skip-link
 * required for keyboard accessibility. Route groups `(app)` and `(auth)`
 * supply their own visual frames.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className="min-h-screen bg-background font-sans text-foreground antialiased"
        style={{
          // System font stack — keeps the project network-free and fast.
          ['--font-sans' as never]:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        }}
      >
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-foreground focus:px-3 focus:py-2 focus:text-small focus:text-background"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  )
}
