import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
  // cwd rather than __dirname: this file is ESM, where __dirname does not exist,
  // and `npm test` always runs from the repo root.
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
      'server-only': path.resolve(process.cwd(), '__mocks__/server-only.js'),
    },
  },
})
