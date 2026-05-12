'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  shareNoteAction,
  unshareNoteAction,
} from '@/features/notes/server/notes-actions'

/**
 * Panel for managing per-user share grants. Inputs are emails (Google
 * Drive-style); we resolve email → userId against the org member list the
 * host page already loaded. If the email doesn't match a current org
 * member, surface a hint pointing at the admin invite flow at
 * /settings/members. The server still enforces `canAttachToNote` /
 * `canShareNote` checks.
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
  const [error, setError] = React.useState<React.ReactNode | null>(null)
  const [email, setEmail] = React.useState('')
  const [canEdit, setCanEdit] = React.useState(false)

  const sharedSet = new Set(shares.map((s) => s.userId))
  const memberByEmail = React.useMemo(() => {
    const m = new Map<string, OrgMember>()
    for (const member of orgMembers) {
      m.set(member.email.toLowerCase(), member)
    }
    return m
  }, [orgMembers])

  async function onShare(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const normalized = email.trim().toLowerCase()
    if (!normalized) return
    setError(null)

    const member = memberByEmail.get(normalized)
    if (!member) {
      setError(
        <>
          <strong>{email.trim()}</strong> is not a member of this org. Invite
          them first from{' '}
          <Link href="/settings/members" className="underline">
            Settings → Members
          </Link>
          .
        </>,
      )
      return
    }
    if (sharedSet.has(member.userId)) {
      setError('That member already has access to this note.')
      return
    }

    setPending('add')
    const result = await shareNoteAction({
      noteId,
      userId: member.userId,
      canEdit,
    })
    setPending(null)
    if (!result.ok) {
      setError(result.message ?? 'Unable to share.')
      return
    }
    setEmail('')
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
          Share with org members by email.
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
                  {s.email} · {s.canEdit ? 'Can edit' : 'Read only'}
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
          <Label htmlFor="share-email">Email</Label>
          <Input
            id="share-email"
            type="email"
            inputMode="email"
            autoComplete="off"
            placeholder="teammate@yourcompany.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            list="share-email-suggestions"
            required
          />
          <datalist id="share-email-suggestions">
            {orgMembers
              .filter((m) => !sharedSet.has(m.userId))
              .map((m) => (
                <option key={m.userId} value={m.email}>
                  {m.displayName ?? m.email}
                </option>
              ))}
          </datalist>
          <p className="text-micro text-muted-foreground">
            Must be a current member of this org.{' '}
            <Link href="/settings/members" className="underline">
              Invite a new member
            </Link>{' '}
            from Settings.
          </p>
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
        <Button type="submit" disabled={!email.trim() || pending === 'add'}>
          {pending === 'add' ? 'Sharing…' : 'Share'}
        </Button>
      </form>
    </section>
  )
}
