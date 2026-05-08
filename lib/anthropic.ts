/**
 * Server-only Anthropic SDK adapter.
 *
 * The SDK reads `ANTHROPIC_API_KEY` from the environment by default. We do
 * NOT pass the key through the constructor — that prevents accidental
 * key-in-source mistakes and keeps the secret in one place.
 *
 * Calling this adapter from client code is forbidden (TENANCY_INVARIANTS
 * spirit + ADR-0006). The `'server-only'` import below is a build-time
 * fence: webpack/turbopack will refuse to bundle this module into a
 * client component.
 */

import 'server-only'
import Anthropic from '@anthropic-ai/sdk'

export type AnthropicClient = {
  /**
   * Generate a completion. Implementation-agnostic shape so tests can pass a
   * fake without importing the SDK.
   */
  complete(input: AnthropicCompleteInput): Promise<AnthropicCompleteResult>
}

export type AnthropicCompleteInput = {
  model: string
  systemPrompt: string
  userPrompt: string
  /** Hard cap on output tokens. Defaults to 1024. */
  maxOutputTokens?: number
}

export type AnthropicCompleteResult = {
  text: string
  /** Output tokens reported by the API. Used for logging only. */
  outputTokens: number
}

/**
 * Build the production adapter. Lazy — the SDK is only constructed when
 * first used so importing this module from a code path that never runs
 * (e.g. typecheck) does not require the env var.
 */
export function createAnthropicClient(): AnthropicClient {
  let client: Anthropic | null = null
  return {
    async complete(input) {
      if (!client) {
        if (!process.env.ANTHROPIC_API_KEY) {
          throw new Error(
            'ANTHROPIC_API_KEY is not set. Add it to .env (server-only).',
          )
        }
        client = new Anthropic()
      }
      const resp = await client.messages.create({
        model: input.model,
        max_tokens: input.maxOutputTokens ?? 1024,
        system: input.systemPrompt,
        messages: [{ role: 'user', content: input.userPrompt }],
      })
      // Concatenate all text blocks; the SDK returns a content array.
      const text = resp.content
        .map((b) => (b.type === 'text' ? b.text : ''))
        .join('')
      return {
        text,
        outputTokens: resp.usage?.output_tokens ?? 0,
      }
    },
  }
}

/** The default model the AI service uses. Pinned per ADR-0006. */
export const DEFAULT_AI_MODEL = 'claude-sonnet-4-5-20250929'
