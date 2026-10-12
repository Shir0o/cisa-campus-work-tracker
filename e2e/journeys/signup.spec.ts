/**
 * The public sign-up journey (#1478).
 *
 * A signed-out visitor submits the intake form → the new person appears for a
 * Full-timer in Around the team and My Day → the sidebar shows the Sign-up form
 * link. It folds in `outreach-signup.spec.ts`, retired with this journey:
 *
 *  - the Outreach view for a Full-timer and a Community member;
 *  - the public intake form itself (the old spec's signed-out submission);
 *  - the #1493 phone-preservation pair (the lead survives the "Has phone"
 *    Directory filter, and a Trainee never sees the untied sign-up).
 *
 * Escape rows (docs/research/e2e-coverage-audit.md, research branch):
 *  - row 11 — public sign-ups never appeared in Around the team or My Day
 *             (#1071). The feed skipped the creator-less sign-up; the fix makes
 *             a public lead (nobody's `createdBy`, empty `visibleTo`) a card the
 *             Full-timer picks up. The My Day pointer card's to-work-through
 *             count must rise by one and the person must render on /around.
 *             The query half of this row lives in
 *             `src/test/queryContract.test.ts` ("row 11 — a public sign-up is
 *             readable by a Full-timer and not by a Trainee").
 *  - row 27 — the sign-up form link disappeared from the sidebar (#676). The
 *             vertical rail dropped the entry; the sidebar must carry it again.
 *
 * Serial: the journey builds on the sign-ups it submits.
 */

import { test, expect, type Page } from '@playwright/test';
import { signInAs } from '../helpers/auth';

const SIGNUP_TITLE = 'Sign-up form';
const BASE_URL = 'http://localhost:3000';

async function waitForShell(page: Page) {
  await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });
}

async function gotoHome(page: Page) {
  await page.goto('/');
  await waitForShell(page);
}

/**
 * Fill every required field of the public intake form on its own public route.
 * Labels lead where the form has them; the gender/year/interest chips are
 * button groups, so they are addressed by role.
 */
async function fillIntake(
  page: Page,
  opts: { name: string; phone: string; interest: string },
) {
  await page.goto('/signup');
  await expect(page.getByRole('heading', { name: 'Tell us about you.' })).toBeVisible({ timeout: 15_000 });

  await page.getByLabel('Full name').fill(opts.name);
  await page.getByRole('button', { name: 'Female', exact: true }).click();
  await page.getByRole('button', { name: 'Sophomore', exact: true }).click();
  await page.getByLabel('Major').fill('Economics');
  await page.getByLabel('Cell number').fill(opts.phone);
  await page.getByLabel('Email').fill(`${opts.name.toLowerCase().replace(/[^a-z]+/g, '.')}.${Date.now()}@example.com`);
  await page.getByRole('button', { name: opts.interest, exact: true }).click();
}

async function successHeading(page: Page, firstName: string) {
  return page.getByRole('heading', { name: `Thank you for signing up, ${firstName}.` });
}

