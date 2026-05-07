/**
 * Event taxonomy. Source of truth — every product-code log emission must
 * reference one of these constants. New events require a PR + entry here.
 *
 * Sourced from `agents/files-logging-agent.md`.
 */
export const LOG_EVENTS = {
  // auth
  AUTH_SIGNIN: 'auth.signin',
  AUTH_SIGNIN_FAILED: 'auth.signin_failed',
  AUTH_SIGNOUT: 'auth.signout',
  AUTH_ORG_SWITCH: 'auth.org_switch',

  // notes
  NOTE_CREATED: 'note.created',
  NOTE_UPDATED: 'note.updated',
  NOTE_DELETED: 'note.deleted',
  NOTE_VERSION_CREATED: 'note.version_created',

  // files
  FILE_UPLOADED: 'file.uploaded',
  FILE_READ: 'file.read',
  FILE_DELETED: 'file.deleted',

  // ai
  AI_SUMMARY_REQUESTED: 'ai.summary_requested',
  AI_SUMMARY_COMPLETED: 'ai.summary_completed',
  AI_SUMMARY_FAILED: 'ai.summary_failed',

  // permission / errors
  PERMISSION_DENIED: 'permission.denied',
  ERROR_UNHANDLED: 'error.unhandled',
} as const

export type LogEvent = (typeof LOG_EVENTS)[keyof typeof LOG_EVENTS]

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error'

export const LEVEL_FOR_EVENT: Record<LogEvent, LogLevel> = {
  'auth.signin': 'info',
  'auth.signin_failed': 'warn',
  'auth.signout': 'info',
  'auth.org_switch': 'info',
  'note.created': 'info',
  'note.updated': 'info',
  'note.deleted': 'info',
  'note.version_created': 'info',
  'file.uploaded': 'info',
  'file.read': 'info',
  'file.deleted': 'info',
  'ai.summary_requested': 'info',
  'ai.summary_completed': 'info',
  'ai.summary_failed': 'warn',
  'permission.denied': 'warn',
  'error.unhandled': 'error',
}
