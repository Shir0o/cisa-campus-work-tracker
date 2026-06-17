import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
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
      exclude: ['src/test/**', 'src/**/*.d.ts'],
      // Current baseline (after Phase 5 modal/layout coverage): ~74% lines, ~61% branches, ~66% functions, ~72% statements.
      // Raise these numbers as coverage improves toward 90%.
      thresholds: {
        lines: 74,
        branches: 61,
        functions: 66,
        statements: 72,
      },
    },
  },
});
