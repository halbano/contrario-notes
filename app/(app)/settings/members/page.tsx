import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

import { getRequestContext } from '@/lib/auth-context'
import { createScopedServices } from '@/services'
import { EmptyState } from '@/components/states'
import { Users } from 'lucide-react'

import { InviteForm } from './invite-form'
import { MemberRow } from './member-row'

// The members panel reads memberships + writes during invite/role-change.
// Force dynamic rendering — there's no useful prerender for this surface.
export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Members · Settings · Contrario Notes',
}

/**
 * /settings/members (VAL-18). Admin-only invite + role management for the
 * current org. Non-admins still see the page but get an empty-state nudge
 * — we deliberately do NOT 404 (it isn't a secret that the page exists).
 *
 * Mutation paths:
 *   - InviteForm → inviteMemberByEmailAction
 *   - MemberRow  → changeMemberRoleAction / removeMemberAction
 *
 * All three actions call back into services.orgs.* which holds the
 * canonical admin gate; the UI only mirrors that for affordance reasons.
 */
export default async function MembersPage() {
  const ctx = await getRequestContext()
  const services = createScopedServices(ctx)
  const canManage = ctx.role === 'admin'
  const members = await services.orgs.listMembershipsWithUsers()

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 text-small text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Settings
        </Link>
      </div>
      <header className="space-y-2">
        <p className="text-micro uppercase tracking-wider text-muted-foreground">
          Workspace
        </p>
        <h1 className="text-h1 font-semibold tracking-tight">Members</h1>
        <p className="text-body text-muted-foreground">
          Invite teammates by email and manage roles for the current
          organization.
        </p>
      </header>

      {canManage ? (
        <section
          aria-labelledby="invite-heading"
          className="rounded-lg border border-border bg-card p-4"
        >
          <h2 id="invite-heading" className="text-h3 font-medium">
            Invite a member
          </h2>
          <p className="mb-4 text-small text-muted-foreground">
            Existing users are added immediately. New emails receive an
            invite email.
          </p>
          <InviteForm />
        </section>
      ) : (
        <EmptyState
          icon={Users}
          title="Only admins can manage members"
          description="Ask an admin in this org to invite teammates or change roles."
        />
      )}

      <section aria-labelledby="members-heading" className="space-y-3">
        <h2 id="members-heading" className="text-h3 font-medium">
          Current members
        </h2>
        {members.length === 0 ? (
          <p className="text-small text-muted-foreground">No members yet.</p>
        ) : (
          <ul className="overflow-hidden rounded-lg border border-border bg-card">
            {members.map((m) => (
              <MemberRow
                key={m.id}
                membershipId={m.id}
                email={m.email}
                displayName={m.displayName}
                role={m.role as 'admin' | 'member' | 'viewer'}
                joinedAt={m.createdAt.toISOString()}
                canManage={canManage}
                isCurrentUser={m.userId === ctx.userId}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
