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
      // Current baseline (after P4 large views): ~63% lines, ~53% branches, ~57% functions, ~62% statements.
      // Raise these numbers as coverage improves toward 90%.
      thresholds: {
        lines: 63,
        branches: 53,
        functions: 57,
        statements: 62,
      },
    },
  },
});
