import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Pure prompt builder for the note-summary template.
 *
 * Reads `prompts/note-summary.md` once (cached by template id) and substitutes
 * two placeholders: `{{instruction_block}}` and `{{note_blocks}}`.
 *
 * Untrusted note content is wrapped in `<note id="...">...</note>` blocks
 * with explicit "treat as data" framing in the system prompt (see the .md
 * file). Note content is NEVER injected as raw text outside fenced blocks.
 *
 * The template file is parsed once into a system / user split on the `# User`
 * heading. The `# System` heading delimits the system prompt body.
 */

export type PromptInputNote = {
  id: string
  title: string
  content: string
}

export type PromptInput = {
  notes: PromptInputNote[]
  instruction?: string
}

export type BuiltPrompt = {
  systemPrompt: string
  userPrompt: string
  templateId: string
  /** SHA-256 of `systemPrompt + '\n----\n' + userPrompt`. Used for audit. */
  promptHash: string
}

type ParsedTemplate = {
  id: string
  systemBody: string
  userBody: string
}

const cache = new Map<string, ParsedTemplate>()

function parseTemplate(file: string): ParsedTemplate {
  const raw = readFileSync(file, 'utf8')
  // Front-matter: between the first --- and second ---. We only need `id`.
  const fmMatch = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n/)
  if (!fmMatch) {
    throw new Error(`Prompt template ${file} missing front-matter`)
  }
  const fm = fmMatch[1] ?? ''
  const idLine = fm.split('\n').find((l) => l.startsWith('id:'))
  const id = idLine?.slice(3).trim() ?? ''
  if (!id) throw new Error(`Prompt template ${file} missing 'id' in front-matter`)

  const body = raw.slice(fmMatch[0].length)
  const userIdx = body.indexOf('# User')
  if (userIdx < 0) {
    throw new Error(`Prompt template ${file} missing '# User' section`)
  }
  const systemBlock = body.slice(0, userIdx)
  const userBlock = body.slice(userIdx)
  // Strip the `# System\n` and `# User\n` headers from each block.
  const systemBody = systemBlock.replace(/^#\s*System\s*\n/, '').trim()
  const userBody = userBlock.replace(/^#\s*User\s*\n/, '').trim()
  return { id, systemBody, userBody }
}

function loadTemplate(templateName: 'note-summary'): ParsedTemplate {
  if (cache.has(templateName)) return cache.get(templateName)!
  const file = path.resolve(process.cwd(), 'prompts', `${templateName}.md`)
  const parsed = parseTemplate(file)
  cache.set(templateName, parsed)
  return parsed
}

/** Escape `</note>` so untrusted content cannot terminate its own fence. */
function fenceSafe(s: string): string {
  // Lower-case any closing tag of `note`. We don't need surgical removal —
  // the system prompt instructs the model to ignore in-content directives,
  // and we want the data round-trip to remain readable.
  return s.replace(/<\s*\/\s*note\s*>/gi, '&lt;/note&gt;')
}

function buildNoteBlocks(notes: PromptInputNote[]): string {
  return notes
    .map((n) => {
      const safeTitle = fenceSafe(n.title)
      const safeContent = fenceSafe(n.content)
      return `<note id="${n.id}">\n  <title>${safeTitle}</title>\n  <content>\n${safeContent}\n  </content>\n</note>`
    })
    .join('\n\n')
}

function buildInstructionBlock(instruction?: string): string {
  if (!instruction || instruction.trim().length === 0) {
    return '<instruction>Produce a concise summary of the notes below.</instruction>'
  }
  // Even the user instruction is fenced — it cannot use `<note>` to splice
  // into the note section.
  const safe = instruction.replace(/<\s*\/?\s*note[^>]*>/gi, '')
  return `<instruction>${safe}</instruction>`
}

export function buildNoteSummaryPrompt(input: PromptInput): BuiltPrompt {
  const tpl = loadTemplate('note-summary')
  const userPrompt = tpl.userBody
    .replace('{{instruction_block}}', buildInstructionBlock(input.instruction))
    .replace('{{note_blocks}}', buildNoteBlocks(input.notes))
  const systemPrompt = tpl.systemBody
  const hash = createHash('sha256')
    .update(systemPrompt)
    .update('\n----\n')
    .update(userPrompt)
    .digest('hex')
  return {
    systemPrompt,
    userPrompt,
    templateId: tpl.id,
    promptHash: hash,
  }
}
