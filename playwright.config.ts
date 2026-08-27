import { defineConfig, devices } from '@playwright/test';

/**
 * E2E tests run against the REAL Firebase project (sac-campus-hub) using the
 * seeded email/password test users. No emulator / Java required.
 *
 * Requirements to run locally:
 *   - e2e/.test-credentials.json present (gitignored)
 *   - VITE_FIREBASE_API_KEY set in the environment (real web API key)
 *
 * The dev server is started in E2E mode so window.__e2eSignIn is exposed.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
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
      VITE_FIREBASE_FIRESTORE_DB_ID: process.env.VITE_FIREBASE_FIRESTORE_DB_ID || process.env.FIRESTORE_DATABASE_ID || 'qa-db',
      ...(process.env.VITE_FIREBASE_API_KEY
        ? { VITE_FIREBASE_API_KEY: process.env.VITE_FIREBASE_API_KEY }
        : { VITE_FIREBASE_API_KEY: 'fake-emulator-api-key' }),
    },
  },
});
