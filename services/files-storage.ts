import { getSupabaseAdminClient } from '@/lib/supabase/admin'

/**
 * Thin abstraction over Supabase Storage. The service depends on this
 * interface — tests inject a fake; production uses the admin client.
 *
 * ADR-0005: bucket is private; signed URLs are minted per request with
 * TTL ≤ 5 minutes. No public bucket, no long-lived links.
 */
export interface FileStorage {
  upload(
    path: string,
    bytes: Uint8Array | ArrayBuffer | Buffer,
    mimeType: string,
  ): Promise<void>
  remove(path: string): Promise<void>
  createSignedUrl(path: string, expiresInSeconds: number): Promise<string>
}

/** The single private bucket. Configure via Supabase dashboard. */
export const FILES_BUCKET = process.env.SUPABASE_FILES_BUCKET ?? 'note-files'

/** Hard cap — TTL must never exceed this. */
export const MAX_SIGNED_URL_TTL_SECONDS = 300

export function createSupabaseFileStorage(bucket: string = FILES_BUCKET): FileStorage {
  return {
    async upload(path, bytes, mimeType) {
      const admin = getSupabaseAdminClient()
      const { error } = await admin.storage.from(bucket).upload(path, bytes as never, {
        contentType: mimeType,
        upsert: false,
      })
      if (error) throw new Error(`Storage upload failed: ${error.message}`)
    },
    async remove(path) {
      const admin = getSupabaseAdminClient()
      const { error } = await admin.storage.from(bucket).remove([path])
      if (error) throw new Error(`Storage remove failed: ${error.message}`)
    },
    async createSignedUrl(path, expiresInSeconds) {
      if (expiresInSeconds > MAX_SIGNED_URL_TTL_SECONDS) {
        throw new Error(
          `Signed URL TTL ${expiresInSeconds}s exceeds max ${MAX_SIGNED_URL_TTL_SECONDS}s`,
        )
      }
      const admin = getSupabaseAdminClient()
      const { data, error } = await admin.storage
        .from(bucket)
        .createSignedUrl(path, expiresInSeconds)
      if (error || !data?.signedUrl) {
        throw new Error(`Signed URL mint failed: ${error?.message ?? 'no url'}`)
      }
      return data.signedUrl
    },
  }
}
