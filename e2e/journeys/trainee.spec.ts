/**
 * The Trainee journey (#1475).
 *
 * My Day → a contact in their care → log an interaction → the contact shows on
 * the Journey board. The Trainee is the scoped role: they see only the people
 * tied to them, and the rules accept that read only because the query carries
 * the tie (`contactVisibilityConstraints`). This spec folds in the trainee
 * halves of the feature specs the e2e map retires:
 *
 *  - `the-journey-board.spec.ts` — the trainee board view;
 *  - the trainee half of `walking-together-threads.spec.ts` — the Full-timers
 *    stream stays hidden;
 *  - the trainee half of `cross-role-journey.spec.ts` — the board loads for a
 *    trainee;
 *  - `mobile-and-pwa-contact-editing.spec.ts` and `mobile-viewport.spec.ts` —
 *    the mobile viewport lives here as a describe.
 *
 * Escape rows (docs/research/e2e-coverage-audit.md):
 *  - row 2  — The Journey does not load for trainees (rules ↔ query scope). The
 *             board must render the tied person, which means the query carried
 *             the tie; the pre-#1224 unscoped query is permission-denied.
 *  - row 5  — Full-timers-only posts leaked onto the trainee home (web analogue:
 *             a trainee must not see the Full-timers stream on a contact).
 *  - row 6  — Trainee home showed people not in their care (web analogue: a
 *             person visible but not tied to the trainee must not surface as a
 *             card or a waiting item on their home).
 *
 * Serial: the journey builds on the interaction it logs in the middle step.
 */

import { test, expect, type Page } from '@playwright/test';
import { signInAs } from '../helpers/auth';

const CARE_CONTACT = 'Lila Chen'; // seeded in the trainee's care (co-creator)
const UNTIED_CONTACT = 'Casey Untied'; // seeded Full-timer-only: outside scope
const VISIBLE_NOT_CARED = 'Jordan Visible'; // seeded visible to the trainee, not tied

async function waitForShell(page: Page) {
  await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });
}

