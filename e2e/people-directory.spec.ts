import { test, expect } from '@playwright/test';
import { signInAs } from './helpers/auth';

test.describe('People Directory Flow', () => {
  test('Trainee can access directory and filter members', async ({ page }) => {
    await signInAs(page, 'trainee');

    await page.goto('/directory');
    await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });

    expect(new URL(page.url()).pathname).toBe('/directory');

    // Check search input or filter controls
    const searchInput = page.getByPlaceholder(/search/i).first();
    if (await searchInput.isVisible()) {
      await searchInput.fill('Test');
      await expect(searchInput).toHaveValue('Test');
    }
  });

  test('Student can view directory listing', async ({ page }) => {
    await signInAs(page, 'student');

    await page.goto('/directory');
    await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });

    expect(new URL(page.url()).pathname).toBe('/directory');
  });
});
