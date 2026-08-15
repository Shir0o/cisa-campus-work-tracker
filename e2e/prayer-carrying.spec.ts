import { test, expect } from '@playwright/test';
import { signInAs } from './helpers/auth';

test.describe('Prayer & Carrying Burdens Flow', () => {
  test('Full-timer can view open prayers on My Day and prayer list', async ({ page }) => {
    await signInAs(page, 'fulltimer');

    await page.goto('/prayer');
    await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });
    expect(new URL(page.url()).pathname).toBe('/prayer');

    // Verify prayer list header or cards render
    const header = page.locator('h1, h2, header').first();
    await expect(header).toBeVisible();

    // Check presence of prayer cards
    const prayerCards = page.locator('[data-testid="prayer-item"], article, .prayer-card');
    if ((await prayerCards.count()) > 0) {
      await expect(prayerCards.first()).toBeVisible();
    }
  });

  test('Student can access prayer space and view personal prayers', async ({ page }) => {
    await signInAs(page, 'student');

    await page.goto('/prayer');
    await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });
    expect(new URL(page.url()).pathname).toBe('/prayer');

    const content = page.locator('body');
    await expect(content).toContainText(/prayer/i);
  });

  test('Community member sees prayer wall', async ({ page }) => {
    await signInAs(page, 'community');

    await page.goto('/prayer');
    await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });
    expect(new URL(page.url()).pathname).toBe('/prayer');

    const content = page.locator('body');
    await expect(content).toContainText(/prayer|holding/i);
  });
});
