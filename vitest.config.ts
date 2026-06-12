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
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/test/**', 'src/**/*.d.ts'],
      // Current baseline: ~24% lines/statements, ~17% branches/functions.
      // Dipped from ~27% when the large, AI-generated CoordinationNotes view
      // (1.4k lines, currently untested) landed — see the coordination-notes
      // test follow-up. Raise these numbers as coverage improves toward 90%.
      thresholds: {
        lines: 22,
        branches: 15,
        functions: 15,
        statements: 22,
      },
    },
  },
});
