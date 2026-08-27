import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@': path.join(root, 'src'),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'scripts/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['src/lib/**/*.ts', 'src/lib/**/*.mjs'],
      exclude: [
        'src/**/*.test.ts',
        'src/lib/**/*.d.ts',
        // Theme / Tamagui / glass tokens — no meaningful unit surface
        'src/lib/theme.ts',
        'src/lib/tamagui.config.ts',
        'src/lib/glass.ts',
        'src/lib/os-logos.ts',
        // Barrel re-exports
        'src/lib/compose/index.ts',
        'src/lib/compose/types.ts',
        'src/lib/queries/index.ts',
      ],
    },
  },
})
