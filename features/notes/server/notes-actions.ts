'use server'

/**
 * Notes server actions.
 *
 * Validates input via Zod, builds the per-request scoped services, then
 * delegates to `services.notes.*`. UI calls these via React Server Actions
 * (`<form action={...}>` or `await action(payload)` from a client component).
 *
 * Security:
 *  - All writes go through `services.notes.*` — never direct repo or db.
 *  - Visibility / role checks live inside the service layer; the action is
 *    a thin validate-and-dispatch shell.
 *  - Errors map to 404 for permission issues (avoid existence disclosure).
 */

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z, type ZodError } from 'zod'
import { getRequestContext } from '@/lib/auth-context'
import { createScopedServices } from '@/services'
import { AppError, isAppError } from '@/lib/errors'
import {
  createNoteSchema,
  deleteNoteSchema,
  updateNoteSchema,
  shareNoteSchema,
  unshareNoteSchema,
  type NoteActionResult,
} from './note-schemas'

function flatten(err: ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(err.flatten().fieldErrors)) {
    if (v && v.length > 0) out[k] = v
  }
  return out
}

function toResult(e: unknown): NoteActionResult<never> {
  if (isAppError(e)) {
    return { ok: false, message: e.message }
  }
  return { ok: false, message: 'Something went wrong.' }
}

/**
 * Create a new note. Snapshots v=1 transactionally.
 *
 * Returns a `NoteActionResult` carrying the created note's id on success
 * so the client can navigate to `/notes/[id]`.
 */
export async function createNoteAction(
  raw: unknown,
): Promise<NoteActionResult<{ id: string }>> {
  const parsed = createNoteSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, fieldErrors: flatten(parsed.error) }
  }
  try {
    const ctx = await getRequestContext()
    const services = createScopedServices(ctx)
    const note = await services.notes.createWithVersion({
      authorId: ctx.userId,
      title: parsed.data.title,
      content: parsed.data.content,
      visibility: parsed.data.visibility,
    })
    if (parsed.data.tags.length > 0) {
      await services.notes.setNoteTags(note.id, parsed.data.tags)
    }
    revalidatePath('/notes')
    return { ok: true, data: { id: note.id } }
  } catch (e) {
    return toResult(e)
  }
}

export async function updateNoteAction(
  raw: unknown,
): Promise<NoteActionResult<{ id: string }>> {
  const parsed = updateNoteSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, fieldErrors: flatten(parsed.error) }
  }
  try {
    const { id, tags, ...patch } = parsed.data
    const ctx = await getRequestContext()
    const services = createScopedServices(ctx)
    const note = await services.notes.updateWithVersion(id, patch)
    if (tags !== undefined) {
      await services.notes.setNoteTags(note.id, tags)
    }
    revalidatePath('/notes')
    revalidatePath(`/notes/${id}`)
    return { ok: true, data: { id: note.id } }
  } catch (e) {
    return toResult(e)
  }
}

export async function deleteNoteAction(
  raw: unknown,
): Promise<NoteActionResult> {
  const parsed = deleteNoteSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, fieldErrors: flatten(parsed.error) }
  }
  try {
    const ctx = await getRequestContext()
    const services = createScopedServices(ctx)
    await services.notes.remove(parsed.data.id)
    revalidatePath('/notes')
    return { ok: true }
  } catch (e) {
    return toResult(e)
  }
}

export async function shareNoteAction(
  raw: unknown,
): Promise<NoteActionResult> {
  const parsed = shareNoteSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, fieldErrors: flatten(parsed.error) }
  }
  try {
    const ctx = await getRequestContext()
    const services = createScopedServices(ctx)
    await services.notes.shareNote(parsed.data)
    revalidatePath(`/notes/${parsed.data.noteId}`)
    return { ok: true }
  } catch (e) {
    return toResult(e)
  }
}

export async function unshareNoteAction(
  raw: unknown,
): Promise<NoteActionResult> {
  const parsed = unshareNoteSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, fieldErrors: flatten(parsed.error) }
  }
  try {
    const ctx = await getRequestContext()
    const services = createScopedServices(ctx)
    await services.notes.unshareNote(parsed.data.noteId, parsed.data.userId)
    revalidatePath(`/notes/${parsed.data.noteId}`)
    return { ok: true }
  } catch (e) {
    return toResult(e)
  }
}

/**
 * Form-flavored variant for `<form action={...}>` flows: takes a FormData
 * and redirects on success. Use this from server-rendered UI.
 */
export async function createNoteFormAction(formData: FormData): Promise<void> {
  const tagsRaw = String(formData.get('tags') ?? '')
  const tags = tagsRaw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
  const result = await createNoteAction({
    title: formData.get('title'),
    content: formData.get('content'),
    visibility: formData.get('visibility') ?? 'org',
    tags,
  })
  if (!result.ok) {
    // For form-action callers we just throw so the framework's error UI
    // surfaces — clients that want field errors should call
    // `createNoteAction` directly.
    throw new AppError('invalid_input', result.message ?? 'Validation failed')
  }
  redirect(`/notes/${result.data.id}`)
}

// Help tree-shaking — re-export only what's needed.
export { z }
