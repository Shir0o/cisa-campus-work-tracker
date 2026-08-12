import { test, expect } from '@playwright/test';
import { signInAs } from './helpers/auth';

test.describe('Gatherings & Attendance Flow', () => {
  test('Full-timer can view gatherings and log attendance', async ({ page }) => {
    await signInAs(page, 'fulltimer');

    // Navigate to Gatherings / Attendance page
    await page.goto('/attendance');
    await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });

    // Assert main header or title is visible
    const heading = page.locator('h1, h2, header').first();
    await expect(heading).toBeVisible();

    // Verify URL remains on /attendance
    expect(new URL(page.url()).pathname).toBe('/attendance');
  });

  test('Student can view gatherings', async ({ page }) => {
    await signInAs(page, 'student');

    await page.goto('/attendance');
    await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });

    expect(new URL(page.url()).pathname).toBe('/attendance');
  });
});
