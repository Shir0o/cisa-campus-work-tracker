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
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**', '.claude/**', 'apps/**', 'packages/**', '.worktrees/**'],
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
        'src/lib/calendar/types.ts',
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
      // keyboard paths, modal close, task ordering), SmartImportModal
      // (commit failure paths, item toggles), ContactDetailsModal (all
      // snapshot/stages/update/delete/prayer/tag error paths, phone blur
      // edges, single-name split, comma tags, spiritual background, journey
      // & held-days, share-cancel, skeletons, mobile layout, audit hover),
      // Messages (taken-back label matrix, @mention highlighting, pinned
      // jump, take-back-for-everyone, conv-menu keep/away, send guards &
      // failures, rail filters & search, unread pill, member-fetch errors,
      // attachment/todo failures, mobile back + popstate), EditEventModal
      // (type fallback, pills, date/location, Esc, guards, failures),
      // SignUp (viewport switch, navigate-home, interest deselect,
      // honeypot/onSubmitted, notification broadcast failure, submit
      // failure, season override/reset/club-rush), MyDayMobile (prop
      // fallbacks, due presets, editor keys, empty commits, personal
      // checkbox, prayers-section picker), HistoryMobile (who-chip, sheet
      // close/scrim/apply) and CoordinationNotesMobile (new-page editor).
      // Measured totals: ~92.6% lines, ~79.7% branches, ~88.1% functions, ~90.8% statements.
      thresholds: {
        lines: 91.5,
        branches: 78.5,
        functions: 86.0,
        statements: 89.5,
      },
    },
  },
});
