'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ErrorState } from '@/components/states'
import { createFirstOrgAction } from '@/features/orgs/server/orgs-actions'

/**
 * First-org form (VAL-09).
 *
 * Wraps `createFirstOrgAction` (already tested at the action level). Two
 * inputs: slug (URL-safe id) and human-readable name.
 *
 * Slug rules match `services/orgs-service.createOrg`:
 *   - lowercase, alphanumerics + hyphens
 *   - 2..40 chars
 *   - cannot start or end with a hyphen
 */
function deriveSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-\s]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

interface State {
  pending: boolean
  formError: string | null
}

const initial: State = { pending: false, formError: null }

export function CreateFirstOrgForm() {
  const router = useRouter()
  const [state, setState] = React.useState<State>(initial)
  const [name, setName] = React.useState('')
  const [slug, setSlug] = React.useState('')
  const [slugDirty, setSlugDirty] = React.useState(false)

  function onNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value
    setName(value)
    if (!slugDirty) setSlug(deriveSlug(value))
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setState({ pending: true, formError: null })
    const fd = new FormData()
    fd.set('name', name.trim())
    fd.set('slug', slug.trim())
    const result = await createFirstOrgAction(fd)
    if (result.ok) {
      // Cookie + JWT sync are done server-side; navigate home and let RSC
      // pick up the new RequestContext on the next render.
      router.replace('/')
      router.refresh()
      return
    }
    setState({ pending: false, formError: result.message ?? 'Unable to create organization.' })
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {state.formError ? (
        <ErrorState title="Unable to create organization" description={state.formError} />
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="name">Organization name</Label>
        <Input
          id="name"
          name="name"
          type="text"
          autoComplete="organization"
          required
          value={name}
          onChange={onNameChange}
          placeholder="Acme Studio"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="slug">URL slug</Label>
        <Input
          id="slug"
          name="slug"
          type="text"
          required
          value={slug}
          onChange={(e) => {
            setSlugDirty(true)
            setSlug(e.target.value)
          }}
          placeholder="acme-studio"
          aria-describedby="slug-hint"
        />
        <p id="slug-hint" className="text-small text-muted-foreground">
          Lowercase letters, numbers, and hyphens. 2–40 characters.
        </p>
      </div>

      <Button type="submit" className="w-full" disabled={state.pending || !name.trim() || !slug.trim()}>
        {state.pending ? 'Creating organization…' : 'Create organization'}
      </Button>
    </form>
  )
}
