/**
 * Quick Capture: NewContactModal end-to-end behaviour (issue #628).
 *
 * The Full-timer half of this spec (the modal opens from the directory toolbar,
 * the minimum "first name + phone" payload, the optional disclosure, tags and
 * stage persistence) now lives in e2e/journeys/full-timer.spec.ts (#1477),
 * where it is re-homed alongside the rest of the Full-timer journey. This file
 * keeps the Student and Community halves for #1480.
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

  test('Student can open Quick Capture from the People directory', async ({ page }) => {
    await signInAs(page, 'student');
    await openQuickCaptureFromDirectory(page);

    // The minimal "first name" field is the only required input.
    await expect(page.getByPlaceholder(/first name/i).first()).toBeVisible();
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
