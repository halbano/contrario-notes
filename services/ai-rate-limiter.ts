/**
 * In-memory sliding-window rate limiter.
 *
 * v1 lives inside the Node process. TODO(redis): replace with a distributed
 * limiter before scaling beyond a single instance — multi-instance deploys
 * would silently allow `instances * limit` calls per window.
 *
 * The limiter is intentionally tiny:
 *   - Two windows: per-user and per-org. Both must pass.
 *   - Sliding window via timestamp list per key.
 *   - No persistence — restarts reset state. That is acceptable for v1
 *     because the limit's job is "catch runaway loops", not billing.
 */

export type RateLimiterConfig = {
  perUserPerMinute: number
  perOrgPerMinute: number
  /** Override for tests. Defaults to `Date.now`. */
  now?: () => number
}

export type RateLimiterDecision =
  | { allowed: true }
  | { allowed: false; scope: 'user' | 'org'; retryAfterMs: number }

export type RateLimiter = {
  check(input: { userId: string; orgId: string }): RateLimiterDecision
  /** Reset all state. Test helper. */
  reset(): void
}

const WINDOW_MS = 60_000

export function createMemoryRateLimiter(config: RateLimiterConfig): RateLimiter {
  const userHits = new Map<string, number[]>()
  const orgHits = new Map<string, number[]>()
  const now = config.now ?? (() => Date.now())

  function prune(list: number[], cutoff: number): number[] {
    // Trim hits older than the window. Mutates in place.
    let i = 0
    while (i < list.length && list[i]! < cutoff) i++
    if (i > 0) list.splice(0, i)
    return list
  }

  return {
    check({ userId, orgId }) {
      const t = now()
      const cutoff = t - WINDOW_MS

      const userList = prune(userHits.get(userId) ?? [], cutoff)
      if (userList.length >= config.perUserPerMinute) {
        const oldest = userList[0]!
        return {
          allowed: false,
          scope: 'user',
          retryAfterMs: Math.max(0, oldest + WINDOW_MS - t),
        }
      }

      const orgList = prune(orgHits.get(orgId) ?? [], cutoff)
      if (orgList.length >= config.perOrgPerMinute) {
        const oldest = orgList[0]!
        return {
          allowed: false,
          scope: 'org',
          retryAfterMs: Math.max(0, oldest + WINDOW_MS - t),
        }
      }

      userList.push(t)
      orgList.push(t)
      userHits.set(userId, userList)
      orgHits.set(orgId, orgList)
      return { allowed: true }
    },
    reset() {
      userHits.clear()
      orgHits.clear()
    },
  }
}

/** Singleton for production-side use. Tests build their own. */
export const aiRateLimiter = createMemoryRateLimiter({
  perUserPerMinute: 10,
  perOrgPerMinute: 50,
})
