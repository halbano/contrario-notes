import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'lib/**/*.test.ts',
      'logging/**/*.test.ts',
      'permissions/**/*.test.ts',
      'repositories/**/*.test.ts',
      'services/**/*.test.ts',
      'features/**/*.test.ts',
      'tests/**/*.test.ts',
      // VAL-13: component-level tests for the onboarding shell live next
      // to the components they cover so they travel with the code.
      'app/**/*.test.{ts,tsx}',
    ],
    exclude: ['node_modules/**', '.next/**', 'drizzle/**'],
    env: {
      // Suppress info-level logging in tests to keep CI output readable.
      LOG_LEVEL: 'error',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      // Next.js provides a virtual `server-only` module to fence server-only
      // imports out of the client bundle. Vitest doesn't ship that fence —
      // alias to a no-op so test runners can load modules that import it.
      'server-only': path.resolve(__dirname, './tests/helpers/server-only-shim.ts'),
    },
  },
})
