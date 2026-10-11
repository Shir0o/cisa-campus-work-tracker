/**
 * The Impersonation journey (#1476).
 *
 * A Full-timer uses "See as their view" to step into a real Trainee's view and
 * must see EXACTLY that Trainee's visible set — the same People, My Day and
 * Questions the trainee journey asserts — and opening a contact there must not
 * crash. "Back to my view" restores the Full-timer.
 *
 * Escape rows (docs/research/e2e-coverage-audit.md):
 *  - row 4  — Questions channel permission-denied under "See as their view"
 *             (#603). The staff asks feed is read unscoped, so an impersonated
 *             trainee still reads the team's questions and a post round-trips.
 *             Reverting `Questions.tsx` to scope the read to the impersonated
 *             uid (subscribeStaffAsks with `{ isStaff: false }`) empties the
 *             feed, so the question the Full-timer just posted is absent.
 *  - row 7  — "See as their view" showed people the trainee can't see, and the
 *             owner's own name (#559 / #679). Directory and My Day scope by the
 *             EFFECTIVE uid, and the "seeing as" banner names the impersonated
 *             trainee rather than the owner.
 *  - row 8  — Switching to a teammate's view crashed the contact page with
 *             React #300 (#791). Opening a contact while impersonating renders
 *             with no hook-order error.
 *
 * Reuses the trainee journey's seeded scope (`e2e/journeys/trainee.spec.ts`):
 * `Lila Chen` is tied to the trainee, `Casey Untied` is outside it, and
 * `Jordan Visible` is readable-but-untied — the same negatives that prove
 * "exactly the trainee's visible set".
 *
 * Folds in `impersonation-personas.spec.ts` (deleted): the owner-only eye
 * button, the four role-preview chips, and chip -> nav scoping with Back to my
 * view.
 */

import { test, expect, type Page } from '@playwright/test';
import { signInAs } from '../helpers/auth';

const EYE_BTN = 'See as their view';
const CARE_CONTACT = 'Lila Chen'; // seeded in the trainee's care (co-creator)
const UNTIED_CONTACT = 'Casey Untied'; // seeded Full-timer-only: outside scope
const VISIBLE_NOT_CARED = 'Jordan Visible'; // seeded visible to the trainee, not tied
const TRAINEE_NAME = 'Zion Adeyemi'; // the real trainee's display name
const OWNER_NAME = 'Full-timer Test User'; // the signed-in Full-timer

async function waitForShell(page: Page) {
  await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });
}

async function gotoHome(page: Page) {
  await page.goto('/');
  await waitForShell(page);
}

/** Open the owner-only "See as their view" modal. */
async function openImpersonation(page: Page) {
  await page.getByRole('button', { name: EYE_BTN }).click();
  await expect(page.getByRole('heading', { name: EYE_BTN })).toBeVisible({ timeout: 5_000 });
}

/**
 * Step into the real trainee's view (target impersonation, not the role chip).
 * Picking the row sets `impersonateTarget`, so `effectiveUserId` becomes the
 * trainee's uid and every scoped read follows it.
 */
async function impersonateTrainee(page: Page) {
  await openImpersonation(page);
  await page.getByRole('button', { name: new RegExp(TRAINEE_NAME, 'i') }).first().click();
  await expect(page.getByText(/seeing CISA as/i).first()).toBeVisible({ timeout: 10_000 });
}

/** The amber "seeing as" banner, the one surface that reads the impersonated name. */
function seeingAsBanner(page: Page) {
  return page.getByText(/seeing CISA as/i).first();
}

/**
 * Navigate by clicking a nav link, NOT `page.goto`. A real-staff target
 * impersonation is resolved from the users list on load, so a full page reload
 * drops it — the point of this journey is the impersonated view, which only
 * survives client-side routing.
 */
async function clickNavLink(page: Page, name: string) {
  await page.getByLabel('Main Navigation').getByRole('link', { name, exact: true }).first().click();
}

