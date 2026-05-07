/**
 * Foundation-phase placeholder. Empty themed shell.
 * The frontend-builder-agent owns the real layout (top bar + side nav),
 * org switcher, and auth screens.
 */
export default function HomePage() {
  return (
    <main className="container flex min-h-screen items-center justify-center py-16">
      <section className="max-w-md space-y-4 text-center">
        <p className="text-sm uppercase tracking-widest text-muted-foreground">
          Contrario Notes
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Foundation ready.</h1>
        <p className="text-muted-foreground">
          Theme, schema, scoped services, and tenancy guardrails are in place.
          Feature pages land in subsequent branches.
        </p>
      </section>
    </main>
  )
}
