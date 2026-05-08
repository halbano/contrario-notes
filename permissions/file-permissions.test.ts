import { describe, expect, it } from 'vitest'
import {
  canAttachToNote,
  canReadFile,
  canWriteFile,
} from './file-permissions'
import {
  ALL_ROLES,
  ALL_VISIBILITIES,
  type FileForPermission,
  type NoteForPermission,
  type RequestContext,
  type Role,
} from './types'

const ORG = 'org-1'
const OTHER_ORG = 'org-2'
const AUTHOR = 'user-author'
const OTHER_USER = 'user-other'
const SHARED_USER = 'user-shared'
const UPLOADER = 'user-uploader'

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

function file(overrides: Partial<FileForPermission> = {}): FileForPermission {
  return {
    orgId: ORG,
    uploaderId: UPLOADER,
    parentNote: null,
    ...overrides,
  }
}

describe('canReadFile — cross-org isolation (always false)', () => {
  // ctx in OTHER_ORG, file/note in ORG → file.orgId !== ctx.orgId.
  for (const role of ALL_ROLES) {
    for (const v of ALL_VISIBILITIES) {
      it(`denies cross-org read role=${role} visibility=${v}`, () => {
        const c = ctx(role, OTHER_USER, OTHER_ORG)
        expect(canReadFile(c, file(), note(v))).toBe(false)
      })
    }
  }
  it('denies when file.orgId differs from ctx.orgId even if note matches', () => {
    expect(canReadFile(ctx('member'), file({ orgId: OTHER_ORG }), note('org'))).toBe(false)
  })
  it('denies cross-org standalone file', () => {
    // ctx in ORG, file in OTHER_ORG.
    expect(canReadFile(ctx('admin', UPLOADER, ORG), file({ orgId: OTHER_ORG }), null)).toBe(false)
  })
})

describe('canReadFile — defers to parent note visibility', () => {
  it('private note → only author can read attached file', () => {
    expect(canReadFile(ctx('member', AUTHOR), file(), note('private'))).toBe(true)
    expect(canReadFile(ctx('member', OTHER_USER), file(), note('private'))).toBe(false)
    expect(canReadFile(ctx('admin', OTHER_USER), file(), note('private'))).toBe(false)
  })
  it('org note → any same-org user can read attached file', () => {
    for (const role of ALL_ROLES) {
      expect(canReadFile(ctx(role, OTHER_USER), file(), note('org'))).toBe(true)
    }
  })
  it('shared note → only author + shared list', () => {
    expect(canReadFile(ctx('viewer', SHARED_USER), file(), note('shared'))).toBe(true)
    expect(canReadFile(ctx('viewer', AUTHOR), file(), note('shared'))).toBe(true)
    expect(canReadFile(ctx('member', OTHER_USER), file(), note('shared'))).toBe(false)
  })
})

describe('canReadFile — standalone files (no parent note)', () => {
  it('uploader can read own standalone file', () => {
    expect(canReadFile(ctx('member', UPLOADER), file(), null)).toBe(true)
  })
  it('non-uploader members CANNOT read standalone file', () => {
    expect(canReadFile(ctx('member', OTHER_USER), file(), null)).toBe(false)
  })
  it('admin CAN read standalone file', () => {
    expect(canReadFile(ctx('admin', OTHER_USER), file(), null)).toBe(true)
  })
  it('viewer (not uploader) CANNOT read standalone file', () => {
    expect(canReadFile(ctx('viewer', OTHER_USER), file(), null)).toBe(false)
  })
})

describe('canWriteFile — cross-org always denied', () => {
  for (const role of ALL_ROLES) {
    it(`denies cross-org write role=${role}`, () => {
      expect(canWriteFile(ctx(role, OTHER_USER, OTHER_ORG), file(), note('org'))).toBe(false)
    })
  }
})

describe('canWriteFile — defers to canUpdateNote when parent present', () => {
  it('viewer cannot write even own', () => {
    expect(canWriteFile(ctx('viewer', AUTHOR), file({ uploaderId: AUTHOR }), note('org'))).toBe(false)
  })
  it('member can write file on own note', () => {
    expect(canWriteFile(ctx('member', AUTHOR), file(), note('org'))).toBe(true)
  })
  it("member cannot write file on someone else's note", () => {
    expect(canWriteFile(ctx('member', OTHER_USER), file(), note('org'))).toBe(false)
  })
  it('admin can write on any non-private note', () => {
    expect(canWriteFile(ctx('admin', OTHER_USER), file(), note('org'))).toBe(true)
    expect(canWriteFile(ctx('admin', OTHER_USER), file(), note('shared'))).toBe(true)
  })
  it("admin cannot write on someone's private note", () => {
    expect(canWriteFile(ctx('admin', OTHER_USER), file(), note('private'))).toBe(false)
  })
})

describe('canWriteFile — standalone', () => {
  it('uploader can write own standalone', () => {
    expect(canWriteFile(ctx('member', UPLOADER), file(), null)).toBe(true)
  })
  it('admin can write any standalone', () => {
    expect(canWriteFile(ctx('admin', OTHER_USER), file(), null)).toBe(true)
  })
  it('non-uploader member cannot', () => {
    expect(canWriteFile(ctx('member', OTHER_USER), file(), null)).toBe(false)
  })
  it('viewer cannot ever write', () => {
    expect(canWriteFile(ctx('viewer', UPLOADER), file(), null)).toBe(false)
  })
})

describe('canAttachToNote — pre-create gate', () => {
  it('viewer cannot attach', () => {
    expect(canAttachToNote(ctx('viewer', AUTHOR), note('org'))).toBe(false)
    expect(canAttachToNote(ctx('viewer', AUTHOR), null)).toBe(false)
  })
  it('member can attach to own note', () => {
    expect(canAttachToNote(ctx('member', AUTHOR), note('org'))).toBe(true)
  })
  it("member cannot attach to someone else's note", () => {
    expect(canAttachToNote(ctx('member', OTHER_USER), note('org'))).toBe(false)
  })
  it('admin can attach to any non-private note', () => {
    expect(canAttachToNote(ctx('admin', OTHER_USER), note('org'))).toBe(true)
  })
  it("admin cannot attach to someone's private note", () => {
    expect(canAttachToNote(ctx('admin', OTHER_USER), note('private'))).toBe(false)
  })
  it('member can do standalone upload', () => {
    expect(canAttachToNote(ctx('member', OTHER_USER), null)).toBe(true)
  })
  it('cross-org attach denied', () => {
    expect(canAttachToNote(ctx('admin', OTHER_USER, OTHER_ORG), note('org'))).toBe(false)
  })
})
