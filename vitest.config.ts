import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';

export default defineConfig({
  // Real Next.js builds use the automatic JSX runtime (no `React` import
  // needed in scope) -- vitest's default esbuild transform doesn't infer
  // that from this repo's tsconfig `"jsx": "preserve"`, and falls back to
  // the classic transform instead, which throws "React is not defined" the
  // moment a test actually renders a .tsx file's JSX (as opposed to just
  // type-checking it) -- a real latent gap, only surfaced once a test
  // exercised @react-pdf/renderer's rendering path (DR-137) for the first
  // time; itinerary/map-pdf.tsx and finance/package-summary-pdf.tsx have
  // had this same bug all along, just never actually rendered under vitest.
  esbuild: { jsx: 'automatic' },
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
