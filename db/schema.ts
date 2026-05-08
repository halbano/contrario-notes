import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

/**
 * Postgres `tsvector`. Drizzle has no native helper. We model it as an opaque
 * string at the TS level — search code uses raw `sql` fragments to read it
 * (`@@`, `ts_rank(...)`), never selecting the column directly. The column is
 * `GENERATED ALWAYS AS (...) STORED` (see drizzle/0004_search_fts.sql); we
 * mark it with `.generatedAlwaysAs(sql\`...\`)` so drizzle-kit's diffing
 * recognizes it as a generated column and does not propose to drop / re-create
 * it on subsequent migrations.
 */
const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'tsvector'
  },
})

/**
 * Tenancy invariant (ADR-0001): every tenant-owned table carries
 * `org_id uuid not null references organizations(id) on delete cascade`,
 * with composite indexes leading with `org_id` to keep query plans
 * tenant-scoped.
 *
 * `users` and `organizations` are NOT tenant-owned themselves; `users` is a
 * mirror of Supabase auth.users (we keep our own row for FK joins), and
 * `organizations` is the tenant root.
 */

// ---- core identity ----------------------------------------------------------

export const users = pgTable('users', {
  id: uuid('id').primaryKey(), // matches Supabase auth.users.id
  email: text('email').notNull(),
  displayName: text('display_name'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ---- membership -------------------------------------------------------------

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['admin', 'member', 'viewer'] }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // composite uniqueness — one membership per (org, user)
    orgUserUnique: uniqueIndex('memberships_org_user_uniq').on(t.orgId, t.userId),
    // hot lookup: "what orgs is this user in?"
    userIdx: index('memberships_user_idx').on(t.userId),
  }),
)

// ---- notes ------------------------------------------------------------------

/**
 * Visibility tiers (ADR-0006, ADR-0004 visibility predicate):
 *  - private:  only the author can read
 *  - org:      every member of the org can read
 *  - shared:   author + a list of user_ids stored in note_shares (future)
 *
 * Search and AI both apply this filter at SQL level.
 */
export const notes = pgTable(
  'notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    content: text('content').notNull().default(''),
    visibility: text('visibility', { enum: ['private', 'org', 'shared'] })
      .notNull()
      .default('org'),
    // Denormalized tags string for FTS composition (ADR-0004).
    tagsText: text('tags_text').notNull().default(''),
    /**
     * Full-text search vector — `to_tsvector('simple', title || ' ' || content
     * || ' ' || tags_text)`. Provisioned by `drizzle/0004_search_fts.sql` as
     * `GENERATED ALWAYS AS (...) STORED`. Backed by GIN index
     * `notes_search_tsv_idx`. Read-only at the application layer.
     */
    searchTsv: tsvector('search_tsv').generatedAlwaysAs(
      sql`to_tsvector('simple', coalesce("title", '') || ' ' || coalesce("content", '') || ' ' || coalesce("tags_text", ''))`,
    ),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    // ALL hot read paths lead with org_id.
    orgUpdatedIdx: index('notes_org_updated_idx').on(t.orgId, t.updatedAt),
    orgAuthorIdx: index('notes_org_author_idx').on(t.orgId, t.authorId),
    orgVisibilityIdx: index('notes_org_visibility_idx').on(t.orgId, t.visibility),
  }),
)

/**
 * Per-user share grants for notes whose `visibility = 'shared'`. The visibility
 * predicate (see `permissions/note-visibility-sql.ts`) consults this table at
 * SQL level — every grant is scoped to a single org, and the composite primary
 * key prevents duplicates per (org, note, user). The leading composite index on
 * `(org_id, user_id)` keeps "what shared notes can this user see?" lookups
 * tenant-scoped.
 *
 * TODO(auth-agent): add an RLS migration for note_shares that mirrors the
 * `notes` policy — allow rows where `org_id = auth_get_active_org()` and the
 * row's `note.org_id` matches. The application layer enforces this today
 * (every read goes through scopedWhere), but RLS is the second-fence
 * defense-in-depth that other tables already enjoy via 0001_rls.sql.
 */
export const noteShares = pgTable(
  'note_shares',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    noteId: uuid('note_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    canEdit: boolean('can_edit').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.noteId, t.userId] }),
    byUser: index('note_shares_org_user_idx').on(t.orgId, t.userId),
  }),
)

export const noteVersions = pgTable(
  'note_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    noteId: uuid('note_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    title: text('title').notNull(),
    content: text('content').notNull(),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgNoteVersionUniq: uniqueIndex('note_versions_org_note_version_uniq').on(
      t.orgId,
      t.noteId,
      t.version,
    ),
    orgNoteCreatedIdx: index('note_versions_org_note_created_idx').on(
      t.orgId,
      t.noteId,
      t.createdAt,
    ),
  }),
)

// ---- tags -------------------------------------------------------------------

export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgNameUniq: uniqueIndex('tags_org_name_uniq').on(t.orgId, t.name),
  }),
)

export const noteTags = pgTable(
  'note_tags',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    noteId: uuid('note_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.noteId, t.tagId] }),
    orgTagIdx: index('note_tags_org_tag_idx').on(t.orgId, t.tagId),
  }),
)

// ---- files ------------------------------------------------------------------

export const files = pgTable(
  'files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    // Optional — files may exist standalone before being attached.
    noteId: uuid('note_id').references(() => notes.id, { onDelete: 'set null' }),
    uploaderId: uuid('uploader_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    storagePath: text('storage_path').notNull(),
    filename: text('filename').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgNoteIdx: index('files_org_note_idx').on(t.orgId, t.noteId),
    orgCreatedIdx: index('files_org_created_idx').on(t.orgId, t.createdAt),
    storagePathUniq: uniqueIndex('files_storage_path_uniq').on(t.storagePath),
  }),
)

// ---- audit log --------------------------------------------------------------

/**
 * Append-only. Every mutation, every permission denial, every AI call.
 * The logger writes structured JSON; the audit_log writes durable rows.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    event: text('event').notNull(),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    payload: jsonb('payload')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    success: boolean('success').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgCreatedIdx: index('audit_log_org_created_idx').on(t.orgId, t.createdAt),
    orgEventIdx: index('audit_log_org_event_idx').on(t.orgId, t.event),
  }),
)

// ---- type re-exports --------------------------------------------------------

export type DbUser = typeof users.$inferSelect
export type DbOrganization = typeof organizations.$inferSelect
export type DbMembership = typeof memberships.$inferSelect
export type DbNote = typeof notes.$inferSelect
export type DbNoteInsert = typeof notes.$inferInsert
export type DbNoteShare = typeof noteShares.$inferSelect
export type DbNoteShareInsert = typeof noteShares.$inferInsert
export type DbNoteVersion = typeof noteVersions.$inferSelect
export type DbTag = typeof tags.$inferSelect
export type DbNoteTag = typeof noteTags.$inferSelect
export type DbFile = typeof files.$inferSelect
export type DbAuditLog = typeof auditLog.$inferSelect
