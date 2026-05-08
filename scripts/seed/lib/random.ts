/**
 * Deterministic RNG. Mulberry32 seeded with a single 32-bit integer keeps
 * every seed run reproducible — same seed in, same data out. We do NOT use
 * Math.random() anywhere in the seed pipeline.
 */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0
  return function rng(): number {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type Rng = () => number

export function pick<T>(rng: Rng, arr: readonly T[]): T {
  if (arr.length === 0) throw new Error('pick: empty array')
  const idx = Math.floor(rng() * arr.length)
  return arr[idx] as T
}

export function pickN<T>(rng: Rng, arr: readonly T[], n: number): T[] {
  const copy = [...arr]
  const out: T[] = []
  const target = Math.min(n, copy.length)
  for (let i = 0; i < target; i++) {
    const idx = Math.floor(rng() * copy.length)
    out.push(copy.splice(idx, 1)[0] as T)
  }
  return out
}

export function randInt(rng: Rng, lo: number, hi: number): number {
  return Math.floor(rng() * (hi - lo + 1)) + lo
}

/** Weighted pick. Weights need not sum to 1. */
export function weighted<T>(rng: Rng, items: readonly { value: T; weight: number }[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0)
  let r = rng() * total
  for (const it of items) {
    r -= it.weight
    if (r <= 0) return it.value
  }
  return items[items.length - 1]!.value
}

/**
 * Deterministic UUID v4-shaped string from the RNG. NOT cryptographically
 * random — that's the point: rerunning the seed produces the same ids, which
 * keeps cross-table FKs aligned.
 */
export function uuid(rng: Rng): string {
  const bytes = new Uint8Array(16)
  for (let i = 0; i < 16; i++) bytes[i] = Math.floor(rng() * 256)
  // Per RFC 4122 section 4.4: set version to 4 and variant to 10xx.
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x40
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
  return (
    hex.slice(0, 4).join('') +
    '-' +
    hex.slice(4, 6).join('') +
    '-' +
    hex.slice(6, 8).join('') +
    '-' +
    hex.slice(8, 10).join('') +
    '-' +
    hex.slice(10, 16).join('')
  )
}
