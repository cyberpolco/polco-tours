import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // RLS tests need a real Postgres; run serially to keep session GUCs clean.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
    coverage: {
      provider: 'v8',
      // Service-layer logic only (CLAUDE.md: >=80% coverage target) --
      // route handlers/schema/scripts are exercised by CI's API/RLS tests
      // against real Postgres instead of unit-test line coverage.
      include: ['src/lib/**', 'src/modules/**'],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 70,
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@lib': fileURLToPath(new URL('./src/lib', import.meta.url)),
      '@modules': fileURLToPath(new URL('./src/modules', import.meta.url)),
    },
  },
});
