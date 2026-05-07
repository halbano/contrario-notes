/**
 * Secret redaction. Conservative: prefer false positives (over-redaction)
 * over leaking. Applied recursively to log payloads BEFORE serialization.
 */
const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /passwd/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /authorization/i,
  /cookie/i,
  /session/i,
  /service[_-]?role/i,
  /^supabase_.*_key$/i,
  /private[_-]?key/i,
]

const REDACTED = '[REDACTED]'
const MAX_DEPTH = 8

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((re) => re.test(key))
}

export function redact(value: unknown, depth: number = 0): unknown {
  if (depth > MAX_DEPTH) return '[MAX_DEPTH]'
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return value
  }
  if (Array.isArray(value)) {
    return value.map((v) => redact(v, depth + 1))
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(k)) {
        out[k] = REDACTED
      } else {
        out[k] = redact(v, depth + 1)
      }
    }
    return out
  }
  // functions, symbols → drop
  return undefined
}
