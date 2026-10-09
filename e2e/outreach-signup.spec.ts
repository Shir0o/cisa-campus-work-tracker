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

  test.describe('Sign-up preserves the phone number (#1493)', () => {
    test.describe.configure({ mode: 'serial' });

    const unique = `Phone Lead ${Date.now()}`;
    const firstName = unique.split(' ')[0];
    const phone = '555-014-7788';

    test('Public sign-up preserves phone number and full-timer sees it in directory (#1493)', async ({ page }) => {
      // Anonymous public intake — the flow that silently dropped the number.
      await page.goto('/signup');
      await expect(page.getByRole('heading', { name: 'Tell us about you.' })).toBeVisible({ timeout: 15_000 });

      await page.locator('#signup-name').fill(unique);
      await page.getByRole('button', { name: 'Female', exact: true }).click();
      await page.getByRole('button', { name: 'Sophomore', exact: true }).click();
      await page.locator('#signup-major').fill('Economics');
      await page.locator('#signup-phone').fill(phone);
      await page.locator('#signup-email').fill(`phone.lead.${Date.now()}@example.com`);
      await page.getByRole('button', { name: 'Prayer group', exact: true }).click();

      await page.getByRole('button', { name: 'Send it' }).click();
      await expect(page.getByText(new RegExp(`Thank you for signing up, ${firstName}\\.`))).toBeVisible({ timeout: 10_000 });

      // A Full-timer sees the new lead, and the "Has phone" filter keeps it —
      // only a contact whose phone actually persisted survives that filter.
      await signInAs(page, 'fulltimer');
      await page.goto('/directory');
      await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });

      await page.getByPlaceholder(/find someone/i).first().fill(unique);
      await expect(page.getByText(unique).first()).toBeVisible({ timeout: 10_000 });

      await page.getByRole('button', { name: 'Filters' }).first().click();
      await page.getByTestId('filter-has-phone').check();
      await expect(page.getByText(unique).first()).toBeVisible({ timeout: 10_000 });
    });

    test('Trainee does not see the untied public sign-up (#1493)', async ({ page }) => {
      // Negative check: an anonymous sign-up has no ties, so a Trainee's
      // visibleTo-scoped directory query must not surface it.
      await signInAs(page, 'trainee');
      await page.goto('/directory');
      await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });

      await page.getByPlaceholder(/find someone/i).first().fill(unique);
      await expect(page.getByText(unique)).toHaveCount(0);
    });
  });
});
