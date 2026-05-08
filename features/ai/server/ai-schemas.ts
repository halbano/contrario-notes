import { z } from 'zod'

/**
 * Shared Zod schemas for AI server actions. Lives outside the
 * `'use server'` actions module because Server Actions modules may only
 * export async functions.
 */
export const summarizeSchema = z.object({
  noteIds: z.array(z.string().uuid()).min(1, 'Pick at least one note.').max(50),
  instruction: z.string().trim().max(1000).optional(),
})

export const saveSummarySchema = z.object({
  title: z.string().trim().min(1, 'Title is required.').max(200),
  content: z.string().min(1).max(50_000),
})

export type SummarizeData = z.infer<typeof summarizeSchema>
export type SaveSummaryData = z.infer<typeof saveSummarySchema>

export type AiActionResult<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; message?: string; fieldErrors?: Record<string, string[]> }
