import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    testTimeout: 15000,
    setupFiles: ['./src/test/setup.ts'],
    // e2e/ holds Playwright specs — run those via `npm run test:e2e`, not Vitest.
    // apps/** and packages/** are separate projects with their own test runners
    // (e.g. `cd packages/core && npm test`) — don't pull them into the web app's
    // run or they'd skew its coverage totals.
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**', '.claude/**', 'apps/**', 'packages/**'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/test/**',
        'src/**/*.d.ts',
        'src/main.tsx',
        'src/lib/yjsRtdbProvider.ts',
        'src/constants.ts',
        'src/services/sheetsService.ts',
        'src/views/*Mobile.tsx',
      ],
      // Current baseline (after Phase 7 coverage ratchet): ~88.7% lines, ~77.6% branches, ~82.1% functions, ~87.1% statements.
      // Enforce baseline coverage to prevent regression.
      thresholds: {
        lines: 87.5,
        branches: 75.5,
        functions: 81,
        statements: 85.5,
      },
    },
  },
});
