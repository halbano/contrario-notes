import type { Metadata } from 'next'
import '@/styles/globals.css'

export const metadata: Metadata = {
  title: 'Contrario Notes',
  description: 'Multi-tenant team notes',
}

/**
 * Root layout. Foundation phase: just a themed shell. Feature pages (notes,
 * search, files, AI) are owned by other agents; nothing renders here yet.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  )
}
