import { z } from 'zod'

/**
 * Shared Zod schemas for file server actions. Lives outside the
 * `'use server'` actions module because Server Actions modules may only
 * export async functions.
 */

export const fileIdSchema = z.object({
  fileId: z.string().uuid('Invalid file id.'),
})

export const noteIdSchema = z.object({
  noteId: z.string().uuid('Invalid note id.').nullable(),
})

export type FileActionResult<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; message?: string; fieldErrors?: Record<string, string[]> }
