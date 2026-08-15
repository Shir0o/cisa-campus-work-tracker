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
      // Re-baselined & ratcheted thresholds after extending coverage in the
      // firebase lib (env-dependent init paths), TodoRow subtasks, the
      // AttachDataModal tab error/role-change paths, LogInteractionModal
      // (reset/error/trainee/batch paths), NotificationCenter (tones, web
      // push, error paths, navigation), server.ts (GitHub sync branches,
      // auth acceptance, prompt composition, static serving), PrayerList
      // (avatar, search/suggestions, burden error paths), GlobalSearch
      // (quick actions, result rows, keyboard nav, click-away, listener
      // errors, mobile focus), AddEventModal (monthly recurrence, type
      // fallback, Nth-weekday fallback, end-date bounds), CreateChatModal
      // (Esc, fetch error, chip deselect, group fallback name, error
      // paths, tab reset), MyDay (mobile shell, picker close, task-editor
      // keyboard paths, modal close, task ordering), and SmartImportModal
      // (commit failure paths, item toggles).
      // Measured totals: ~91.3% lines, ~78.5% branches, ~85.4% functions, ~89.4% statements.
      thresholds: {
        lines: 91.0,
        branches: 78.0,
        functions: 85.0,
        statements: 89.0,
      },
    },
  },
});
