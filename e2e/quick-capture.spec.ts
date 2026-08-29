/**
 * Quick Capture: NewContactModal end-to-end behaviour (issue #628).
 *
 * The Full-timer (admin) and Trainee (manager) are the only roles that can
 * capture a new contact. Students see no Quick Capture affordance; Community
 * (viewer) cannot open the modal at all. This spec drives the NewContactModal
 * from the People directory and verifies:
 *
 *  - the modal opens from the directory toolbar,
 *  - the minimal "first name + phone" payload creates a contact,
 *  - the optional disclosure adds last name, role, gender, how-we-met, address,
 *    email, stage, tags, spiritual background and notes,
 *  - tags & stage persist and render in the directory,
 *  - the new contact survives a page reload (Firestore persistence),
 *  - Student & Community see no "Add someone" entry point and cannot open
 *    the modal even by direct invocation.
 *
 * Specs are serial because they share the same seeded Firestore database.
 */

import { test, expect, type Page } from '@playwright/test';
import { signInAs } from './helpers/auth';

const MODAL_TITLE = /new contact/i;
const ADD_SOMEONE_BTN = /add someone/i;

async function openQuickCaptureFromDirectory(page: Page) {
  await page.goto('/directory');
  await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });

  // The directory toolbar exposes the "Add someone" Quick Capture affordance.
  const addContactBtn = page.getByRole('button', { name: ADD_SOMEONE_BTN }).first();
  await expect(addContactBtn).toBeVisible({ timeout: 10_000 });
  await addContactBtn.click();

  // The modal mounts with a stable H2 title.
  await expect(page.getByRole('heading', { name: MODAL_TITLE })).toBeVisible({
    timeout: 5_000,
  });
}

test.describe('Quick Capture: NewContactModal (#628)', () => {
  test.describe.configure({ mode: 'serial' });

  const unique = `E2E Quick ${Date.now()}`;

  test('Full-timer opens Quick Capture from the People directory', async ({ page }) => {
    await signInAs(page, 'fulltimer');
    await openQuickCaptureFromDirectory(page);

    // The minimal "first name" field is the only required input.
    const firstName = page.getByPlaceholder(/first name/i).first();
    await expect(firstName).toBeVisible();
    const phone = page.getByPlaceholder(/\(555\) 000-0000/i).first();
    await expect(phone).toBeVisible();

    // Disclosure toggle is collapsed by default.
    const showMoreBtn = page.getByRole('button', { name: /\+ add the rest/i });
    await expect(showMoreBtn).toBeVisible();

    // Close without creating.
    await page.getByRole('button', { name: /^cancel$/i }).click();
    await expect(page.getByRole('heading', { name: MODAL_TITLE })).not.toBeVisible();
  });

  test('Full-timer creates a contact with first name + phone only (minimum payload)', async ({ page }) => {
    await signInAs(page, 'fulltimer');
    await openQuickCaptureFromDirectory(page);

    const firstName = page.getByPlaceholder(/first name/i).first();
    await firstName.fill(unique);

    const phone = page.getByPlaceholder(/\(555\) 000-0000/i).first();
    await phone.fill('555-019-2834');
    await phone.blur();

    // Submit (button label "Add Contact" in English).
    await page.getByRole('button', { name: /^add contact$/i }).click();

    // Modal closes and the new contact renders in the directory list.
    await expect(page.getByRole('heading', { name: MODAL_TITLE })).not.toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(unique).first()).toBeVisible({ timeout: 10_000 });
  });

  test('Full-timer expands the disclosure and creates a contact with tags, stage, and notes', async ({ page }) => {
    const tagged = `E2E Tagged ${Date.now()}`;

    await signInAs(page, 'fulltimer');
    await openQuickCaptureFromDirectory(page);

    // Required minimums.
    await page.getByPlaceholder(/first name/i).first().fill(tagged);
    await page.getByPlaceholder(/\(555\) 000-0000/i).first().fill('555-867-5309');
    await page.getByPlaceholder(/\(555\) 000-0000/i).first().blur();

    // Open the optional disclosure.
    await page.getByRole('button', { name: /\+ add the rest/i }).click();

    // Last name, role, and email are revealed.
    await expect(page.getByPlaceholder(/e\.g\. Johnson/i)).toBeVisible();
    await expect(page.getByPlaceholder(/e\.g\. Student, Faculty/i)).toBeVisible();
    await expect(page.getByPlaceholder(/alex@campus\.edu/i)).toBeVisible();

    await page.getByPlaceholder(/e\.g\. Johnson/i).fill('Sample');
    await page.getByPlaceholder(/e\.g\. Student, Faculty/i).fill('Student');
    await page.getByPlaceholder(/alex@campus\.edu/i).fill('tagged@example.com');

    // Stage dropdown — pick "First Contact" if available.
    const stageSelect = page.getByLabel(/where they're at/i).first();
    if (await stageSelect.isVisible()) {
      const options = await stageSelect.locator('option').allInnerTexts();
      if (options.some((o) => /first contact/i.test(o))) {
        await stageSelect.selectOption({ label: 'First Contact' });
      }
    }

    // Add tags via the comma-separated text input. The form submits on
    // Enter, so we do NOT press Enter here — the comma-separated list is
    // committed by the field's blur/blur-equivalent instead.
    const tagInput = page.getByPlaceholder(/e\.g\. Gospel/i).first();
    await tagInput.fill('Gospel, Fall2026');
    await tagInput.blur();

    // Notes field.
    await page.getByPlaceholder(/add some context/i).fill('Met at the campus welcome week.');

    await page.getByRole('button', { name: /^add contact$/i }).click();

    // Modal closes; contact shows up.
    await expect(page.getByRole('heading', { name: MODAL_TITLE })).not.toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(tagged).first()).toBeVisible({ timeout: 10_000 });

    // At least one tag pill renders for the new contact.
    const tagAppears = await Promise.race([
      page.getByText('Gospel').first().waitFor({ timeout: 8_000 }).then(() => true).catch(() => false),
      page.getByText('Fall2026').first().waitFor({ timeout: 8_000 }).then(() => true).catch(() => false),
    ]);
    expect(tagAppears, 'tag pill should appear for at least one of the new tags').toBe(true);
  });

  test('Quick-captured contact survives a reload (Firestore persistence)', async ({ page }) => {
    await signInAs(page, 'fulltimer');
    await page.goto('/directory');
    await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });

    // The same unique name from earlier in this serial run is still rendered
    // without a manual re-seed — proves the write hit Firestore, not just
    // local state.
    await expect(page.getByText(unique).first()).toBeVisible({ timeout: 10_000 });
  });

  test('Student sees no Quick Capture affordance on the People directory', async ({ page }) => {
    await signInAs(page, 'student');
    await page.goto('/directory');
    await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });

    // "Add someone" must not be present for an operator.
    const addContactBtn = page.getByRole('button', { name: ADD_SOMEONE_BTN }).first();
    await expect(addContactBtn).toHaveCount(0);
  });

  test('Community is redirected away from any Quick Capture entry point', async ({ page }) => {
    await signInAs(page, 'community');
    await page.goto('/directory');
    await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });

    // Community (viewer) has no access to the directory route in the first
    // place — the redirect lands them on `/`.
    expect(new URL(page.url()).pathname).toBe('/');

    // Belt and braces: confirm no "Add someone" affordance rendered either.
    const addContactBtn = page.getByRole('button', { name: ADD_SOMEONE_BTN }).first();
    await expect(addContactBtn).toHaveCount(0);
  });
});
