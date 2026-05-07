import { Settings } from 'lucide-react'

import { EmptyState } from '@/components/states'

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-micro uppercase tracking-wider text-muted-foreground">Workspace</p>
        <h1 className="text-h1 font-semibold tracking-tight">Settings</h1>
        <p className="text-body text-muted-foreground">
          Profile, organizations, memberships, role management.
        </p>
      </header>
      <EmptyState
        icon={Settings}
        title="Coming soon"
        description="Account, org switcher, and membership management land with the auth-agent slice."
      />
    </div>
  )
}
