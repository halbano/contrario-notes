import { Search as SearchIcon, FileText } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorState } from '@/components/states'
import { getRequestContext } from '@/lib/auth-context'
import { createScopedServices } from '@/services'
import { isAppError } from '@/lib/errors'
import { SearchResults } from '@/features/search/components/search-results'

/**
 * Permission-safe full-text search page.
 *
 *  - Server component. Reads `?q=` from the URL.
 *  - Calls services.search.query — visibility filter is in SQL.
 *  - Renders title + content snippet + visibility chip per result.
 *  - Form GETs to the same path so the URL is shareable / bookmarkable.
 *
 * UI primitives: shadcn (Input, Button) + the local states helpers.
 */

interface SearchPageProps {
  searchParams: Promise<{ q?: string | string[] }>
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams
  const raw = params.q
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? ''

  let results: Awaited<ReturnType<typeof runSearch>> = []
  let errorMessage: string | null = null
  let invalid = false

  if (q.length > 0) {
    try {
      results = await runSearch(q)
    } catch (e) {
      if (isAppError(e) && e.code === 'invalid_input') {
        invalid = true
      } else {
        errorMessage = 'Unable to run search. Sign in and try again.'
      }
    }
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-micro uppercase tracking-wider text-muted-foreground">
          Workspace
        </p>
        <h1 className="text-h1 font-semibold tracking-tight">Search</h1>
        <p className="text-body text-muted-foreground">
          Permission-safe full-text search across notes you can read.
        </p>
      </header>

      <form
        action="/search"
        method="GET"
        role="search"
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
      >
        <label htmlFor="q" className="sr-only">
          Search query
        </label>
        <div className="relative flex-1">
          <SearchIcon
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Search titles, content, and tags…"
            className="pl-9"
            autoComplete="off"
            autoFocus
          />
        </div>
        <Button type="submit">Search</Button>
      </form>

      {errorMessage ? (
        <ErrorState title="Search unavailable" description={errorMessage} />
      ) : invalid ? (
        <ErrorState
          title="Invalid query"
          description="Queries must be between 1 and 200 characters."
        />
      ) : q.length === 0 ? (
        <EmptyState
          icon={SearchIcon}
          title="Start typing to search"
          description="Results respect note visibility — private notes only show for their authors, shared notes only for grantees."
        />
      ) : results.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No matches"
          description={`No notes match “${q}” in this organization.`}
        />
      ) : (
        <SearchResults results={results} query={q} />
      )}
    </div>
  )
}

async function runSearch(q: string) {
  const ctx = await getRequestContext()
  const services = createScopedServices(ctx)
  return services.search.query({ query: q, limit: 50 })
}
