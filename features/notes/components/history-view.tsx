'use client'

import * as React from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { EmptyState } from '@/components/states'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { History } from 'lucide-react'
import { VersionDiffView } from './version-diff'
import type { VersionDiff } from '@/services/notes-service'

/**
 * Two-pane history viewer. The left rail lists versions; the right pane
 * shows the diff between the two currently-selected ids. Selection is
 * round-tripped through search params (`?a=...&b=...`) so navigation /
 * deep linking works.
 */
export interface HistoryVersion {
  id: string
  version: number
  createdAt: Date | string
}

export interface HistoryViewProps {
  noteId: string
  versions: HistoryVersion[]
  selectedAId?: string
  selectedBId?: string
  diff: VersionDiff | null
}

export function HistoryView({
  versions,
  selectedAId,
  selectedBId,
  diff,
}: HistoryViewProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function pick(side: 'a' | 'b', id: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    params.set(side, id)
    router.replace(`${pathname}?${params.toString()}`)
  }

  if (versions.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No history yet"
        description="Save changes to this note to start a version trail."
      />
    )
  }

  const sorted = [...versions].sort((a, b) => b.version - a.version)

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="space-y-2 rounded-lg border border-border bg-card p-3">
        <h2 className="text-h4 font-semibold tracking-tight">Versions</h2>
        <ul className="space-y-1">
          {sorted.map((v) => {
            const isA = v.id === selectedAId
            const isB = v.id === selectedBId
            return (
              <li key={v.id}>
                <div
                  className={`flex items-center justify-between gap-2 rounded px-2 py-1.5 text-small ${
                    isA || isB ? 'bg-accent/50' : ''
                  }`}
                >
                  <div>
                    <p className="font-medium">v{v.version}</p>
                    <p className="text-micro text-muted-foreground">
                      {new Date(v.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant={isA ? 'default' : 'outline'}
                      onClick={() => pick('a', v.id)}
                      aria-pressed={isA}
                    >
                      A
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={isB ? 'default' : 'outline'}
                      onClick={() => pick('b', v.id)}
                      aria-pressed={isB}
                    >
                      B
                    </Button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </aside>

      <section>
        <Label className="mb-2 block">Diff</Label>
        {diff ? (
          <VersionDiffView diff={diff} />
        ) : (
          <p className="text-small text-muted-foreground">
            Select two different versions to compare.
          </p>
        )}
      </section>
    </div>
  )
}
