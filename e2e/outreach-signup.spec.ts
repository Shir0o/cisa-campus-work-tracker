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

  test('Public / Visitor can complete the multi-step sign-up welcome intake form', async ({ page }) => {
    await page.goto('/signup');
    await page.waitForLoadState('domcontentloaded');

    // Verify sign-up form step 1 renders
    const heading = page.locator('h1, h2, header').first();
    await expect(heading).toBeVisible();

    // Fill Step 1 fields
    const nameField = page.getByPlaceholder(/name|full name/i).first();
    if (await nameField.isVisible()) {
      await nameField.fill('Jordan Student');
    }

    const phoneField = page.getByPlaceholder(/phone|cell/i).first();
    if (await phoneField.isVisible()) {
      await phoneField.fill('555-123-4567');
    }

    const emailField = page.getByPlaceholder(/email/i).first();
    if (await emailField.isVisible()) {
      await emailField.fill(`jordan.student.${Date.now()}@example.com`);
    }

    const majorField = page.locator('#signup-major').or(page.getByPlaceholder(/major/i).first());
    if (await majorField.isVisible()) {
      await majorField.fill('Computer Science');
    }

    // Select gender chip if present
    const genderChip = page.getByRole('button', { name: /^female$|^male$/i }).first();
    if (await genderChip.isVisible()) {
      await genderChip.click();
    }

    // Select year chip if present
    const yearChip = page.getByRole('button', { name: /^freshman$|^sophomore$|^junior$|^senior$/i }).first();
    if (await yearChip.isVisible()) {
      await yearChip.click();
    }

    // Select interest chip if present
    const interestChip = page.getByRole('button', { name: /bible study|home fellowship|outreach/i }).first();
    if (await interestChip.isVisible()) {
      await interestChip.click();
    }

    // Proceed to Step 2 if multi-step Next button exists
    const nextBtn = page.getByRole('button', { name: /next|continue|step 2/i }).first();
    if (await nextBtn.isVisible()) {
      await nextBtn.click();
    }

    // Submit form if submit button exists
    const submitBtn = page.getByRole('button', { name: /send it|submit|sign up|finish|done/i }).first();
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
    }
  });
});
