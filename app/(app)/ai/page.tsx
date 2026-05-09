import { Sparkles } from 'lucide-react'

import { EmptyState, ErrorState } from '@/components/states'
import { getRequestContext } from '@/lib/auth-context'
import { createScopedServices } from '@/services'
import { SummarizePanel } from '@/features/ai/components/summarize-panel'

/**
 * Permission-safe AI summary page (ADR-0006).
 *
 *  - Server component. Loads the visible-notes list (same SQL predicate as
 *    /notes) and hands it to the client panel.
 *  - The panel posts selected ids to `summarizeAction`, which calls
 *    `services.ai.summarize`. The visibility filter is re-applied server-side
 *    so a forged id list cannot leak hidden notes.
 *  - Review-before-accept: the AI's response is rendered, then the user
 *    presses "Save as note" or "Discard".
 */

export default async function AiPage() {
  let notes
  try {
    const ctx = await getRequestContext()
    const services = createScopedServices(ctx)
    notes = await services.notes.listVisible({ limit: 100 })
  } catch {
    return (
      <div className="space-y-6">
        <header className="space-y-2">
          <p className="text-micro uppercase tracking-wider text-muted-foreground">
            Workspace
          </p>
          <h1 className="text-h1 font-semibold tracking-tight">AI</h1>
        </header>
        <ErrorState
          title="Unable to load notes"
          description="Sign in and try again."
        />
      </div>
    )
  }

  const summarizable = notes.map((n) => ({
    id: n.id,
    title: n.title,
    visibility: n.visibility,
  }))

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-micro uppercase tracking-wider text-muted-foreground">
          Workspace
        </p>
        <h1 className="text-h1 font-semibold tracking-tight">AI</h1>
        <p className="text-body text-muted-foreground">
          Structured summaries over notes you can already read. Review before
          saving.
        </p>
      </header>

      {summarizable.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No notes to summarize"
          description="Create a note first, then come back here to generate a summary."
        />
      ) : (
        <SummarizePanel notes={summarizable} />
      )}
    </div>
  )
}
