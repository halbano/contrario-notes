'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  shareNoteAction,
  unshareNoteAction,
} from '@/features/notes/server/notes-actions'

/**
 * Panel for managing per-user share grants. The host page does the
 * permission check (only the author or org admin may render this) and
 * passes existing grants in. Add by user id from the org-members list.
 */
export interface ShareEntry {
  userId: string
  displayName: string | null
  email: string
  canEdit: boolean
}

export interface OrgMember {
  userId: string
  displayName: string | null
  email: string
}

export interface SharePanelProps {
  noteId: string
  shares: ShareEntry[]
  orgMembers: OrgMember[]
}

export function SharePanel({ noteId, shares, orgMembers }: SharePanelProps) {
  const router = useRouter()
  const [pending, setPending] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [pickedUserId, setPickedUserId] = React.useState<string>('')
  const [canEdit, setCanEdit] = React.useState(false)

  const sharedSet = new Set(shares.map((s) => s.userId))

  async function onShare(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!pickedUserId) return
    setError(null)
    setPending('add')
    const result = await shareNoteAction({ noteId, userId: pickedUserId, canEdit })
    setPending(null)
    if (!result.ok) {
      setError(result.message ?? 'Unable to share.')
      return
    }
    setPickedUserId('')
    setCanEdit(false)
    router.refresh()
  }

  async function onRevoke(userId: string) {
    setError(null)
    setPending(userId)
    const result = await unshareNoteAction({ noteId, userId })
    setPending(null)
    if (!result.ok) {
      setError(result.message ?? 'Unable to revoke.')
      return
    }
    router.refresh()
  }

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-4">
      <header>
        <h2 className="text-h3 font-semibold tracking-tight">Sharing</h2>
        <p className="text-small text-muted-foreground">
          Grant individual org members access to this note.
        </p>
      </header>

      {error ? (
        <p role="alert" className="text-small text-destructive">
          {error}
        </p>
      ) : null}

      <ul className="space-y-2">
        {shares.length === 0 ? (
          <li className="text-small text-muted-foreground">No grants yet.</li>
        ) : (
          shares.map((s) => (
            <li
              key={s.userId}
              className="flex items-center justify-between gap-3 rounded border border-border px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-small font-medium">
                  {s.displayName ?? s.email}
                </p>
                <p className="truncate text-micro text-muted-foreground">
                  {s.canEdit ? 'Can edit' : 'Read only'}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onRevoke(s.userId)}
                disabled={pending === s.userId}
              >
                {pending === s.userId ? 'Revoking…' : 'Revoke'}
              </Button>
            </li>
          ))
        )}
      </ul>

      <form onSubmit={onShare} className="space-y-3 border-t border-border pt-3">
        <div className="space-y-2">
          <Label htmlFor="share-user">Add member</Label>
          <select
            id="share-user"
            value={pickedUserId}
            onChange={(e) => setPickedUserId(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">Select a member…</option>
            {orgMembers.map((m) => {
              const alreadyShared = sharedSet.has(m.userId)
              const label = m.displayName ?? m.email
              return (
                <option
                  key={m.userId}
                  value={m.userId}
                  disabled={alreadyShared}
                >
                  {alreadyShared ? `${label} (already shared)` : label}
                </option>
              )
            })}
          </select>
        </div>
        <label className="flex items-center gap-2 text-small">
          <Input
            type="checkbox"
            checked={canEdit}
            onChange={(e) => setCanEdit(e.target.checked)}
            className="size-4"
          />
          Allow editing
        </label>
        <Button type="submit" disabled={!pickedUserId || pending === 'add'}>
          {pending === 'add' ? 'Sharing…' : 'Share'}
        </Button>
      </form>
    </section>
  )
}
