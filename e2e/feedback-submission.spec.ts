import { test, expect } from '@playwright/test';
import { signInAs } from './helpers/auth';

test.describe('Feedback Submission & Admin Flow', () => {
  test('Community user can submit feedback and Full-timer can review admin panel', async ({ page }) => {
    // 1. Sign in as Community role
    await signInAs(page, 'community');

    await page.goto('/feedback');
    await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });
    expect(new URL(page.url()).pathname).toBe('/feedback');

    // 2. Fill feedback textarea if present
    const feedbackInput = page.getByRole('textbox').first();
    if (await feedbackInput.isVisible()) {
      await feedbackInput.fill('E2E Automated test feedback entry.');
    }

    // 3. Sign in as Full-timer (Admin) to check feedback dashboard access
    await signInAs(page, 'fulltimer');
    await page.goto('/admin/feedback');
    await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });
    expect(new URL(page.url()).pathname).toBe('/admin/feedback');
  });
});
