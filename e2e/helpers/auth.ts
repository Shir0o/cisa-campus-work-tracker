import { type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Display-name keys for the four roles (mapped to internal role keys in the creds file). */
export type Role = 'fulltimer' | 'trainee' | 'student' | 'community';

interface Cred {
  email: string;
  password: string;
  role: 'admin' | 'manager' | 'operator' | 'viewer';
  label: string;
}

const CREDS_PATH = resolve(__dirname, '../.test-credentials.json');

let cache: Record<Role, Cred> | null = null;

export function credentials(): Record<Role, Cred> {
  if (cache) return cache;
  try {
    const raw = JSON.parse(readFileSync(CREDS_PATH, 'utf8'));
    cache = raw;
    return raw;
  } catch {
    throw new Error(
      `Missing ${CREDS_PATH}. Create it from the four real Firebase test users ` +
        `(see the project memory "e2e-test-users"). This file is gitignored.`,
    );
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
}
