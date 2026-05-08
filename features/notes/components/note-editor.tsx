'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ErrorState } from '@/components/states'
import {
  createNoteAction,
  updateNoteAction,
  deleteNoteAction,
} from '@/features/notes/server/notes-actions'
import {
  createNoteSchema,
  updateNoteSchema,
} from '@/features/notes/server/note-schemas'
import { TagInput } from './tag-input'

/**
 * Notes editor — used by both /notes/new (no `note`) and /notes/[id]
 * (with the row prefilled). All writes go through the server actions in
 * `features/notes/server/notes-actions.ts`.
 *
 * Form structure mirrors the auth screens: client-side Zod validation,
 * structured field errors, an aria-described error region.
 */
export interface NoteEditorProps {
  mode: 'create' | 'edit'
  note?: {
    id: string
    title: string
    content: string
    visibility: 'private' | 'org' | 'shared'
  }
  initialTags?: string[]
  /** All tags in the org for autocomplete suggestions. */
  tagSuggestions?: string[]
  /** When true, render a Delete button (edit mode only). */
  showDelete?: boolean
}

type FieldErrors = Record<string, string[]>
interface State {
  pending: boolean
  fieldErrors: FieldErrors
  formError: string | null
}
const initialState: State = { pending: false, fieldErrors: {}, formError: null }

export function NoteEditor({
  mode,
  note,
  initialTags = [],
  tagSuggestions = [],
  showDelete = false,
}: NoteEditorProps) {
  const router = useRouter()
  const [state, setState] = React.useState<State>(initialState)
  const [title, setTitle] = React.useState(note?.title ?? '')
  const [content, setContent] = React.useState(note?.content ?? '')
  const [visibility, setVisibility] = React.useState<
    'private' | 'org' | 'shared'
  >(note?.visibility ?? 'org')
  const [tags, setTags] = React.useState<string[]>(initialTags)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setState({ pending: true, fieldErrors: {}, formError: null })

    if (mode === 'create') {
      const parsed = createNoteSchema.safeParse({
        title,
        content,
        visibility,
        tags,
      })
      if (!parsed.success) {
        setState({
          pending: false,
          fieldErrors: parsed.error.flatten().fieldErrors as FieldErrors,
          formError: null,
        })
        return
      }
      const result = await createNoteAction(parsed.data)
      if (!result.ok) {
        setState({
          pending: false,
          fieldErrors: result.fieldErrors ?? {},
          formError: result.message ?? 'Unable to save note.',
        })
        return
      }
      router.push(`/notes/${result.data.id}`)
      router.refresh()
      return
    }

    if (!note) return
    const parsed = updateNoteSchema.safeParse({
      id: note.id,
      title,
      content,
      visibility,
      tags,
    })
    if (!parsed.success) {
      setState({
        pending: false,
        fieldErrors: parsed.error.flatten().fieldErrors as FieldErrors,
        formError: null,
      })
      return
    }
    const result = await updateNoteAction(parsed.data)
    if (!result.ok) {
      setState({
        pending: false,
        fieldErrors: result.fieldErrors ?? {},
        formError: result.message ?? 'Unable to save changes.',
      })
      return
    }
    setState(initialState)
    router.refresh()
  }

  async function onDelete() {
    if (!note) return
    if (!confirm('Delete this note? This cannot be undone.')) return
    setState({ pending: true, fieldErrors: {}, formError: null })
    const result = await deleteNoteAction({ id: note.id })
    if (!result.ok) {
      setState({
        pending: false,
        fieldErrors: {},
        formError: result.message ?? 'Unable to delete.',
      })
      return
    }
    router.push('/notes')
    router.refresh()
  }

  const titleErr = state.fieldErrors.title?.[0]
  const contentErr = state.fieldErrors.content?.[0]

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="space-y-5"
      aria-describedby={state.formError ? 'note-form-error' : undefined}
    >
      {state.formError ? (
        <div id="note-form-error">
          <ErrorState title="Save failed" description={state.formError} />
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={200}
          aria-invalid={Boolean(titleErr) || undefined}
          aria-describedby={titleErr ? 'title-error' : undefined}
        />
        {titleErr ? (
          <p id="title-error" className="text-small text-destructive">
            {titleErr}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="content">Content</Label>
        <textarea
          id="content"
          name="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={50_000}
          rows={12}
          className="flex min-h-[200px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-invalid={Boolean(contentErr) || undefined}
          aria-describedby={contentErr ? 'content-error' : undefined}
        />
        {contentErr ? (
          <p id="content-error" className="text-small text-destructive">
            {contentErr}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="visibility">Visibility</Label>
        <select
          id="visibility"
          name="visibility"
          value={visibility}
          onChange={(e) =>
            setVisibility(e.target.value as 'private' | 'org' | 'shared')
          }
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="org">Org — every member of the org can read</option>
          <option value="private">Private — only you can read</option>
          <option value="shared">Shared — only listed users can read</option>
        </select>
      </div>

      <div className="space-y-2">
        <Label>Tags</Label>
        <TagInput value={tags} onChange={setTags} suggestions={tagSuggestions} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={state.pending}>
          {state.pending
            ? 'Saving…'
            : mode === 'create'
              ? 'Create note'
              : 'Save changes'}
        </Button>
        {showDelete && note ? (
          <Button
            type="button"
            variant="destructive"
            onClick={onDelete}
            disabled={state.pending}
          >
            Delete
          </Button>
        ) : null}
      </div>
    </form>
  )
}
