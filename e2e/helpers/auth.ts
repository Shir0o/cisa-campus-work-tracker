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

export const ROLES: Role[] = ['fulltimer', 'trainee', 'student', 'community'];

/**
 * Sign in as a real test user via the window.__e2eSignIn helper (email/password),
 * which firebase.ts exposes only when VITE_E2E_MODE=true.
 */
export async function signInAs(page: Page, role: Role) {
  const { email, password } = credentials()[role];
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
  const carryOnBtn = page.getByRole('button', { name: 'Carry on' });
  if (await carryOnBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await carryOnBtn.click();
  }
}
