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
    // e2e/ holds Playwright specs — run those via `npm run test:e2e`, not Vitest
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**', '.claude/**'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/test/**',
        'src/**/*.d.ts',
        'src/main.tsx',
        'src/lib/yjsRtdbProvider.ts',
        'src/constants.ts',
        'src/services/sheetsService.ts',
      ],
      // Current baseline (after Phase 6 coverage ratchet): ~79.5% lines, ~65.6% branches, ~70.3% functions, ~77.6% statements.
      // Enforce baseline coverage to prevent regression.
      thresholds: {
        lines: 79,
        branches: 65,
        functions: 70,
        statements: 77,
      },
    },
  },
});