test.describe('Sign-up journey (#1478)', () => {
  test.describe.configure({ mode: 'serial' });

  const lead = `Intake Lead ${Date.now()}`;
  const leadFirstName = lead.split(' ')[0];

  test('a signed-out visitor completes the intake form', async ({ page }) => {
    await fillIntake(page, { name: lead, phone: '555-014-1000', interest: 'Bible study' });

    // Submit stays disabled until the form is valid, then lands on success.
    const submit = page.getByRole('button', { name: 'Send it' });
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(await successHeading(page, leadFirstName)).toBeVisible({ timeout: 10_000 });
  });

  test('the new sign-up appears for a Full-timer in Around the team and My Day', async ({ page, browser }) => {
    // A second visitor submits while the Full-timer's My Day is live, so the
    // count delta is attributable to this one person (row 11).
    const aroundLead = `Around Lead ${Date.now()}`;
    const aroundFirstName = aroundLead.split(' ')[0];

    await signInAs(page, 'fulltimer');
    await gotoHome(page);

    const pointerCard = page
      .locator('a[href="/around"]')
      .filter({ has: page.locator('.tabular-nums') })
      .first();
    const pointerCount = async () => Number((await pointerCard.locator('.tabular-nums').innerText()).trim());

    // Settle on a stable, non-zero baseline first: the seed already puts team
    // activity here, and the subscriptions deliver it in more than one tick.
    let before = 0;
    let previous = -1;
    await expect
      .poll(
        async () => {
          const current = await pointerCount();
          const settled = current > 0 && current === previous;
          previous = current;
          return settled ? current : 0;
        },
        { intervals: [400], timeout: 20_000 },
      )
      .toBeGreaterThan(0);
    before = previous;

    // The signed-out visitor's own browser context — no sign-in at all.
    const visitor = await browser.newContext({ baseURL: BASE_URL });
    const visitorPage = await visitor.newPage();
    await fillIntake(visitorPage, { name: aroundLead, phone: '555-014-1001', interest: 'Prayer group' });
    await visitorPage.getByRole('button', { name: 'Send it' }).click();
    await expect(await successHeading(visitorPage, aroundFirstName)).toBeVisible({ timeout: 10_000 });
    await visitor.close();

    // Row 11 (My Day): the creator-less sign-up joins the team feed, so the
    // pointer card's to-work-through count rises by exactly one.
    await expect(async () => expect(await pointerCount()).toBe(before + 1)).toPass({ timeout: 15_000 });

    // Row 11 (Around the team): the person is a card on the page.
    await pointerCard.click();
    await expect(page).toHaveURL(/\/around$/, { timeout: 10_000 });
    await expect(page.getByRole('button', { name: aroundLead }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('body')).not.toContainText('Missing or insufficient permissions');
  });

  test('the sidebar shows the Sign-up form link', async ({ page }) => {
    await signInAs(page, 'fulltimer');

    // Row 27: the vertical rail must carry the Sign-up form destination.
    const link = page.getByLabel('Main Navigation').getByRole('link', { name: SIGNUP_TITLE });
    await expect(link).toBeVisible({ timeout: 10_000 });
    await link.click();
    await expect(page).toHaveURL(/\/signup$/, { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: 'Tell us about you.' })).toBeVisible({ timeout: 15_000 });
  });
});

/**
 * Folded from `outreach-signup.spec.ts`: the Outreach view, its role gate for a
 * Community member, and the #1493 phone-preservation pair.
 */
test.describe('Sign-up journey — Outreach view and phone preservation (#1478)', () => {
  test.describe.configure({ mode: 'serial' });

  test('a Full-timer reaches the Outreach view', async ({ page }) => {
    await signInAs(page, 'fulltimer');
    await page.goto('/outreach');
    await waitForShell(page);
    expect(new URL(page.url()).pathname).toBe('/outreach');
    await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'Gospel' })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('a Community member reaches the Outreach view', async ({ page }) => {
    await signInAs(page, 'community');
    await page.goto('/outreach');
    await waitForShell(page);
    expect(new URL(page.url()).pathname).toBe('/outreach');
  });

  const unique = `Phone Lead ${Date.now()}`;
  const firstName = unique.split(' ')[0];
  const phone = '555-014-7788';

  test('a public sign-up keeps its phone number into the Directory (#1493)', async ({ page }) => {
    // Anonymous public intake — the flow that silently dropped the number.
    await fillIntake(page, { name: unique, phone, interest: 'Prayer group' });
    await page.getByRole('button', { name: 'Send it' }).click();
    await expect(await successHeading(page, firstName)).toBeVisible({ timeout: 10_000 });

    // A Full-timer sees the new lead, and the "Has phone" filter keeps it —
    // only a contact whose phone actually persisted survives that filter.
    await signInAs(page, 'fulltimer');
    await page.goto('/directory');
    await waitForShell(page);

    await page.getByPlaceholder(/find someone/i).first().fill(unique);
    const directory = page.getByRole('main');
    await expect(directory.getByText(unique).first()).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Filters' }).first().click();
    await page.getByTestId('filter-has-phone').check();
    await expect(directory.getByText(unique).first()).toBeVisible({ timeout: 10_000 });
  });

  test('a Trainee does not see the untied public sign-up (#1493)', async ({ page }) => {
    // Negative check: an anonymous sign-up has no ties, so a Trainee's
    // visibleTo-scoped directory query must not surface it.
    await signInAs(page, 'trainee');
    await page.goto('/directory');
    await waitForShell(page);

    await page.getByPlaceholder(/find someone/i).first().fill(unique);
    await expect(page.getByRole('main').getByText(unique)).toHaveCount(0);
  });
});
