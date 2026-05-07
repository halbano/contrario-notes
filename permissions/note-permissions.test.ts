import { describe, expect, it } from 'vitest'
import {
  canCreateNote,
  canDeleteNote,
  canReadNote,
  canUpdateNote,
} from './note-permissions'
import {
  ALL_ROLES,
  ALL_VISIBILITIES,
  type NoteForPermission,
  type RequestContext,
  type Role,
} from './types'

const ORG = 'org-1'
const OTHER_ORG = 'org-2'
const AUTHOR = 'user-author'
const OTHER_USER = 'user-other'
const SHARED_USER = 'user-shared'

function ctx(role: Role, userId: string = OTHER_USER, orgId: string = ORG): RequestContext {
  return Object.freeze({ userId, orgId, role })
}

function note(
  visibility: NoteForPermission['visibility'],
  overrides: Partial<NoteForPermission> = {},
): NoteForPermission {
  return {
    orgId: ORG,
    authorId: AUTHOR,
    visibility,
    sharedWithUserIds: [SHARED_USER],
    ...overrides,
  }
}

describe('canReadNote — full role × visibility table', () => {
  // ---- cross-org is always denied (no role grants this) ---------------------
  for (const role of ALL_ROLES) {
    for (const v of ALL_VISIBILITIES) {
      it(`denies cross-org read for role=${role} visibility=${v}`, () => {
        const c = ctx(role, OTHER_USER, OTHER_ORG)
        expect(canReadNote(c, note(v))).toBe(false)
      })
    }
  }

  // ---- private: only the author can read, regardless of role ---------------
  for (const role of ALL_ROLES) {
    it(`role=${role} cannot read another user's private note`, () => {
      expect(canReadNote(ctx(role, OTHER_USER), note('private'))).toBe(false)
    })
    it(`role=${role} CAN read their own private note (author)`, () => {
      expect(canReadNote(ctx(role, AUTHOR), note('private'))).toBe(true)
    })
  }
  // admin override: admin can read other users' private notes
  it('admin role does NOT bypass private — invariant: privacy means privacy', () => {
    expect(canReadNote(ctx('admin', OTHER_USER), note('private'))).toBe(false)
  })

  // ---- org: any member of the org can read --------------------------------
  for (const role of ALL_ROLES) {
    it(`role=${role} (same org) can read an 'org'-visibility note`, () => {
      expect(canReadNote(ctx(role, OTHER_USER), note('org'))).toBe(true)
    })
  }

  // ---- shared: only author + shared_with list ------------------------------
  it("shared note is readable by the shared user", () => {
    expect(canReadNote(ctx('viewer', SHARED_USER), note('shared'))).toBe(true)
  })
  it('shared note is readable by the author', () => {
    expect(canReadNote(ctx('viewer', AUTHOR), note('shared'))).toBe(true)
  })
  it('shared note NOT readable by an org member who is not in the list', () => {
    expect(canReadNote(ctx('member', OTHER_USER), note('shared'))).toBe(false)
  })
})

describe('canCreateNote', () => {
  it('admin can create', () => expect(canCreateNote(ctx('admin'))).toBe(true))
  it('member can create', () => expect(canCreateNote(ctx('member'))).toBe(true))
  it('viewer cannot create', () => expect(canCreateNote(ctx('viewer'))).toBe(false))
})

describe('canUpdateNote', () => {
  it('cross-org update always denied', () => {
    expect(canUpdateNote(ctx('admin', OTHER_USER, OTHER_ORG), note('org'))).toBe(false)
  })
  it('viewer cannot update even own notes', () => {
    expect(canUpdateNote(ctx('viewer', AUTHOR), note('org'))).toBe(false)
  })
  it('member can update own org note', () => {
    expect(canUpdateNote(ctx('member', AUTHOR), note('org'))).toBe(true)
  })
  it('member cannot update someone else’s note', () => {
    expect(canUpdateNote(ctx('member', OTHER_USER), note('org'))).toBe(false)
  })
  it('admin can update any note in org (org/shared)', () => {
    expect(canUpdateNote(ctx('admin', OTHER_USER), note('org'))).toBe(true)
    expect(canUpdateNote(ctx('admin', OTHER_USER), note('shared'))).toBe(true)
  })
  it('admin cannot update another user’s private note (privacy holds)', () => {
    expect(canUpdateNote(ctx('admin', OTHER_USER), note('private'))).toBe(false)
  })
})

describe('canDeleteNote', () => {
  it('viewer cannot delete', () => {
    expect(canDeleteNote(ctx('viewer', AUTHOR), note('org'))).toBe(false)
  })
  it('member can delete own', () => {
    expect(canDeleteNote(ctx('member', AUTHOR), note('org'))).toBe(true)
  })
  it('member cannot delete others’', () => {
    expect(canDeleteNote(ctx('member', OTHER_USER), note('org'))).toBe(false)
  })
  it('admin can delete any non-private note in org', () => {
    expect(canDeleteNote(ctx('admin', OTHER_USER), note('org'))).toBe(true)
  })
  it('admin cannot delete another user’s private note', () => {
    expect(canDeleteNote(ctx('admin', OTHER_USER), note('private'))).toBe(false)
  })
  it('cross-org delete always denied', () => {
    expect(canDeleteNote(ctx('admin', AUTHOR, OTHER_ORG), note('org'))).toBe(false)
  })
})
