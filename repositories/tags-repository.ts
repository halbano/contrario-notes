import { and, asc, eq, inArray } from 'drizzle-orm'
import { noteTags, tags, type DbTag, type DbNoteTag } from '@/db/schema'
import { scopedWhere, withOrgId } from './base-repository'
import type { AnyDb } from './notes-repository'
import type { RequestContext } from './types'

/**
 * Tags + note-tag pivot. Both tables are tenant-owned: every tag is unique
 * per-org via `tags_org_name_uniq`, and every pivot row carries the same
 * `org_id` as its parent note. The repository never accepts a foreign org
 * id (see `withOrgId`).
 *
 * Tags are referenced by name from the UI (autocomplete shows
 * `listForOrg()`), so the create path is "find-or-create" — concurrent
 * inserts of the same name in the same org are safe under the unique
 * index.
 */
export type TagsRepository = {
  /** All tags in the current org, alphabetical. */
  listForOrg(): Promise<DbTag[]>

  /** Tags currently attached to `noteId`, alphabetical by name. */
  listForNote(noteId: string): Promise<DbTag[]>

  /** Find or create a tag by name within the current org. */
  findOrCreateByName(name: string): Promise<DbTag>

  /** Attach a tag to a note. Idempotent under PK (org_id, note_id, tag_id). */
  attachToNote(noteId: string, tagId: string): Promise<DbNoteTag>

  /** Detach a tag from a note. Returns true if a row was removed. */
  detachFromNote(noteId: string, tagId: string): Promise<boolean>

  /**
   * Replace the full tag set on a note in one shot:
   *   - Find-or-create each name in `tagNames`.
   *   - Insert pivot rows for the new tags; remove pivot rows for tags no
   *     longer present.
   *
   * Returns the resulting set of tag rows (post-write).
   */
  setTagsForNote(noteId: string, tagNames: string[]): Promise<DbTag[]>
}

function normalizeName(raw: string): string {
  return raw.trim().toLowerCase()
}

export function createTagsRepository(
  ctx: RequestContext,
  db: AnyDb,
): TagsRepository {
  const repo: TagsRepository = {
    async listForOrg() {
      return db
        .select()
        .from(tags)
        .where(scopedWhere(ctx, tags))
        .orderBy(asc(tags.name))
    },

    async listForNote(noteId) {
      const rows = await db
        .select({
          id: tags.id,
          orgId: tags.orgId,
          name: tags.name,
          createdAt: tags.createdAt,
        })
        .from(noteTags)
        .innerJoin(tags, eq(tags.id, noteTags.tagId))
        .where(
          and(
            eq(noteTags.orgId, ctx.orgId),
            eq(noteTags.noteId, noteId),
            eq(tags.orgId, ctx.orgId),
          )!,
        )
        .orderBy(asc(tags.name))
      return rows
    },

    async findOrCreateByName(rawName) {
      const name = normalizeName(rawName)
      if (!name) throw new Error('Tag name cannot be empty')
      const existing = await db
        .select()
        .from(tags)
        .where(scopedWhere(ctx, tags, eq(tags.name, name)))
        .limit(1)
      if (existing[0]) return existing[0]
      const payload = withOrgId(ctx, { name })
      const inserted = await db
        .insert(tags)
        .values(payload)
        .onConflictDoNothing()
        .returning()
      if (inserted[0]) return inserted[0]
      // Lost the race; the row exists, fetch it.
      const re = await db
        .select()
        .from(tags)
        .where(scopedWhere(ctx, tags, eq(tags.name, name)))
        .limit(1)
      const row = re[0]
      if (!row) throw new Error('Failed to find-or-create tag')
      return row
    },

    async attachToNote(noteId, tagId) {
      const payload = withOrgId(ctx, { noteId, tagId })
      const rows = await db
        .insert(noteTags)
        .values(payload)
        .onConflictDoNothing()
        .returning()
      if (rows[0]) return rows[0]
      // Already attached.
      return { orgId: ctx.orgId, noteId, tagId } as DbNoteTag
    },

    async detachFromNote(noteId, tagId) {
      const rows = await db
        .delete(noteTags)
        .where(
          and(
            eq(noteTags.orgId, ctx.orgId),
            eq(noteTags.noteId, noteId),
            eq(noteTags.tagId, tagId),
          )!,
        )
        .returning({ tagId: noteTags.tagId })
      return rows.length > 0
    },

    async setTagsForNote(noteId, tagNames) {
      const cleanedNames = Array.from(
        new Set(tagNames.map(normalizeName).filter(Boolean)),
      )

      // Resolve each name to a tag row (find-or-create).
      const resolved: DbTag[] = []
      for (const name of cleanedNames) {
        resolved.push(await repo.findOrCreateByName(name))
      }
      const desiredIds = new Set(resolved.map((t) => t.id))

      // Diff against current attachments.
      const current = await db
        .select({ tagId: noteTags.tagId })
        .from(noteTags)
        .where(
          and(eq(noteTags.orgId, ctx.orgId), eq(noteTags.noteId, noteId))!,
        )
      const currentIds = new Set(current.map((r) => r.tagId))

      const toAdd = [...desiredIds].filter((id) => !currentIds.has(id))
      const toRemove = [...currentIds].filter((id) => !desiredIds.has(id))

      for (const tagId of toAdd) {
        await repo.attachToNote(noteId, tagId)
      }
      if (toRemove.length > 0) {
        await db
          .delete(noteTags)
          .where(
            and(
              eq(noteTags.orgId, ctx.orgId),
              eq(noteTags.noteId, noteId),
              inArray(noteTags.tagId, toRemove),
            )!,
          )
      }

      return repo.listForNote(noteId)
    },
  }
  return repo
}
