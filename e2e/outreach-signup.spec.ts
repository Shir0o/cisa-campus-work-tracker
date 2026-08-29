import { test, expect } from '@playwright/test';
import { signInAs } from './helpers/auth';

test.describe('Outreach & Sign-Up Intake Flow', () => {
  test('Full-timer can view outreach history and log outings', async ({ page }) => {
    await signInAs(page, 'fulltimer');

    await page.goto('/outreach');
    await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });
    expect(new URL(page.url()).pathname).toBe('/outreach');

    const content = page.locator('body');
    await expect(content).toContainText(/outreach|outing|park/i);
  });

  test('Community member can access outreach view', async ({ page }) => {
    await signInAs(page, 'community');

    await page.goto('/outreach');
    await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });
    expect(new URL(page.url()).pathname).toBe('/outreach');
  });

  test('Public / Visitor can complete the sign-up intake form', async ({ page }) => {
    await page.goto('/signup');

    // The intake form renders with its required-field heading
    await expect(page.getByRole('heading', { name: 'Tell us about you.' })).toBeVisible({ timeout: 15_000 });

    // Fill every required field via the form's stable ids / chip buttons
    await page.locator('#signup-name').fill('Jordan Student');
    await page.getByRole('button', { name: 'Male', exact: true }).click();
    await page.getByRole('button', { name: 'Freshman', exact: true }).click();
    await page.locator('#signup-major').fill('Computer Science');
    await page.locator('#signup-phone').fill('555-123-4567');
    await page.locator('#signup-email').fill(`jordan.student.${Date.now()}@example.com`);
    await page.getByRole('button', { name: 'Bible study', exact: true }).click();

    // Submit stays disabled until the form is valid, then lands on the success screen
    const submitBtn = page.getByRole('button', { name: 'Send it' });
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();
    await expect(page.getByText(/Thank you for signing up, Jordan\./)).toBeVisible({ timeout: 10_000 });
  });
});
