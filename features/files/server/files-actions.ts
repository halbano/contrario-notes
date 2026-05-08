'use server'

/**
 * File server actions.
 *
 * Validate input, build per-request scoped services, dispatch to
 * `services.files.*`. Permission errors map to 404 (no existence
 * disclosure). Mint URL is its own action — clients call it on every
 * download click; URLs are never cached.
 */

import { revalidatePath } from 'next/cache'
import { getRequestContext } from '@/lib/auth-context'
import { createScopedServices } from '@/services'
import { isAppError } from '@/lib/errors'
import { fileIdSchema, type FileActionResult } from './file-schemas'

function toResult<T>(e: unknown): FileActionResult<T> {
  if (isAppError(e)) {
    return { ok: false, message: e.message }
  }
  return { ok: false, message: 'Something went wrong.' }
}

/**
 * Multipart upload. Expects fields: `file` (Blob/File), `noteId` (string|''),
 * `filename` (optional override).
 */
export async function uploadFileAction(
  formData: FormData,
): Promise<FileActionResult<{ id: string }>> {
  const file = formData.get('file')
  if (!(file instanceof Blob)) {
    return { ok: false, message: 'No file provided.' }
  }
  const rawNoteId = String(formData.get('noteId') ?? '').trim()
  const noteId = rawNoteId.length > 0 ? rawNoteId : null
  const filename =
    String(formData.get('filename') ?? '').trim() ||
    (file instanceof File ? file.name : 'upload')
  const mimeType = file.type || 'application/octet-stream'

  try {
    const ctx = await getRequestContext()
    const services = createScopedServices(ctx)
    const arr = new Uint8Array(await file.arrayBuffer())
    const row = await services.files.upload({
      noteId,
      filename,
      mimeType,
      bytes: arr,
    })
    if (noteId) {
      revalidatePath(`/notes/${noteId}`)
    }
    revalidatePath('/files')
    return { ok: true, data: { id: row.id } }
  } catch (e) {
    return toResult(e)
  }
}

/**
 * Mint a fresh signed URL for `fileId`. Permission check runs on the
 * server every call. Returns null when not allowed (404 semantics).
 */
export async function mintFileUrlAction(
  raw: unknown,
): Promise<FileActionResult<{ url: string; expiresAt: string }>> {
  const parsed = fileIdSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, message: 'Invalid file id.' }
  }
  try {
    const ctx = await getRequestContext()
    const services = createScopedServices(ctx)
    const { url, expiresAt } = await services.files.mintSignedUrl(parsed.data.fileId)
    return { ok: true, data: { url, expiresAt: expiresAt.toISOString() } }
  } catch (e) {
    return toResult(e)
  }
}

export async function deleteFileAction(
  raw: unknown,
): Promise<FileActionResult> {
  const parsed = fileIdSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, message: 'Invalid file id.' }
  }
  try {
    const ctx = await getRequestContext()
    const services = createScopedServices(ctx)
    await services.files.remove(parsed.data.fileId)
    revalidatePath('/files')
    return { ok: true }
  } catch (e) {
    return toResult(e)
  }
}
