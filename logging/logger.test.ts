import { describe, expect, it } from 'vitest'
import { LOG_EVENTS } from './events'
import { createLogger, type LogRecord } from './logger'
import { redact } from './redact'

function captureLogger(minLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error' = 'trace') {
  const records: LogRecord[] = []
  const log = createLogger({
    sink: (r) => records.push(r),
    minLevel,
  })
  return { log, records }
}

describe('logger', () => {
  it('emits a structured record with timestamp, level, event, context', () => {
    const { log, records } = captureLogger()
    log.log(LOG_EVENTS.NOTE_CREATED, { noteId: 'n1', orgId: 'o1' })

    expect(records).toHaveLength(1)
    const r = records[0]!
    expect(r.event).toBe('note.created')
    expect(r.level).toBe('info')
    expect(typeof r.ts).toBe('string')
    expect(r.context).toMatchObject({ noteId: 'n1', orgId: 'o1' })
  })

  it('uses the level mapping from event taxonomy', () => {
    const { log, records } = captureLogger()
    log.log(LOG_EVENTS.PERMISSION_DENIED, {})
    log.log(LOG_EVENTS.ERROR_UNHANDLED, {})
    expect(records[0]!.level).toBe('warn')
    expect(records[1]!.level).toBe('error')
  })

  it('drops records below minLevel', () => {
    const { log, records } = captureLogger('warn')
    log.debug('noise')
    log.info('also noise')
    log.warn('this stays')
    expect(records).toHaveLength(1)
    expect(records[0]!.level).toBe('warn')
  })

  it('child logger merges bindings into every record', () => {
    const { log, records } = captureLogger()
    const child = log.child({ orgId: 'o1', userId: 'u1' })
    child.log(LOG_EVENTS.NOTE_CREATED, { noteId: 'n1' })
    expect(records[0]!.context).toMatchObject({ orgId: 'o1', userId: 'u1', noteId: 'n1' })
  })

  it('redacts sensitive keys before emission (logger integration)', () => {
    const { log, records } = captureLogger()
    log.log(LOG_EVENTS.AUTH_SIGNIN, {
      userId: 'u1',
      password: 'hunter2',
      authorization: 'Bearer abc',
      api_key: 'k',
      nested: { token: 't', safe: 'ok' },
    })
    const ctx = records[0]!.context as Record<string, unknown>
    expect(ctx.userId).toBe('u1')
    expect(ctx.password).toBe('[REDACTED]')
    expect(ctx.authorization).toBe('[REDACTED]')
    expect(ctx.api_key).toBe('[REDACTED]')
    expect((ctx.nested as Record<string, unknown>).token).toBe('[REDACTED]')
    expect((ctx.nested as Record<string, unknown>).safe).toBe('ok')
  })
})

describe('redact (unit)', () => {
  it('redacts password / secret / token / cookie / authorization keys', () => {
    const out = redact({
      password: 'p',
      Secret: 's',
      access_token: 't',
      Cookie: 'c',
      Authorization: 'a',
      service_role: 'r',
      keep: 'me',
    }) as Record<string, string>
    expect(out.password).toBe('[REDACTED]')
    expect(out.Secret).toBe('[REDACTED]')
    expect(out.access_token).toBe('[REDACTED]')
    expect(out.Cookie).toBe('[REDACTED]')
    expect(out.Authorization).toBe('[REDACTED]')
    expect(out.service_role).toBe('[REDACTED]')
    expect(out.keep).toBe('me')
  })

  it('recurses into nested objects and arrays', () => {
    const out = redact({
      list: [{ password: 'p', ok: 1 }],
      deep: { deeper: { token: 't', value: 2 } },
    }) as Record<string, unknown>
    const list = out.list as Array<Record<string, unknown>>
    expect(list[0]!.password).toBe('[REDACTED]')
    expect(list[0]!.ok).toBe(1)
    const deep = out.deep as Record<string, Record<string, unknown>>
    expect(deep.deeper!.token).toBe('[REDACTED]')
    expect(deep.deeper!.value).toBe(2)
  })
})
