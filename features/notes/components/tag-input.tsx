'use client'

import * as React from 'react'
import { X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * Pure presentation tag input. Comma- or Enter-separated entries become
 * chips. Backspace on an empty input removes the last chip. A tiny
 * autocomplete pops up with org-tags whose names match the current draft.
 */
export interface TagInputProps {
  value: string[]
  onChange: (next: string[]) => void
  suggestions?: string[]
  className?: string
}

function normalize(s: string): string {
  return s.trim().toLowerCase()
}

export function TagInput({
  value,
  onChange,
  suggestions = [],
  className,
}: TagInputProps) {
  const [draft, setDraft] = React.useState('')

  const matches = React.useMemo(() => {
    const d = normalize(draft)
    if (!d) return []
    const present = new Set(value.map(normalize))
    return suggestions
      .filter((s) => normalize(s).includes(d) && !present.has(normalize(s)))
      .slice(0, 6)
  }, [draft, suggestions, value])

  function commit(raw: string) {
    const n = normalize(raw)
    if (!n) return
    if (value.map(normalize).includes(n)) return
    onChange([...value, n])
    setDraft('')
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commit(draft)
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-2 py-1.5">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
          >
            {tag}
            <button
              type="button"
              aria-label={`Remove tag ${tag}`}
              onClick={() => onChange(value.filter((t) => t !== tag))}
              className="rounded hover:bg-muted"
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </span>
        ))}
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => draft && commit(draft)}
          placeholder={value.length === 0 ? 'Add tags…' : ''}
          className="h-7 flex-1 min-w-[8ch] border-0 px-1 shadow-none focus-visible:ring-0"
        />
      </div>
      {matches.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Tag suggestions">
          {matches.map((s) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => commit(s)}
                className="rounded border border-border bg-background px-2 py-0.5 text-xs hover:bg-accent"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
