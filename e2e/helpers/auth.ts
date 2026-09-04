import { type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

import { DEFAULT_CREDENTIALS, type Role, type CredentialInfo } from './auth-defaults';

export type { Role, CredentialInfo as Cred };

const CREDS_PATH = resolve(__dirname, '../.test-credentials.json');

let cache: Record<Role, CredentialInfo> | null = null;

export function credentials(): Record<Role, CredentialInfo> {
  if (cache) return cache;
  if (process.env.VITE_USE_FIREBASE_EMULATOR === 'true' || process.env.USE_FIREBASE_EMULATOR === 'true') {
    cache = DEFAULT_CREDENTIALS;
    return DEFAULT_CREDENTIALS;
  }
  try {
    const raw = JSON.parse(readFileSync(CREDS_PATH, 'utf8'));
    cache = raw;
    return raw;
  } catch {
    // Fall back to emulator default credentials when .test-credentials.json is omitted
    cache = DEFAULT_CREDENTIALS;
    return DEFAULT_CREDENTIALS;
  }
}

export const ROLES: Role[] = ['fulltimer', 'trainee', 'trainee2', 'student', 'community'];

/** `WHATS_NEW_STORAGE_KEY` in src/lib/whatsNew.ts — inlined so e2e keeps its
 *  boundary with app source. Update both together if the key ever changes. */
const WHATS_NEW_STORAGE_KEY = 'cisa.whats_new.last_seen_id';

/**
 * Suppress the What's New popup for the whole browser context.
 *
 * The popup is a full-viewport `role="dialog"` overlay that opens whenever the
 * stored "last seen" release id is older than the latest one. Playwright starts
 * every test on a fresh profile, so nothing is stored and it opens on each load
 * and swallows clicks — which is what turned the nightly e2e suite red once it
 * shipped. `shouldShowWhatsNew` compares ids as strings, so a sentinel that
 * sorts above every dated id keeps it shut for future releases too.
 *
 * This runs as an init script, before app code, so the popup never mounts —
 * a dismissal click would race the first real interaction of the test.
 */
export async function suppressWhatsNew(page: Page) {
  await page.addInitScript(
    ([key, sentinel]) => {
      try {
        window.localStorage.setItem(key, sentinel);
      } catch {
        // Private-mode or blocked storage: the popup is then the least of it.
      }
    },
    [WHATS_NEW_STORAGE_KEY, '9999-12-31-v999.999.999'] as const,
  );
}

/**
 * Sign in as a real test user via the window.__e2eSignIn helper (email/password),
 * which firebase.ts exposes only when VITE_E2E_MODE=true.
 */
export async function signInAs(page: Page, role: Role) {
  const { email, password } = credentials()[role];
  await suppressWhatsNew(page);
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).__e2eSignIn === 'function', {
    timeout: 15_000,
  });
  await page.evaluate(
    ([e, p]) => (window as any).__e2eSignIn(e, p),
    [email, password] as const,
  );
  // Wait for the authed app shell (sidebar) to render
  await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });

  // Dismiss "A few things are different" ReleaseSheet modal if shown
  const carryOnBtn = page.getByRole('button', { name: /carry on/i });
  if (await carryOnBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await carryOnBtn.click().catch(() => {});
  }
}
