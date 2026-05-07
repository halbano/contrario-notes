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
      'tests/**/*.test.ts',
    ],
    exclude: ['node_modules/**', '.next/**', 'drizzle/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
