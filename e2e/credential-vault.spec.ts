/**
 * The credential vault journey (#1967, ADR 0051).
 *
 * A Full-timer reaches the vault from its single door in Settings → Security,
 * unlocks it with the passphrase the seed sealed the fixture under, reveals the
 * fixture's password, adds an entry, and finds the vault locked again after a
 * reload — the key lives in page state and nowhere else.
 *
 * Negative check in the same journey: a Trainee who follows the URL is bounced
 * home and has no door in Settings. The route gate reads the effective role, so
 * the door is what hides the vault, not the Firestore rules.
 *
 * The fixture (salt, iteration count, passphrase, entry) is seeded by
 * `scripts/seed-emulator.ts` from `e2e/helpers/vault-fixture.ts`.
 */

import { test, expect, type Page } from '@playwright/test';
import { signInAs } from './helpers/auth';
import { VAULT_ENTRY, VAULT_PASSPHRASE } from './helpers/vault-fixture';

const CREATED_LABEL = `Vault tester ${Date.now()}`;

async function waitForShell(page: Page) {
  await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });
}

test('a Full-timer opens the vault, unlocks, adds an entry, and a reload locks it again (#1967)', async ({
  page,
}) => {
  await signInAs(page, 'fulltimer');

  // The door, not the URL: this is the only way into the vault.
  await page.goto('/settings');
  await waitForShell(page);
  await page.getByRole('link', { name: 'Open the vault' }).click();
  await page.waitForURL((url) => url.pathname === '/vault', { timeout: 10_000 });

  // Locked: the fixture is in Firestore but nothing is decrypted yet.
  await expect(page.getByRole('heading', { name: 'Locked' })).toBeVisible();
  await expect(page.getByLabel('Passphrase')).toBeVisible();
  await expect(page.getByRole('heading', { name: VAULT_ENTRY.label })).toHaveCount(0);

  await page.getByLabel('Passphrase').fill(VAULT_PASSPHRASE);
  await page.getByRole('button', { name: 'Unlock' }).click();

  await expect(page.getByRole('heading', { name: VAULT_ENTRY.label })).toBeVisible({ timeout: 10_000 });

  // Masked until reveal, and the reveal is the audited event.
  const password = page.getByTestId('vault-password').first();
  await expect(password).toHaveText('••••••••');
  await page.getByRole('button', { name: 'Show password' }).first().click();
  await expect(password).toHaveText(VAULT_ENTRY.password);

  // The audit is readable, not merely written.
  await page.getByText('Recent activity').click();
  await expect(page.getByText('Unlocked the vault').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Revealed a password').first()).toBeVisible({ timeout: 10_000 });

  // A new entry round-trips through the real write path.
  await page.getByRole('button', { name: 'Add an entry' }).click();
  await page.getByLabel('Label').fill(CREATED_LABEL);
  await page.getByLabel('Username').fill('new.login@example.org');
  await page.getByLabel('Password', { exact: true }).fill('a-new-secret');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: CREATED_LABEL })).toBeVisible({ timeout: 10_000 });

  // A reload re-prompts: the key never left this page's state.
  await page.reload();
  await expect(page.getByLabel('Passphrase')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('heading', { name: CREATED_LABEL })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: VAULT_ENTRY.label })).toHaveCount(0);
});

test('a Trainee is redirected away from /vault and has no door in Settings (#1967)', async ({
  page,
}) => {
  await signInAs(page, 'trainee');

  await page.goto('/vault');
  await page.waitForURL((url) => url.pathname !== '/vault', { timeout: 10_000 });
  expect(new URL(page.url()).pathname).toBe('/');

  await page.goto('/settings');
  await waitForShell(page);
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open the vault' })).toHaveCount(0);
  await expect(page.getByText('Credential vault')).toHaveCount(0);
});