test.describe('Impersonation journey (#1476)', () => {
  test.describe.configure({ mode: 'serial' });

  // ── Folded from impersonation-personas.spec.ts ──────────────────────────
  test('the "See as their view" eye is owner-only', async ({ page }) => {
    await signInAs(page, 'fulltimer');
    await gotoHome(page);
    await expect(page.getByRole('button', { name: EYE_BTN })).toBeVisible({ timeout: 5_000 });
  });

  test('a trainee has no "See as their view" eye', async ({ page }) => {
    await signInAs(page, 'trainee');
    await gotoHome(page);
    await expect(page.getByRole('button', { name: EYE_BTN })).toHaveCount(0);
  });

  test('a student has no "See as their view" eye', async ({ page }) => {
    await signInAs(page, 'student');
    await gotoHome(page);
    await expect(page.getByRole('button', { name: EYE_BTN })).toHaveCount(0);
  });

  test('a community member has no "See as their view" eye', async ({ page }) => {
    await signInAs(page, 'community');
    await gotoHome(page);
    await expect(page.getByRole('button', { name: EYE_BTN })).toHaveCount(0);
  });

  test('the modal shows the four role-preview chips', async ({ page }) => {
    await signInAs(page, 'fulltimer');
    await gotoHome(page);
    await openImpersonation(page);

    // Scope the chip check to the "Role preview:" bar so it cannot pass by
    // matching the role badge in the profile menu elsewhere on the page.
    const chipBar = page.getByText(/^role preview:$/i).first().locator('xpath=ancestor::div[.//button][1]');
    await expect(chipBar.getByRole('button', { name: /^full-timer$/i })).toBeVisible();
    await expect(chipBar.getByRole('button', { name: /^trainee$/i })).toBeVisible();
    await expect(chipBar.getByRole('button', { name: /^student$/i })).toBeVisible();
    await expect(chipBar.getByRole('button', { name: /^community$/i })).toBeVisible();
  });

  test('the Trainee role chip scopes the nav and Back to my view resets it', async ({ page }) => {
    await signInAs(page, 'fulltimer');
    await gotoHome(page);

    const nav = page.getByLabel('Main Navigation');
    const navBefore = await nav.getByRole('link').allInnerTexts();
    expect(navBefore.some((l) => /coordination notes/i.test(l))).toBe(true);

    await openImpersonation(page);
    const chipBar = page.getByText(/^role preview:$/i).first().locator('xpath=ancestor::div[.//button][1]');
    await chipBar.getByRole('button', { name: /^trainee$/i }).click();
    // Back to my view appears once a preview is active.
    await expect(page.getByRole('button', { name: /back to my view/i })).toBeVisible();
    await page.keyboard.press('Escape');

    const navAfter = await nav.getByRole('link').allInnerTexts();
    const navAsText = navAfter.join(' | ');
    expect(navAsText).toMatch(/home|my day/i);
    expect(navAsText).toMatch(/the journey/i);
    expect(navAsText).toMatch(/people/i);
    expect(navAfter.some((l) => /^coordination notes$/i.test(l))).toBe(false);

    // Back to my view restores the Full-timer nav.
    await openImpersonation(page);
    await page.getByRole('button', { name: /back to my view/i }).click();
    await page.keyboard.press('Escape');
    const navReset = await nav.getByRole('link').allInnerTexts();
    expect(navReset.some((l) => /coordination notes/i.test(l))).toBe(true);
  });

  test('the Student role chip scopes the nav', async ({ page }) => {
    await signInAs(page, 'fulltimer');
    await gotoHome(page);
    await openImpersonation(page);
    const chipBar = page.getByText(/^role preview:$/i).first().locator('xpath=ancestor::div[.//button][1]');
    await chipBar.getByRole('button', { name: /^student$/i }).click();
    await page.keyboard.press('Escape');

    const navAsText = (await page.getByLabel('Main Navigation').getByRole('link').allInnerTexts()).join(' | ');
    expect(navAsText).toMatch(/people/i);
    expect(navAsText).toMatch(/on our hearts|prayer/i);
  });

  // ── The journey ─────────────────────────────────────────────────────────
  test('stepping into the trainee shows exactly their People and My Day, opening a contact does not crash, and Back to my view restores the Full-timer', async ({ page }) => {
    const reactErrors: string[] = [];
    page.on('pageerror', (e) => reactErrors.push(e.message));

    await signInAs(page, 'fulltimer');
    await gotoHome(page);
    await impersonateTrainee(page);

    // Row 7: the banner names the impersonated trainee, not the owner.
    await expect(seeingAsBanner(page)).toContainText(TRAINEE_NAME);
    await expect(seeingAsBanner(page)).not.toContainText(OWNER_NAME);

    // The nav is the trainee's nav — no Full-timer-only Coordination Notes.
    const navAsText = (await page.getByLabel('Main Navigation').getByRole('link').allInnerTexts()).join(' | ');
    expect(navAsText).toMatch(/the journey/i);
    expect(navAsText).not.toMatch(/coordination notes/i);

    // My Day: the person in the trainee's care shows; no one outside the
    // trainee's scope does (row 7 negative — Casey is Full-timer-only, Jordan
    // is readable-but-untied).
    const yourPeople = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Your people' }) });
    await expect(yourPeople.getByText(CARE_CONTACT).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(UNTIED_CONTACT)).toHaveCount(0);
    await expect(page.getByText(VISIBLE_NOT_CARED)).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('Missing or insufficient permissions');

    // People (Directory): same set, same negatives. The heading only renders
    // after the route's own snapshots land, so the negatives below are not
    // read against the previous route's still-mounted list.
    await clickNavLink(page, 'People');
    await expect(page).toHaveURL(/\/directory$/);
    await expect(page.getByRole('heading', { name: 'People', exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(CARE_CONTACT).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(UNTIED_CONTACT)).toHaveCount(0);
    await expect(page.getByText(VISIBLE_NOT_CARED)).toHaveCount(0);

    // Row 8: open a contact the trainee can see — no React #300 hook-order
    // crash. The contact page is a route page in the shell's <main>, not a
    // popup (#1560), so wait for its "About {name}" control.
    await page.getByText(CARE_CONTACT).first().click();
    const contactPage = page.getByRole('main');
    await expect(
      contactPage.getByRole('button', { name: `About ${CARE_CONTACT}` }).first(),
    ).toBeVisible({ timeout: 5_000 });
    expect(
      reactErrors.filter((m) => /rendered more hooks|minified react error|error #?300/i.test(m)),
      `contact page threw while impersonating: ${reactErrors.join(' | ')}`,
    ).toEqual([]);

    // The trainee's view hides the Full-timers-only stream (the scope held).
    await expect(contactPage.getByRole('button', { name: /^full-timers/i })).toHaveCount(0);
    await expect(contactPage.getByText(/confidential staff note/i)).toHaveCount(0);

    // Back to People, then Back to my view restores the Full-timer and their
    // wider scope: the Directory re-scopes and Casey (Full-timer-only) returns.
    await clickNavLink(page, 'People');
    await expect(page).toHaveURL(/\/directory$/);
    await page.getByRole('button', { name: /back to my view/i }).click();
    await expect(page.getByText(/seeing CISA as/i)).toHaveCount(0);
    await expect(page.getByText(UNTIED_CONTACT).first()).toBeVisible({ timeout: 10_000 });
  });

  test('the Questions feed round-trips under impersonation without a permission error', async ({ page }) => {
    await signInAs(page, 'fulltimer');
    await gotoHome(page);
    await impersonateTrainee(page);

    // Row 4: the staff asks feed is read unscoped, so the route loads and a
    // question posted here commits and reads back.
    await clickNavLink(page, 'Questions');
    await expect(page).toHaveURL(/\/questions$/);
    await expect(page.getByRole('heading', { name: 'Questions for the team' })).toBeVisible({ timeout: 15_000 });

    const question = `E2E impersonated-trainee question ${Date.now()}: who covers Friday?`;
    await page.getByRole('button', { name: 'Ask the team', exact: true }).click();
    const composer = page.getByPlaceholder(/What do you want to ask/i);
    await expect(composer).toBeVisible({ timeout: 5_000 });
    await composer.fill(question);
    await composer.press('Meta+Enter');
    // The panel only closes after the write resolves.
    await expect(composer).toBeHidden({ timeout: 10_000 });

    await page.getByRole('button', { name: /^All/ }).click();
    await expect(page.getByRole('article').filter({ hasText: question })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('body')).not.toContainText('Missing or insufficient permissions');
  });
});
