import { z } from 'zod'

/**
 * Shared Zod schemas for notes server actions. Lives outside the
 * `'use server'` actions module because Server Actions modules may only
 * export async functions.
 */
export const visibilityEnum = z.enum(['private', 'org', 'shared'])

export const createNoteSchema = z.object({
  title: z.string().trim().min(1, 'Title is required.').max(200),
  content: z.string().max(50_000).default(''),
  visibility: visibilityEnum.default('org'),
  tags: z.array(z.string().trim().min(1).max(40)).max(32).default([]),
})

export const updateNoteSchema = z.object({
  id: z.string().uuid('Invalid note id.'),
  title: z.string().trim().min(1).max(200).optional(),
  content: z.string().max(50_000).optional(),
  visibility: visibilityEnum.optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(32).optional(),
})

export const deleteNoteSchema = z.object({
  id: z.string().uuid('Invalid note id.'),
})

export const shareNoteSchema = z.object({
  noteId: z.string().uuid(),
  userId: z.string().uuid(),
  canEdit: z.boolean().default(false),
})

export const unshareNoteSchema = z.object({
  noteId: z.string().uuid(),
  userId: z.string().uuid(),
})

export type CreateNoteData = z.infer<typeof createNoteSchema>
export type UpdateNoteData = z.infer<typeof updateNoteSchema>

export type NoteActionResult<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; message?: string; fieldErrors?: Record<string, string[]> }
