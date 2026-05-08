// Vitest shim for Next.js's virtual `server-only` module. The real module
// throws at build time if imported into a client component; tests run in
// Node and don't have that fence, so the shim is intentionally empty.
export {}
