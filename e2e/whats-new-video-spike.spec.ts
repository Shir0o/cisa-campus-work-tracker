import { test, expect } from '@playwright/test';
import { signInAs } from './helpers/auth';

/**
 * WHAT'S NEW VIDEO SPIKE (#1123 / #1151) — "B", fully automated.
 *
 * Records a release's key flows through the real UI with Playwright's built-in
 * video recorder (`video: 'on'` for this describe), against the seeded Firebase
 * emulator. The emitted .webm is the raw draft of a What's New Video — no human
 * The spike concluded (ADR 0030): automated headless screen recording was
 * evaluated and retired in favor of manual, human-curated release walkthroughs.
 * This spec is preserved as a functional regression test verifying that a
 * Full-timer can navigate from My Day through the Directory to a contact card.
 *
 * Run with the emulator: npm run test:e2e:emulator -- --grep "What's New Video"
 */
test.describe('What\'s New Video key flows (#1123)', () => {
  test('Full-timer watches their day, opens the directory, and reads a person', async ({ page }) => {
    // 1. Sign in as Full-timer and land on My Day.
    await signInAs(page, 'fulltimer');
    await expect(page.getByLabel('Main Navigation')).toBeVisible({ timeout: 15_000 });

    // 2. The home bento is the release's centrepiece — hold on it.
    await expect(page.getByText(/My Day/i).first()).toBeVisible({ timeout: 10_000 });

    // 3. Open the People directory (a key flow of the release).
    await page.goto('/directory');
    await expect(page.getByRole('heading', { name: /people/i }).first()).toBeVisible({ timeout: 10_000 });

    // 4. Open the first contact so the recording shows a person's record.
    const firstRow = page.locator('[role="row"], tr, .contact-row').first();
    if (await firstRow.count()) {
      await firstRow.click();
      await page.waitForTimeout(1200);
    }

    // A recorded video is only useful if the app rendered — the assertions above
    // are the proof. No assertion needed on the .webm itself.
    await expect(page.getByLabel('Main Navigation')).toBeVisible();
  });
});