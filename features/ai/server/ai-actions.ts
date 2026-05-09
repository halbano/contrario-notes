'use server'

/**
 * AI server actions.
 *
 * Validates input via Zod, builds the per-request scoped services, then
 * delegates to `services.ai.*`. UI calls these via React Server Actions
 * (`<form action={...}>` or `await action(payload)` from a client component).
 *
 * Security:
 *  - All AI work goes through `services.ai.*` — never direct LLM SDK use.
 *  - Visibility / role / rate-limit checks live inside the service layer;
 *    the action is a thin validate-and-dispatch shell.
 *  - "Save as note" creates a new note with visibility=private by default
 *    so AI output never leaks outside the user's own scope without an
 *    explicit visibility change later.
 */

import { revalidatePath } from 'next/cache'
import { type ZodError } from 'zod'
import { getRequestContext } from '@/lib/auth-context'
import { createScopedServices } from '@/services'
import { isAppError } from '@/lib/errors'
import {
  summarizeSchema,
  saveSummarySchema,
  type AiActionResult,
} from './ai-schemas'

function flatten(err: ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(err.flatten().fieldErrors)) {
    if (v && v.length > 0) out[k] = v
  }
  return out
}

function toResult(e: unknown): AiActionResult<never> {
  if (isAppError(e)) {
    return { ok: false, message: e.message }
  }
  return { ok: false, message: 'Something went wrong.' }
}

export type SummarizeActionData = {
  summary: string
  noteIdsUsed: string[]
  templateId: string
  promptHash: string
}

/**
 * Summarize the visible subset of `noteIds`.
 *
 * Returns `ok: false` with a friendly message on rate-limit or zero-survivor
 * permission failures. The UI surfaces those without exposing internals.
 */
export async function summarizeAction(
  raw: unknown,
): Promise<AiActionResult<SummarizeActionData>> {
  const parsed = summarizeSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, fieldErrors: flatten(parsed.error) }
  }
  try {
    const ctx = await getRequestContext()
    const services = createScopedServices(ctx)
    const result = await services.ai.summarize({
      noteIds: parsed.data.noteIds,
      instruction: parsed.data.instruction,
    })
    return {
      ok: true,
      data: {
        summary: result.summary,
        noteIdsUsed: result.noteIdsUsed,
        templateId: result.templateId,
        promptHash: result.promptHash,
      },
    }
  } catch (e) {
    return toResult(e)
  }
}

/**
 * Save an AI-generated summary as a new note. Review-before-accept: the
 * user must press "Save as note" — we never auto-persist. Visibility is
 * forced to `private` so the new note is scoped to its creator only.
 */
export async function saveSummaryAsNoteAction(
  raw: unknown,
): Promise<AiActionResult<{ id: string }>> {
  const parsed = saveSummarySchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, fieldErrors: flatten(parsed.error) }
  }
  try {
    const ctx = await getRequestContext()
    const services = createScopedServices(ctx)
    const note = await services.notes.create({
      authorId: ctx.userId,
      title: parsed.data.title,
      content: parsed.data.content,
      visibility: 'private',
    })
    revalidatePath('/notes')
    return { ok: true, data: { id: note.id } }
  } catch (e) {
    return toResult(e)
  }
}
