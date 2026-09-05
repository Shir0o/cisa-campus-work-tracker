import { defineConfig, devices } from '@playwright/test';

import { whatsNewSeenStorageState } from './e2e/helpers/whats-new';

/**
 * Web E2E tests. Default (and CI) mode is the Firebase Local Emulator:
 * `npm run test:e2e:emulator` boots Auth + Firestore emulators, seeds them via
 * scripts/seed-emulator.ts, and runs this suite with zero cloud secrets.
 * VITE_USE_FIREBASE_EMULATOR=false + a real VITE_FIREBASE_API_KEY switches the
 * dev server started below to the real sac-campus-hub project instead.
 *
 * The dev server is started in E2E mode so window.__e2eSignIn is exposed.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    // Fresh profiles would otherwise pop the "What's New" modal on every page
    // load; its full-viewport backdrop intercepts clicks and every spec times
    // out. Seed the "already seen" key instead of dismissing it per test.
    storageState: whatsNewSeenStorageState,
    // Retries are off by design (determinism) — keep traces for failures so
    // the CI report upload is actually useful.
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: true,
    timeout: 60_000,
    env: {
      VITE_E2E_MODE: 'true',
      VITE_USE_FIREBASE_EMULATOR: process.env.VITE_USE_FIREBASE_EMULATOR ?? 'true',
      VITE_FIREBASE_PROJECT_ID: process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || 'sac-campus-hub',
      VITE_FIREBASE_FIRESTORE_DB_ID: process.env.VITE_FIREBASE_FIRESTORE_DB_ID || process.env.FIRESTORE_DATABASE_ID || 'qa-db',
      ...(process.env.VITE_FIREBASE_API_KEY
        ? { VITE_FIREBASE_API_KEY: process.env.VITE_FIREBASE_API_KEY }
        : { VITE_FIREBASE_API_KEY: 'fake-emulator-api-key' }),
    },
  },
});
