'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import {
  changeMemberRoleAction,
  removeMemberAction,
} from '@/features/orgs/server/orgs-actions'

type Role = 'admin' | 'member' | 'viewer'

export interface MemberRowProps {
  membershipId: string
  email: string
  displayName: string | null
  role: Role
  joinedAt: string
  canManage: boolean
  isCurrentUser: boolean
}

/**
 * One member row inside the members panel. The row is the smallest atom the
 * admin can mutate (role change + removal) so we keep the form scope tight.
 */
export function MemberRow(props: MemberRowProps) {
  const router = useRouter()
  const [role, setRole] = React.useState<Role>(props.role)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function onRoleChange(next: Role) {
    setRole(next)
    setPending(true)
    setError(null)
    const fd = new FormData()
    fd.set('membershipId', props.membershipId)
    fd.set('role', next)
    const result = await changeMemberRoleAction(fd)
    setPending(false)
    if (!result.ok) {
      setError(result.message ?? 'Failed to change role.')
      setRole(props.role)
      return
    }
    router.refresh()
  }

  async function onRemove() {
    if (!confirm(`Remove ${props.email} from this org?`)) return
    setPending(true)
    setError(null)
    const fd = new FormData()
    fd.set('membershipId', props.membershipId)
    const result = await removeMemberAction(fd)
    setPending(false)
    if (!result.ok) {
      setError(result.message ?? 'Failed to remove member.')
      return
    }
    router.refresh()
  }

  return (
    <li className="flex flex-col gap-2 border-b border-border px-4 py-3 md:flex-row md:items-center md:gap-4">
      <div className="flex-1 min-w-0">
        <p className="truncate text-small font-medium">
          {props.displayName ?? props.email}
        </p>
        {props.displayName ? (
          <p className="truncate text-micro text-muted-foreground">{props.email}</p>
        ) : null}
        <p className="text-micro text-muted-foreground">
          Joined {new Date(props.joinedAt).toLocaleDateString()}
        </p>
      </div>
      {error ? (
        <p role="alert" className="text-micro text-destructive">
          {error}
        </p>
      ) : null}
      {props.canManage ? (
        <div className="flex items-center gap-2">
          <select
            aria-label={`Role for ${props.email}`}
            value={role}
            disabled={pending}
            onChange={(e) => onRoleChange(e.target.value as Role)}
            className="h-9 rounded-md border border-input bg-background px-2 py-1 text-small"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
            <option value="viewer">Viewer</option>
          </select>
          <Button
            type="button"
            variant="outline"
            disabled={pending || props.isCurrentUser}
            onClick={onRemove}
          >
            Remove
          </Button>
        </div>
      ) : (
        <span className="text-small capitalize text-muted-foreground">
          {role}
        </span>
      )}
    </li>
  )
}
