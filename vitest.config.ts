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
    },
  },
})
