'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Save, X, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card'
import {
  summarizeAction,
  saveSummaryAsNoteAction,
  type SummarizeActionData,
} from '@/features/ai/server/ai-actions'

/**
 * Permission-safe AI summarizer (ADR-0006).
 *
 * Flow:
 *  1. User picks one or more notes from the visible list (parent owns the
 *     fetch — visibility is enforced server-side).
 *  2. Optional instruction scopes the summary (style, length, focus).
 *  3. Submit → `summarizeAction` → server invokes `services.ai.summarize`.
 *  4. Result renders in a card. The user must press "Save as note" for it
 *     to persist (review-before-accept). "Discard" clears the response.
 *
 * No streaming, no auto-save, no client-side LLM access.
 */

export interface SummarizableNote {
  id: string
  title: string
  visibility: 'private' | 'org' | 'shared'
}

export interface SummarizePanelProps {
  notes: SummarizableNote[]
}

type ViewState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'result'; data: SummarizeActionData }

export function SummarizePanel({ notes }: SummarizePanelProps) {
  const router = useRouter()
  const [picked, setPicked] = React.useState<Set<string>>(new Set())
  const [instruction, setInstruction] = React.useState('')
  const [state, setState] = React.useState<ViewState>({ kind: 'idle' })
  const [saving, setSaving] = React.useState(false)
  const [saveTitle, setSaveTitle] = React.useState('AI summary')
  const [saveError, setSaveError] = React.useState<string | null>(null)

  function togglePicked(id: string) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (picked.size === 0) {
      setState({ kind: 'error', message: 'Pick at least one note to summarize.' })
      return
    }
    setState({ kind: 'loading' })
    const result = await summarizeAction({
      noteIds: Array.from(picked),
      instruction: instruction.trim() ? instruction.trim() : undefined,
    })
    if (!result.ok) {
      const message =
        result.message ??
        (result.fieldErrors
          ? Object.values(result.fieldErrors).flat().join(' ')
          : 'Unable to summarize.')
      setState({ kind: 'error', message })
      return
    }
    setState({ kind: 'result', data: result.data })
  }

  function discard() {
    setState({ kind: 'idle' })
    setSaveError(null)
    setSaveTitle('AI summary')
  }

  async function onSave() {
    if (state.kind !== 'result') return
    setSaveError(null)
    setSaving(true)
    const result = await saveSummaryAsNoteAction({
      title: saveTitle.trim() || 'AI summary',
      content: state.data.summary,
    })
    setSaving(false)
    if (!result.ok) {
      setSaveError(result.message ?? 'Unable to save note.')
      return
    }
    router.push(`/notes/${result.data.id}`)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Summarize notes</CardTitle>
          <CardDescription>
            Pick one or more notes you can read. The AI sees only those — it
            cannot reach other notes in your workspace.
          </CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="text-small font-medium">Notes</legend>
              {notes.length === 0 ? (
                <p className="text-small text-muted-foreground">
                  You have no notes yet. Create one first.
                </p>
              ) : (
                <ul className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                  {notes.map((n) => {
                    const id = `note-${n.id}`
                    return (
                      <li key={n.id} className="flex items-center gap-2">
                        <input
                          id={id}
                          type="checkbox"
                          checked={picked.has(n.id)}
                          onChange={() => togglePicked(n.id)}
                          className="size-4 rounded border-border"
                        />
                        <label
                          htmlFor={id}
                          className="flex flex-1 items-center justify-between gap-2 text-small"
                        >
                          <span className="truncate">{n.title}</span>
                          <span className="text-micro uppercase tracking-wider text-muted-foreground">
                            {n.visibility}
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              )}
            </fieldset>

            <div className="space-y-2">
              <Label htmlFor="instruction">Instruction (optional)</Label>
              <Input
                id="instruction"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="e.g. one-paragraph TLDR; bullet list; focus on action items"
                maxLength={1000}
                autoComplete="off"
              />
              <p className="text-micro text-muted-foreground">
                The model treats note content as untrusted data — instructions
                inside notes are ignored.
              </p>
            </div>

            {state.kind === 'error' ? (
              <p
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-small text-destructive"
              >
                {state.message}
              </p>
            ) : null}
          </CardContent>
          <CardFooter className="flex items-center justify-between gap-2">
            <p className="text-micro text-muted-foreground">
              {picked.size} selected
            </p>
            <Button
              type="submit"
              disabled={state.kind === 'loading' || picked.size === 0}
            >
              {state.kind === 'loading' ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Summarizing…
                </>
              ) : (
                <>
                  <Sparkles className="size-4" aria-hidden="true" />
                  Summarize
                </>
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>

      {state.kind === 'result' ? (
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
            <CardDescription>
              Built from {state.data.noteIdsUsed.length}{' '}
              {state.data.noteIdsUsed.length === 1 ? 'note' : 'notes'} you can
              read. Review before saving.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <pre className="whitespace-pre-wrap break-words rounded-md border border-border bg-muted/30 p-3 text-small">
              {state.data.summary}
            </pre>
            <div className="space-y-2">
              <Label htmlFor="save-title">Save as note title</Label>
              <Input
                id="save-title"
                value={saveTitle}
                onChange={(e) => setSaveTitle(e.target.value)}
                maxLength={200}
                autoComplete="off"
              />
              <p className="text-micro text-muted-foreground">
                Saves a new note with visibility <strong>private</strong>. You
                can re-share it later.
              </p>
            </div>
            {saveError ? (
              <p
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-small text-destructive"
              >
                {saveError}
              </p>
            ) : null}
          </CardContent>
          <CardFooter className="flex items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={discard}>
              <X className="size-4" aria-hidden="true" />
              Discard
            </Button>
            <Button type="button" onClick={onSave} disabled={saving}>
              {saving ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="size-4" aria-hidden="true" />
              )}
              Save as note
            </Button>
          </CardFooter>
        </Card>
      ) : null}
    </div>
  )
}
