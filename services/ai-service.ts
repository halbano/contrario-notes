import { z } from 'zod'
import { AppError } from '@/lib/errors'
import type { Repositories } from '@/repositories'
import type { RequestContext } from '@/lib/request-context'
import { LOG_EVENTS, type Logger } from '@/logging'
import {
  createAnthropicClient,
  DEFAULT_AI_MODEL,
  type AnthropicClient,
} from '@/lib/anthropic'
import { aiRateLimiter, type RateLimiter } from './ai-rate-limiter'
import { buildNoteSummaryPrompt } from './ai-prompt-builder'
import { createNotesService } from './notes-service'

export const summarizeInputSchema = z.object({
  noteIds: z.array(z.string().uuid()).min(1).max(50),
  instruction: z.string().trim().max(1000).optional(),
})

export type SummarizeInput = z.input<typeof summarizeInputSchema>

export type SummarizeResult = {
  summary: string
  noteIdsUsed: string[]
  templateId: string
  promptHash: string
}

export type AiServiceDeps = {
  /** Override for tests — pass a fake Anthropic client. */
  anthropicClient?: AnthropicClient
  /** Override for tests — pass a freshly built rate limiter. */
  rateLimiter?: RateLimiter
  model?: string
}

export type AiService = ReturnType<typeof createAiService>

export function createAiService(
  ctx: RequestContext,
  repos: Repositories,
  logger: Logger,
  deps: AiServiceDeps = {},
) {
  const client = deps.anthropicClient ?? createAnthropicClient()
  const limiter = deps.rateLimiter ?? aiRateLimiter
  const model = deps.model ?? DEFAULT_AI_MODEL
  // The notes service owns the visibility-aware loader. Build it fresh —
  // we do not depend on the caller wiring `services.notes` separately.
  const notes = createNotesService(ctx, repos, logger)

  return {
    /**
     * Summarize the notes the caller can read. Notes the caller cannot see
     * are silently dropped (see `notes.findVisibleByIds`). Returns a 404
     * (`AppError('not_found')`) if zero notes survive the filter.
     */
    async summarize(input: SummarizeInput): Promise<SummarizeResult> {
      const t0 = Date.now()
      const parsed = summarizeInputSchema.safeParse(input)
      if (!parsed.success) {
        throw new AppError('invalid_input', 'Invalid AI summary input', {
          details: { issues: parsed.error.flatten() },
        })
      }
      const { noteIds, instruction } = parsed.data

      // Rate limit BEFORE we touch the DB — protects against spam loops.
      const decision = limiter.check({ userId: ctx.userId, orgId: ctx.orgId })
      if (!decision.allowed) {
        logger.log(LOG_EVENTS.AI_SUMMARY_FAILED, {
          orgId: ctx.orgId,
          userId: ctx.userId,
          outcome: 'rate_limited',
          scope: decision.scope,
          retryAfterMs: decision.retryAfterMs,
        })
        throw new AppError(
          'permission_denied',
          'Too many AI requests. Please slow down.',
          {
            status: 429,
            details: {
              scope: decision.scope,
              retryAfterMs: decision.retryAfterMs,
            },
          },
        )
      }

      logger.log(LOG_EVENTS.AI_SUMMARY_REQUESTED, {
        orgId: ctx.orgId,
        userId: ctx.userId,
        noteIdsRequested: noteIds,
      })

      // Permission filter — same path UI lists use.
      const visible = await notes.findVisibleByIds(noteIds)
      const noteIdsUsed = visible.map((n) => n.id)

      if (visible.length === 0) {
        logger.log(LOG_EVENTS.AI_SUMMARY_FAILED, {
          orgId: ctx.orgId,
          userId: ctx.userId,
          noteIdsRequested: noteIds,
          noteIdsUsed,
          outcome: 'no_visible_notes',
          latencyMs: Date.now() - t0,
        })
        throw new AppError('not_found', 'No notes available to summarize.')
      }

      // Compose the prompt deterministically. Note ordering follows the
      // visible-rows order (DB result), not the request order — saves us
      // from re-confirming each id was returned and keeps the prompt
      // canonicalizable.
      const prompt = buildNoteSummaryPrompt({
        notes: visible.map((n) => ({
          id: n.id,
          title: n.title,
          content: n.content,
        })),
        instruction,
      })

      try {
        const result = await client.complete({
          model,
          systemPrompt: prompt.systemPrompt,
          userPrompt: prompt.userPrompt,
        })
        logger.log(LOG_EVENTS.AI_SUMMARY_COMPLETED, {
          orgId: ctx.orgId,
          userId: ctx.userId,
          noteIdsRequested: noteIds,
          noteIdsUsed,
          templateId: prompt.templateId,
          promptHash: prompt.promptHash,
          responseTokens: result.outputTokens,
          latencyMs: Date.now() - t0,
          outcome: 'success',
        })
        return {
          summary: result.text,
          noteIdsUsed,
          templateId: prompt.templateId,
          promptHash: prompt.promptHash,
        }
      } catch (err) {
        logger.log(LOG_EVENTS.AI_SUMMARY_FAILED, {
          orgId: ctx.orgId,
          userId: ctx.userId,
          noteIdsRequested: noteIds,
          noteIdsUsed,
          templateId: prompt.templateId,
          promptHash: prompt.promptHash,
          outcome: 'error',
          latencyMs: Date.now() - t0,
        })
        throw new AppError('internal', 'AI summary failed.', { cause: err })
      }
    },
  }
}
