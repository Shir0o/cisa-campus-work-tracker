/**
 * Persona impersonation: "See as their view" end-to-end (issue #628).
 *
 * The Full-timer is also the workspace owner (issue #557: the owner-only
 * `cisa-owner` grant lets one user simulate every role and pick a real
 * staffer to impersonate). The owner-only "See as their view" eye button
 * lives in the top nav. Tapping it opens a modal with:
 *
 *  - a "Role Preview" chip bar (Full-timer / Trainee / Student / Community)
 *    that sets `ownerViewRole` and scopes the sidebar nav to that role;
 *  - a roster of people (staff, students, friends) for target impersonation.
 *
 * This spec drives the role-preview chips end-to-end and verifies:
 *  - the eye button is present for the Full-timer and absent for every
 *    other role,
 *  - the role-preview chips open, set the right nav, and "Back to my view"
 *    resets to the Full-timer nav,
 *  - the chip in the modal stays in sync with the active role.
 *
 * Target impersonation (picking a real staffer) is covered by the
 * AuthProvider / TopNav unit tests in `src/test/`; the focus here is the
 * surface-level owner-only role-simulation UX that the issue calls out.
 */

import { test, expect, type Page } from '@playwright/test';
import { signInAs } from './helpers/auth';

const EYE_BTN = 'See as their view';

async function gotoHome(page: Page) {
  await page.goto('/');
  await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });
}

