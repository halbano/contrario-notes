/**
 * Minimal dotenv loader. Reads `.env.local` (preferred) or `.env` from the
 * repo root and copies any unset keys into `process.env`. We don't pull
 * `dotenv` as a runtime dep just for this — the file format is trivial.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

export function loadDotEnv(cwd: string = process.cwd()): { loadedFrom: string | null } {
  const candidates = [path.join(cwd, '.env.local'), path.join(cwd, '.env')]
  for (const file of candidates) {
    if (!existsSync(file)) continue
    const text = readFileSync(file, 'utf8')
    for (const rawLine of text.split('\n')) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('=')
      if (eq < 0) continue
      const key = line.slice(0, eq).trim()
      let value = line.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (process.env[key] === undefined) process.env[key] = value
    }
    return { loadedFrom: file }
  }
  return { loadedFrom: null }
}
