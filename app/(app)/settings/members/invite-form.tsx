'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { inviteMemberByEmailAction } from '@/features/orgs/server/orgs-actions'

type Banner =
  | { tone: 'success'; message: string }
  | { tone: 'error'; message: string }
  | null

/**
 * Members invite form (VAL-18). Posts to `inviteMemberByEmailAction` and
 * shows a status-specific banner ("Added existing user X" vs "Invite email
 * sent to X" vs "X is already a member").
 */
export function InviteForm() {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const [banner, setBanner] = React.useState<Banner>(null)
  const [email, setEmail] = React.useState('')
  const [role, setRole] = React.useState<'admin' | 'member' | 'viewer'>('member')

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    setBanner(null)
    const fd = new FormData()
    fd.set('email', email.trim())
    fd.set('role', role)
    const result = await inviteMemberByEmailAction(fd)
    setPending(false)
    if (result.ok) {
      const label = email.trim()
      const message =
        result.status === 'added'
          ? `Added ${label} to this org.`
          : result.status === 'invited'
            ? `Invite email sent to ${label}.`
            : `${label} is already a member of this org.`
      setBanner({ tone: 'success', message })
      setEmail('')
      router.refresh()
      return
    }
    setBanner({
      tone: 'error',
      message: result.message ?? 'Unable to send invite.',
    })
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {banner ? (
        <div
          role="status"
          className={
            banner.tone === 'success'
              ? 'rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-small text-emerald-900'
              : 'rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-small text-destructive'
          }
        >
          {banner.message}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-[1fr_160px_auto] md:items-end">
        <div className="space-y-2">
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            name="email"
            type="email"
            required
            placeholder="teammate@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="invite-role">Role</Label>
          <select
            id="invite-role"
            name="role"
            value={role}
            onChange={(e) =>
              setRole(e.target.value as 'admin' | 'member' | 'viewer')
            }
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-small shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>
        <Button type="submit" disabled={pending || !email.trim()}>
          {pending ? 'Sending…' : 'Invite'}
        </Button>
      </div>
    </form>
  )
}
