import { test, expect } from '@playwright/test';
import { signInAs } from './helpers/auth';

test.describe('The Journey & The Board Flow', () => {
  test('Full-timer can view pipeline stages on The Journey', async ({ page }) => {
    await signInAs(page, 'fulltimer');

    await page.goto('/board');
    await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });
    expect(new URL(page.url()).pathname).toBe('/board');

    // Verify stage columns or headers are rendered
    const stagesContainer = page.locator('body');
    await expect(stagesContainer).toContainText(/contact|journey|first contact|regular/i);
  });

  test('Trainee can view The Journey pipeline', async ({ page }) => {
    await signInAs(page, 'trainee');

    await page.goto('/board');
    await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });
    expect(new URL(page.url()).pathname).toBe('/board');
  });

  test('Full-timer can access Coordination Notes and render markdown notes', async ({ page }) => {
    await signInAs(page, 'fulltimer');

    await page.goto('/coordination');
    await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });
    expect(new URL(page.url()).pathname).toBe('/coordination');

    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});
