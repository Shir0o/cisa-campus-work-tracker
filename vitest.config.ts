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
      include: ['src/**/*.{ts,tsx}', 'server.ts'],
      exclude: [
        'src/test/**',
        'src/**/*.d.ts',
        'src/main.tsx',
        'src/lib/yjsRtdbProvider.ts',
        'src/constants.ts',
      ],
      // Baseline after adding server.ts and the *Mobile.tsx views to the
      // coverage scope (previously 0% and invisible). New measured totals:
      // ~86.7% lines, ~74.4% branches, ~80.1% functions, ~84.8% statements.
      // Re-baselined thresholds (scope changes, not regressions) with a small
      // buffer to prevent flaky single-line regressions from failing CI.
      // Known weak spot: MyDayMobile.tsx (~38% — shallow pre-existing test).
      thresholds: {
        lines: 86.3,
        branches: 74.0,
        functions: 79.5,
        statements: 84.4,
      },
    },
  },
});