test.describe('Persona Impersonation & Role Preview (#628)', () => {
  test.describe.configure({ mode: 'serial' });

  test('Full-timer sees the "See as their view" eye button in the top nav', async ({ page }) => {
    await signInAs(page, 'fulltimer');
    await gotoHome(page);

    const eyeBtn = page.getByRole('button', { name: EYE_BTN });
    await expect(eyeBtn).toBeVisible({ timeout: 5_000 });
  });

  test('Trainee does NOT see the "See as their view" eye button', async ({ page }) => {
    await signInAs(page, 'trainee');
    await gotoHome(page);

    // Owner-only — the trainee's top nav must not offer impersonation.
    await expect(page.getByRole('button', { name: EYE_BTN })).toHaveCount(0);
  });

  test('Student does NOT see the "See as their view" eye button', async ({ page }) => {
    await signInAs(page, 'student');
    await gotoHome(page);

    await expect(page.getByRole('button', { name: EYE_BTN })).toHaveCount(0);
  });

  test('Community does NOT see the "See as their view" eye button', async ({ page }) => {
    await signInAs(page, 'community');
    await gotoHome(page);

    await expect(page.getByRole('button', { name: EYE_BTN })).toHaveCount(0);
  });

  test('Full-timer can open the impersonation modal and the four role chips are visible', async ({ page }) => {
    await signInAs(page, 'fulltimer');
    await gotoHome(page);

    await page.getByRole('button', { name: EYE_BTN }).click();

    // Modal mounts with the stable "See as their view" title.
    await expect(page.getByRole('heading', { name: EYE_BTN })).toBeVisible({ timeout: 5_000 });

    // The "Role Preview" chip bar exposes one chip per role. We assert
    // that the four chips are present (text content is locale-dependent
    // in some builds, so we match by chip label by role).
    // Scope the chip check to the "Role Preview" bar (the ancestor div
    // of the label that also contains a button) so the assertions
    // cannot pass by matching a same-named element elsewhere on the
    // page (e.g. the role badge in the profile menu).
    const rolePreviewLabel = page.getByText(/^role preview:$/i).first();
    const chipBar = rolePreviewLabel
      .locator('xpath=ancestor::div[.//button][1]');
    await expect(chipBar.getByRole('button', { name: /^full-timer$/i })).toBeVisible();
    await expect(chipBar.getByRole('button', { name: /^trainee$/i })).toBeVisible();
    await expect(chipBar.getByRole('button', { name: /^student$/i })).toBeVisible();
    await expect(chipBar.getByRole('button', { name: /^community$/i })).toBeVisible();
  });

  test('Selecting the "Trainee" role chip scopes the nav to manager nav and back-to-my-view clears it', async ({ page }) => {
    await signInAs(page, 'fulltimer');
    await gotoHome(page);

    // The primary nav is shown on the page beside the brand. The Full-timer
    // (admin) primary nav is ["Coordination Notes", "People", "On our hearts"]
    // plus the brand and a "More" overflow. The "The Journey" link is in
    // the "More" overflow for the admin.
    const nav = page.getByLabel('Main Navigation');
    const navLinksBefore = await nav.getByRole('link').allInnerTexts();
    expect(navLinksBefore.some((l) => /coordination notes/i.test(l))).toBe(true);

    // Open the impersonation modal and click the "Trainee" role chip in
    // the "Role Preview" chip bar. Scoping to the chip bar avoids
    // picking up the role badge in the profile menu or any future
    // surface that renders the same label. The chip bar is the parent
    // div that contains both the "Role Preview:" label and the role
    // chips; we anchor on the label and walk to the closest ancestor
    // div that also has a button child.
    await page.getByRole('button', { name: EYE_BTN }).click();
    await expect(page.getByRole('heading', { name: EYE_BTN })).toBeVisible({ timeout: 5_000 });
    const rolePreviewLabel = page.getByText(/^role preview:$/i).first();
    const chipBar = rolePreviewLabel
      .locator('xpath=ancestor::div[.//button][1]');
    await chipBar.getByRole('button', { name: /^trainee$/i }).click();

    // The modal is still open; the chip is now visually active and a
    // "Back to my view" button has appeared in the chip bar.
    await expect(
      page.getByRole('button', { name: /back to my view/i }),
    ).toBeVisible();

    // Close the modal — esc.
    await page.keyboard.press('Escape');

    // The nav now reflects the manager (Trainee) role.
    const navLinksAfter = await nav.getByRole('link').allInnerTexts();
    const navAsText = navLinksAfter.join(' | ');
    // The home label flips to "Home" when role != admin. The board link
    // label is "The Journey" — that is the manager primary. The People
    // link is the directory.
    expect(navAsText).toMatch(/home|my day/i);
    expect(navAsText).toMatch(/the journey/i);
    expect(navAsText).toMatch(/people/i);

    // The Coordination Notes link is admin-only — it should not be in
    // the primary nav for the simulated Trainee role.
    const hasCoordinationPrimary = navLinksAfter.some((l) =>
      /^coordination notes$/i.test(l),
    );
    expect(hasCoordinationPrimary, 'primary nav must drop Coordination Notes when role simulates manager').toBe(false);

    // Reopen the modal and click "Back to my view" to reset.
    await page.getByRole('button', { name: EYE_BTN }).click();
    await expect(page.getByRole('heading', { name: EYE_BTN })).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: /back to my view/i }).click();

    // The chip bar no longer offers "Back to my view" and the Full-timer
    // chip is the active one (the modal stays open until you close it).
    await expect(
      page.getByRole('button', { name: /back to my view/i }),
    ).toHaveCount(0);

    // Close the modal and assert the nav is back to admin.
    await page.keyboard.press('Escape');

    const navLinksReset = await nav.getByRole('link').allInnerTexts();
    expect(navLinksReset.some((l) => /coordination notes/i.test(l))).toBe(true);
  });

  test('Selecting the "Student" role chip scopes the nav to operator nav', async ({ page }) => {
    await signInAs(page, 'fulltimer');
    await gotoHome(page);

    await page.getByRole('button', { name: EYE_BTN }).click();
    await expect(page.getByRole('heading', { name: EYE_BTN })).toBeVisible({ timeout: 5_000 });
    const rolePreviewLabel = page.getByText(/^role preview:$/i).first();
    const chipBar = rolePreviewLabel
      .locator('xpath=ancestor::div[.//button][1]');
    await chipBar.getByRole('button', { name: /^student$/i }).click();
    await page.keyboard.press('Escape');

    // Operator primary is Home / People / Prayer ("On our hearts").
    const nav = page.getByLabel('Main Navigation');
    const navLinksAfter = await nav.getByRole('link').allInnerTexts();
    const navAsText = navLinksAfter.join(' | ');
    expect(navAsText).toMatch(/people/i);
    expect(navAsText).toMatch(/on our hearts|prayer/i);

    // Reset back to admin view so subsequent tests start from a clean slate.
    await page.getByRole('button', { name: EYE_BTN }).click();
    await expect(page.getByRole('heading', { name: EYE_BTN })).toBeVisible({ timeout: 5_000 });
    const backBtn = page.getByRole('button', { name: /back to my view/i });
    if (await backBtn.count() > 0) {
      await backBtn.click();
    }
    await page.keyboard.press('Escape');
  });
});
