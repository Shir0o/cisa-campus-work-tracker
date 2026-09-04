import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { WHATS_NEW_STORAGE_KEY } from '../../src/lib/whatsNew';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MANIFEST_PATH = resolve(__dirname, '../../src/generated/whats-new.json');

/**
 * Sorts above any real release id, so the popup stays closed even if the
 * manifest is missing/empty when the suite runs.
 */
const FUTURE_RELEASE_ID = '9999-12-31-e2e';

function latestReleaseId(): string {
  try {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as {
      latestReleaseId?: string | null;
    };
    return manifest.latestReleaseId || FUTURE_RELEASE_ID;
  } catch {
    return FUTURE_RELEASE_ID;
  }
}

/**
 * Every Playwright test starts from a fresh browser profile, so the "What's
 * New" popup (src/components/WhatsNewModal.tsx) would open on load for every
 * single test and swallow clicks behind its full-viewport backdrop. Marking
 * the current release as already seen — before the app boots — keeps the popup
 * out of the way without weakening it for real users.
 *
 * Wired into `use.storageState` in playwright.config.ts so it applies to every
 * context, including specs that call `test.use({ ... })` for a viewport.
 */
export const whatsNewSeenStorageState = {
  cookies: [],
  origins: [
    {
      origin: 'http://localhost:3000',
      localStorage: [{ name: WHATS_NEW_STORAGE_KEY, value: latestReleaseId() }],
    },
  ],
};
