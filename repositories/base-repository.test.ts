import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { notes } from '@/db/schema'
import type { RequestContext } from '@/lib/request-context'
import { scopedWhere, withOrgId } from './base-repository'

const CTX: RequestContext = Object.freeze({
  userId: 'u1',
  orgId: 'org-A',
  role: 'member',
})

// Tiny helper: extract the param array from a Drizzle SQL fragment without
// rendering it through a connection. The PgDialect knows how to do this.
import { PgDialect } from 'drizzle-orm/pg-core'
const dialect = new PgDialect()
function render(sql: ReturnType<typeof scopedWhere>) {
  return dialect.sqlToQuery(sql)
}

describe('scopedWhere', () => {
  it('produces a predicate referencing the org_id column with ctx.orgId as a param', () => {
    const { sql, params } = render(scopedWhere(CTX, notes))
    expect(sql).toMatch(/"notes"\."org_id"\s*=\s*\$1/)
    expect(params).toContain('org-A')
  })

  it('combines extra predicates without dropping the org filter (org_id first)', () => {
    const { sql, params } = render(scopedWhere(CTX, notes, eq(notes.id, 'n1')))
    expect(sql).toMatch(/"notes"\."org_id".*and.*"notes"\."id"/i)
    expect(params).toEqual(expect.arrayContaining(['org-A', 'n1']))
    // org_id parameter must come first.
    expect(params[0]).toBe('org-A')
  })

  it('ignores undefined extras', () => {
    const { sql, params } = render(scopedWhere(CTX, notes, undefined))
    expect(params).toEqual(['org-A'])
    expect(sql).toMatch(/"org_id"/)
  })
})

describe('withOrgId', () => {
  it('stamps ctx.orgId onto a payload that has none', () => {
    const out = withOrgId(CTX, { title: 'hello' })
    expect(out.orgId).toBe('org-A')
    expect(out.title).toBe('hello')
  })

  it('passes through if payload already has the matching orgId', () => {
    const out = withOrgId(CTX, { orgId: 'org-A', title: 'hi' })
    expect(out.orgId).toBe('org-A')
  })

  it('throws when payload supplies a foreign orgId — invariant: caller cannot override scope', () => {
    expect(() => withOrgId(CTX, { orgId: 'org-OTHER' })).toThrowError(/foreign orgId/i)
  })
})