test.describe('Trainee journey (#1475)', () => {
  test.describe.configure({ mode: 'serial' });

  test('My Day shows the people in their care and no one outside it', async ({ page }) => {
    await signInAs(page, 'trainee');
    await waitForShell(page);

    // The trainee home ("Your people") shows the person they founded / carry.
    const yourPeople = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Your people' }) });
    await expect(yourPeople.getByText(CARE_CONTACT).first()).toBeVisible({ timeout: 10_000 });

    // Negative (row 6): a person the trainee can read but is not tied to is not
    // one of "your people", and a nudge about them does not reach the home.
    await expect(page.getByText(VISIBLE_NOT_CARED)).toHaveCount(0);
    await expect(page.getByText(/outside your care/i)).toHaveCount(0);

    // Negative (row 6 / row 2 scope): a person with no tie at all is invisible.
    await expect(page.getByText(UNTIED_CONTACT)).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('Missing or insufficient permissions');
  });

  test('People shows the tied person and excludes the untied one', async ({ page }) => {
    await signInAs(page, 'trainee');
    await page.goto('/directory');
    await waitForShell(page);
    expect(new URL(page.url()).pathname).toBe('/directory');

    // The person in their care shows in the Directory...
    await expect(page.getByText(CARE_CONTACT).first()).toBeVisible({ timeout: 10_000 });

    // ...but a person outside the role's scope never does (negative check), and
    // neither does one merely readable-but-untied (row 6: the Directory filters
    // by the tie, not just `visibleTo`).
    await expect(page.getByText(VISIBLE_NOT_CARED)).toHaveCount(0);
    await expect(page.getByText(UNTIED_CONTACT)).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('Missing or insufficient permissions');
  });

  test('the contact page hides the Full-timers stream and logs an interaction', async ({ page }) => {
    const interaction = `Trainee coffee catch-up ${Date.now()}`;

    await signInAs(page, 'trainee');
    await waitForShell(page);

    // Open the contact from My Day's "Your people" card.
    const yourPeople = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Your people' }) });
    await yourPeople.getByText(CARE_CONTACT).first().click();

    const dialog = page.getByRole('dialog', { name: /contact details/i });
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Row 5 web analogue: a trainee has no Full-timers switch and never sees the
    // team-confidential post — only the shared Conversation.
    await expect(dialog.getByRole('button', { name: /^full-timers/i })).toHaveCount(0);
    await expect(dialog.getByText(/confidential staff note/i)).toHaveCount(0);
    await expect(
      dialog.getByText(/great first connection with lila/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Log an interaction (desktop: the More actions menu carries it).
    await dialog.getByRole('button', { name: /more actions/i }).first().click();
    await dialog.getByRole('button', { name: /^log interaction$/i }).click();

    const composer = dialog.getByLabel(/what happened with lila/i).first();
    await expect(composer).toBeVisible({ timeout: 5_000 });
    await composer.fill(interaction);
    await dialog.getByRole('button', { name: /^log$/i }).click();

    // It lands in the story without a permission error.
    await expect(dialog.getByText(interaction).first()).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText(/missing or insufficient permissions/i)).toHaveCount(0);
  });

  test('the Journey board loads for a trainee with the tied person and not the untied one', async ({ page }) => {
    await signInAs(page, 'trainee');
    await page.goto('/board');
    await waitForShell(page);
    expect(new URL(page.url()).pathname).toBe('/board');

    // Row 2: the board renders (the scoped query was accepted) and shows the
    // staged person. If the board's query dropped its tie it would be denied and
    // this would never appear.
    await expect(page.getByRole('heading', { name: 'First Contact' }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(CARE_CONTACT).first()).toBeVisible({ timeout: 10_000 });

    // ...and neither the untied person nor the readable-but-untied one is on
    // the board either (negative checks).
    await expect(page.getByText(UNTIED_CONTACT)).toHaveCount(0);
    await expect(page.getByText(VISIBLE_NOT_CARED)).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('Missing or insufficient permissions');
  });
});

/**
 * Mobile viewport (#1475): folds in `mobile-viewport.spec.ts` (overflow) and
 * `mobile-and-pwa-contact-editing.spec.ts` (a trainee edits a contact on the
 * phone viewport). A separate describe so the `test.use` viewport applies only
 * to these steps.
 */
test.describe('Trainee journey on a mobile viewport (#1475)', () => {
  test.describe.configure({ mode: 'serial' });

  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  const routes = [
    { path: '/', name: 'Home' },
    { path: '/directory', name: 'People' },
    { path: '/board', name: 'The Journey' },
  ];

  test('trainee routes do not overflow horizontally on a phone', async ({ page }) => {
    await signInAs(page, 'trainee');

    for (const route of routes) {
      await page.goto(route.path);
      await page.waitForSelector(
        '[aria-label="Main Navigation"], main, [role="main"]',
        { timeout: 15_000 },
      );

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));

      expect(
        scrollWidth,
        `Horizontal overflow on ${route.path} (${route.name}): ${scrollWidth} > ${clientWidth}`,
      ).toBeLessThanOrEqual(clientWidth);
    }
  });

  test('trainee can edit a contact on the phone viewport without a permission error', async ({ page }) => {
    const editedNote = 'Met at the welcome table — follow up about the small group.';

    await signInAs(page, 'trainee');

    // Open the contact from the phone's People directory.
    await page.goto('/directory');
    await waitForShell(page);
    await page.getByText(CARE_CONTACT).first().click();

    const dialog = page.getByRole('dialog', { name: /contact details/i });
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // The mobile header offers Edit for a write role.
    await dialog.getByRole('button', { name: /^edit$/i }).first().click();
    await expect(dialog.getByText(/edit details/i).first()).toBeVisible({ timeout: 5_000 });

    const notes = dialog.locator('textarea').first();
    await expect(notes).toBeVisible({ timeout: 5_000 });
    await notes.fill(editedNote);

    // The mobile editing header carries the Save action; it commits and exits
    // edit mode with no rules denial.
    await dialog.getByRole('button', { name: /^save$/i }).first().click();
    await expect(dialog.getByText(/edit details/i)).toHaveCount(0, { timeout: 10_000 });
    await expect(dialog.getByText(/missing or insufficient permissions/i)).toHaveCount(0);
  });
});
