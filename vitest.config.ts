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
      // Re-baselined & ratcheted thresholds after adding unit tests for the
      // season settings lib, visits/threads libs, the mobile prayer list, the
      // feedback capture paths, and the attach/chat detail modals.
      // Measured totals: ~89.1% lines, ~76.5% branches, ~83.4% functions, ~87.0% statements.
      thresholds: {
        lines: 88.5,
        branches: 76.0,
        functions: 83.0,
        statements: 86.5,
      },
    },
  },
});
