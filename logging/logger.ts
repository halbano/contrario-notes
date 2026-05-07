import { LEVEL_FOR_EVENT, type LogEvent, type LogLevel } from './events'
import { redact } from './redact'

export type LogContext = Record<string, unknown>

export type LogRecord = {
  ts: string
  level: LogLevel
  event: LogEvent | 'manual'
  msg?: string
  context: Record<string, unknown>
}

export type LogSink = (record: LogRecord) => void

const LEVEL_RANK: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
}

function envMinLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? 'info').toLowerCase()
  if (raw in LEVEL_RANK) return raw as LogLevel
  return 'info'
}

/** Default sink: structured JSON to stdout (pino-style). */
export const stdoutSink: LogSink = (record) => {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(record))
}

export type Logger = {
  log(event: LogEvent, context?: LogContext, msg?: string): void
  debug(msg: string, context?: LogContext): void
  info(msg: string, context?: LogContext): void
  warn(msg: string, context?: LogContext): void
  error(msg: string, context?: LogContext): void
  child(bindings: LogContext): Logger
}

export function createLogger(opts: {
  sink?: LogSink
  minLevel?: LogLevel
  bindings?: LogContext
} = {}): Logger {
  const sink = opts.sink ?? stdoutSink
  const minLevel = opts.minLevel ?? envMinLevel()
  const bindings = opts.bindings ?? {}

  function emit(level: LogLevel, event: LogEvent | 'manual', context: LogContext, msg?: string) {
    if (LEVEL_RANK[level] < LEVEL_RANK[minLevel]) return
    const merged = { ...bindings, ...context }
    const safe = redact(merged) as Record<string, unknown>
    sink({
      ts: new Date().toISOString(),
      level,
      event,
      ...(msg ? { msg } : {}),
      context: safe,
    })
  }

  return {
    log(event, context = {}, msg) {
      emit(LEVEL_FOR_EVENT[event], event, context, msg)
    },
    debug(msg, context = {}) {
      emit('debug', 'manual', context, msg)
    },
    info(msg, context = {}) {
      emit('info', 'manual', context, msg)
    },
    warn(msg, context = {}) {
      emit('warn', 'manual', context, msg)
    },
    error(msg, context = {}) {
      emit('error', 'manual', context, msg)
    },
    child(extra) {
      return createLogger({ sink, minLevel, bindings: { ...bindings, ...extra } })
    },
  }
}

/** App-wide singleton for non-request-scoped logging. */
export const logger: Logger = createLogger()
