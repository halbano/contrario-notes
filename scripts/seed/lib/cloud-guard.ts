/**
 * Cloud-DB safety guard. The seed pipeline is allowed to wipe-and-reseed
 * tables. Doing that against the production Supabase database without an
 * explicit acknowledgement would be catastrophic, so by default we refuse
 * any DATABASE_URL whose host is not localhost / 127.0.0.1.
 *
 * Override: pass `--i-know-this-is-cloud` on the CLI.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0'])

export type CloudGuardResult = {
  host: string
  isLocal: boolean
  shouldRefuse: boolean
  reason?: string
}

export function inspectDatabaseUrl(url: string): { host: string; isLocal: boolean } {
  // Don't `new URL` blindly — postgres URLs sometimes have characters that
  // node's URL parser rejects in passwords. Just split on '@' and ':' to
  // pull out the host. This is intentionally narrow: we only need to know
  // whether the host is local.
  const afterScheme = url.includes('://') ? url.split('://')[1]! : url
  const afterAuth = afterScheme.includes('@') ? afterScheme.split('@').pop()! : afterScheme
  const host = afterAuth.split(':')[0]!.split('/')[0]!.toLowerCase()
  return { host, isLocal: LOCAL_HOSTS.has(host) }
}

export function evaluateCloudGuard(opts: {
  url: string
  override: boolean
}): CloudGuardResult {
  const { host, isLocal } = inspectDatabaseUrl(opts.url)
  if (isLocal) return { host, isLocal: true, shouldRefuse: false }
  if (opts.override) {
    return {
      host,
      isLocal: false,
      shouldRefuse: false,
      reason: 'override flag --i-know-this-is-cloud was supplied',
    }
  }
  return {
    host,
    isLocal: false,
    shouldRefuse: true,
    reason: `Cloud target detected (host=${host}). Refusing without --i-know-this-is-cloud flag.`,
  }
}
