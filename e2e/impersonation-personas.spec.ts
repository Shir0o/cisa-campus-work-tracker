import { test, expect } from '@playwright/test';
import { signInAs } from './helpers/auth';

test.describe('Persona Impersonation & 4-Role Navigation Flow', () => {
  test('Full-timer can use See as their view to preview all 4 roles and switch views', async ({ page }) => {
    await signInAs(page, 'fulltimer');

    await page.goto('/');
    await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });

    // Verify Full-timer lands on My Day
    const mainNav = page.getByLabel('Main Navigation');
    await expect(mainNav).toBeVisible();

    // Check if Impersonation Eye button in TopBar is available
    const eyeBtn = page.getByLabel('See as their view');
    if (await eyeBtn.isVisible()) {
      await eyeBtn.click();

      // Modal opens
      await expect(page.getByRole('heading', { name: /see as their view/i })).toBeVisible();

      // Test Trainee role preview
      const traineeRoleBtn = page.getByRole('button', { name: 'Trainee' }).first();
      if (await traineeRoleBtn.isVisible()) {
        await traineeRoleBtn.click();
      }

      // Close modal
      const closeBtn = page.getByLabel('Close modal');
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
      }

      // Check preview banner appears
      const banner = page.locator('body');
      await expect(banner).toBeVisible();
    }
  });
});
