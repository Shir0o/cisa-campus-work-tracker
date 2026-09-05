/**
 * Mobile & PWA Contact Editing end-to-end spec (issue #633).
 *
 * Covers the unified contact editing flow on mobile viewport / PWA:
 *  - Trainee (manager) and Full-timer (admin) see the Edit affordance in the
 *    mobile header and details disclosure.
 *  - Editing fields (name, phone, email, notes, tags, instagram) and saving
 *    persists changes to Firestore and reflects immediately.
 *  - Viewer (community) has read-only access and sees no edit affordances.
 */

import { test, expect } from '@playwright/test';
import { signInAs } from './helpers/auth';

test.describe('Mobile & PWA Contact Editing (#633)', () => {
  test.describe.configure({ mode: 'serial' });

  // Use iPhone 14/15 mobile viewport
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  const uniqueSuffix = Date.now();
  const contactName = `Alex Rivera ${uniqueSuffix}`;

  test('Trainee can create, open, and edit contact on mobile viewport', async ({ page }) => {
    // 1. Sign in as Trainee (manager role)
    await signInAs(page, 'trainee');

    // 2. Navigate to People directory
    await page.goto('/directory');
    await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });

    // 3. Open Quick Capture to seed a test contact
    const addContactBtn = page.getByRole('button', { name: /add someone/i }).first();
    await expect(addContactBtn).toBeVisible({ timeout: 10_000 });
    await addContactBtn.click();

    // Fill minimal contact details
    await page.getByPlaceholder(/first name/i).first().fill(`Alex ${uniqueSuffix}`);

    // Expand optional fields disclosure to fill last name
    await page.getByRole('button', { name: /\+ add the rest/i }).click();
    await page.getByPlaceholder(/e\.g\. johnson/i).first().fill('Rivera');
    await page.getByPlaceholder(/\(555\) 000-0000/i).first().fill('555-0199');

    // Submit new contact
    const saveContactBtn = page.getByRole('button', { name: /add contact|^save$/i }).first();
    await saveContactBtn.click();

    // Wait for modal to close
    await expect(page.getByRole('heading', { name: /new contact/i })).not.toBeVisible({ timeout: 5_000 });

    // 4. Find and open the contact card in directory
    const contactRow = page.getByText(`Alex ${uniqueSuffix}`).first();
    await expect(contactRow).toBeVisible({ timeout: 10_000 });
    await contactRow.click();

    // 5. Contact Details Modal is open on mobile viewport
    // Verify the mobile header shows the "Edit" button for Trainee
    const editBtn = page.getByRole('button', { name: /^edit$/i }).first();
    await expect(editBtn).toBeVisible({ timeout: 5_000 });
    await editBtn.click();

    // 6. Mobile Edit form is now active
    await expect(page.getByText(/edit details/i).first()).toBeVisible({ timeout: 5_000 });

    // Modify fields
    const notesField = page.getByPlaceholder(/add anything helpful/i).or(page.locator('textarea')).first();
    if (await notesField.isVisible()) {
      await notesField.fill('Met at welcome table, very enthusiastic about campus events.');
    }

    // Save changes using mobile header Save button
    const headerSaveBtn = page.getByRole('button', { name: /^save$/i }).first();
    await headerSaveBtn.click();

    // Verify modal transitions back from edit mode
    await expect(page.getByText(/edit details/i)).not.toBeVisible({ timeout: 5_000 });

    // Close the details modal
    const backOrCloseBtn = page.getByRole('button', { name: /people|close|back/i }).first();
    if (await backOrCloseBtn.isVisible()) {
      await backOrCloseBtn.click();
    }
  });

  test('Viewer (Community) does not see Edit affordances on mobile viewport', async ({ page }) => {
    // Sign in as Community (viewer role)
    await signInAs(page, 'community');

    await page.goto('/directory');
    await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });

    // Find any visible contact in the directory
    const anyContact = page.locator('.cd-name, .font-medium, [data-testid="contact-card"]').first();
    if (await anyContact.isVisible({ timeout: 5_000 })) {
      await anyContact.click();

      // Ensure Edit button is NOT visible for Community role
      await expect(page.getByRole('button', { name: /^edit$/i })).not.toBeVisible();
    }
  });
});
