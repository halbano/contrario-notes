import { Sparkles } from 'lucide-react'

import { EmptyState } from '@/components/states'

export default function AiPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-micro uppercase tracking-wider text-muted-foreground">Workspace</p>
        <h1 className="text-h1 font-semibold tracking-tight">AI</h1>
        <p className="text-body text-muted-foreground">
          Structured summaries over notes you can already read. Review before saving.
        </p>
      </header>
      <EmptyState
        icon={Sparkles}
        title="Coming soon"
        description="Permission-safe AI summaries with rate-limited prompt logging land with the search-ai-agent slice."
      />
    </div>
  )
}
