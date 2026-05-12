import Link from 'next/link'
import { Users } from 'lucide-react'

/**
 * Workspace settings overview. Currently a thin index page — the bulk of
 * settings UI lives behind nested routes (e.g. /settings/members).
 */
export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-micro uppercase tracking-wider text-muted-foreground">
          Workspace
        </p>
        <h1 className="text-h1 font-semibold tracking-tight">Settings</h1>
        <p className="text-body text-muted-foreground">
          Manage your organization, members, and account.
        </p>
      </header>

      <nav aria-label="Settings sections" className="space-y-2">
        <Link
          href="/settings/members"
          className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:bg-accent"
        >
          <div className="flex items-center gap-3">
            <Users className="size-5 text-muted-foreground" aria-hidden="true" />
            <div>
              <p className="text-small font-medium">Members</p>
              <p className="text-micro text-muted-foreground">
                Invite teammates by email and manage roles.
              </p>
            </div>
          </div>
          <span aria-hidden="true" className="text-muted-foreground">
            →
          </span>
        </Link>
      </nav>
    </div>
  )
}
