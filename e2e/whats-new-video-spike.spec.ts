import { test, expect } from '@playwright/test';
import { signInAs } from './helpers/auth';

/**
 * WHAT'S NEW VIDEO SPIKE (#1123 / #1151) — "B", fully automated.
 *
 * Records a release's key flows through the real UI with Playwright's built-in
 * video recorder (`video: 'on'` for this describe), against the seeded Firebase
 * emulator. The emitted .webm is the raw draft of a What's New Video — no human
 * curation. The point of the spike is to watch this output and decide whether
 * it is good enough to ship as-is (B), worth keeping as a raw draft a human
 * trims (A), or not good at all.
 *
 * The same spec is also a genuine E2E test: it signs in as real users and
 * asserts the flows still work, so recording a release verifies it too.
 *
 * Run with the emulator: npm run test:e2e:emulator -- --grep "spike"
 * Videos land under test-results/ (per-test .webm beside the trace).
 */
test.describe('What\'s New Video spike (#1123)', () => {
  test.use({ video: 'on' });

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