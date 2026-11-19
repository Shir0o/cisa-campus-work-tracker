/**
 * The Impersonation journey (#1476).
 *
 * A Full-timer uses "See as their view" to step into a real Trainee's view and
 * must see EXACTLY that Trainee's visible set — the same People and My Day the
 * trainee journey asserts — and opening a contact there must not crash. "Back
 * to my view" restores the Full-timer.
 *
 * Escape rows (docs/research/e2e-coverage-audit.md):
 *  - row 4  — retired with Questions for the team (cut-or-keep §5).
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
 * button, the two role-preview chips (Student and Community are cut), and
 * chip -> nav scoping with Back to my view.
 *
 * Cut-or-keep §28 ("verify it shows exactly what that Trainee sees and nothing
 * more"): the view-as Directory is compared row-for-row with the Trainee's own,
 * and an interaction written while impersonating is checked to carry the
 * signed-in Full-timer's attribution — the `userId == request.auth.uid` the
 * Firestore rules require — not the borrowed Trainee's.
 */

import { test, expect, type Page } from '@playwright/test';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { signInAs } from '../helpers/auth';
import { DEFAULT_CREDENTIALS } from '../helpers/auth-defaults';

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
  await expect(seeingAsBanner(page)).toContainText(/seeing CISA as/i, { timeout: 10_000 });
}

/** The amber "seeing as" banner, the one surface that reads the impersonated name. */
function seeingAsBanner(page: Page) {
  return page.getByTestId('impersonate-banner');
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

/**
 * The people the People (Directory) route lists, in order. Each card's overlay
 * carries "Open {name}'s page", so the array's length is the row count and its
 * members are the visible set — exactly what §28's "sees exactly what that
 * Trainee sees" has to compare.
 */
async function directoryPeople(page: Page): Promise<string[]> {
  await expect(page.getByRole('heading', { name: 'People', exact: true })).toBeVisible({
    timeout: 10_000,
  });
  const cards = page.getByRole('main').getByRole('button', { name: /^open .+'s page$/i });
  await expect(cards.first()).toBeVisible({ timeout: 10_000 });
  const labels = await cards.evaluateAll((els) =>
    els.map((el) => el.getAttribute('aria-label') ?? ''),
  );
  return labels.map((label) => /^open (.*)'s page$/i.exec(label)?.[1] ?? label);
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

  test('the modal shows exactly the two role-preview chips', async ({ page }) => {
    await signInAs(page, 'fulltimer');
    await gotoHome(page);
    await openImpersonation(page);

    // Scope the chip check to the "Role preview:" bar so it cannot pass by
    // matching the role badge in the profile menu elsewhere on the page.
    const chipBar = page.getByRole('dialog').getByText(/^role preview:$/i).locator('xpath=ancestor::div[.//button][1]');
    await expect(chipBar.getByRole('button', { name: /^full-timer$/i })).toBeVisible();
    await expect(chipBar.getByRole('button', { name: /^trainee$/i })).toBeVisible();
    // Negative: the cut Student and Community chips are gone.
    await expect(chipBar.getByRole('button', { name: /^student$/i })).toHaveCount(0);
    await expect(chipBar.getByRole('button', { name: /^community$/i })).toHaveCount(0);
  });

  test('the Trainee role chip scopes the nav and Back to my view resets it', async ({ page }) => {
    await signInAs(page, 'fulltimer');
    await gotoHome(page);

    const nav = page.getByLabel('Main Navigation');
    const navBefore = await nav.getByRole('link').allInnerTexts();
    expect(navBefore.some((l) => /coordination notes/i.test(l))).toBe(true);

    await openImpersonation(page);
    const chipBar = page.getByRole('dialog').getByText(/^role preview:$/i).locator('xpath=ancestor::div[.//button][1]');
    await chipBar.getByRole('button', { name: /^trainee$/i }).click();
    // Back to my view appears once a preview is active.
    await expect(page.getByRole('button', { name: /back to my view/i })).toBeVisible();
    await page.keyboard.press('Escape');

    const navAfter = await nav.getByRole('link').allInnerTexts();
    const navAsText = navAfter.join(' | ');
    expect(navAsText).toMatch(/home|my day/i);
    expect(navAsText).toMatch(/people/i);
    expect(navAfter.some((l) => /^coordination notes$/i.test(l))).toBe(false);

    // Back to my view restores the Full-timer nav.
    await openImpersonation(page);
    await page.getByRole('button', { name: /back to my view/i }).click();
    await page.keyboard.press('Escape');
    const navReset = await nav.getByRole('link').allInnerTexts();
    expect(navReset.some((l) => /coordination notes/i.test(l))).toBe(true);
  });

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
    await expect(page.getByRole('main').getByText(CARE_CONTACT)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(UNTIED_CONTACT)).toHaveCount(0);
    await expect(page.getByText(VISIBLE_NOT_CARED)).toHaveCount(0);

    // Row 8: open a contact the trainee can see — no React #300 hook-order
    // crash. The contact page is a route page in the shell's <main>, not a
    // popup (#1560), so wait for its "About {name}" control.
    await page.getByRole('main').getByText(CARE_CONTACT).click();
    const contactPage = page.getByRole('main');
    await expect(
      contactPage.getByRole('button', { name: `About ${CARE_CONTACT}` }).first(),
    ).toBeVisible({ timeout: 5_000 });
    expect(
      reactErrors.filter((m) => /rendered more hooks|minified react error|error #?300/i.test(m)),
      `contact page threw while impersonating: ${reactErrors.join(' | ')}`,
    ).toEqual([]);

    // The trainee's view has no Full-timers pane (the cut held), and the
    // team-confidential post is never shown.
    await expect(contactPage.getByRole('button', { name: /^full-timers/i })).toHaveCount(0);
    await expect(contactPage.getByText(/confidential staff note/i)).toHaveCount(0);

    // Back to People, then Back to my view restores the Full-timer and their
    // wider scope: the Directory re-scopes and Casey (Full-timer-only) returns.
    await clickNavLink(page, 'People');
    await expect(page).toHaveURL(/\/directory$/);
    await page.getByRole('button', { name: /back to my view/i }).click();
    await expect(page.getByText(/seeing CISA as/i)).toHaveCount(0);
    await expect(page.getByRole('main').getByText(UNTIED_CONTACT)).toBeVisible({ timeout: 10_000 });
  });

  // ── cut-or-keep §28: the view-as Directory is exactly the Trainee's ────────
  test('viewing as the Trainee shows exactly their Directory rows and none outside it (cut-or-keep §28)', async ({ page }) => {
    // The Trainee's own seeded visible set: `Lila Chen` (co-creator) and
    // `Around Touch` (created by them). `Jordan Visible` is readable-but-untied
    // and `Casey Untied` is tied to the Full-timer only — neither may appear.
    const SEEDED_TRAINEE_PEOPLE = ['Around Touch', CARE_CONTACT];

    // Baseline: what the Trainee themselves sees, and the count we hold the
    // impersonated view to.
    await signInAs(page, 'trainee');
    await page.goto('/directory');
    await waitForShell(page);
    const traineeRows = await directoryPeople(page);
    expect(traineeRows).toEqual(SEEDED_TRAINEE_PEOPLE);
    await expect(page.getByRole('main').getByText(UNTIED_CONTACT)).toHaveCount(0);
    await expect(page.getByRole('main').getByText(VISIBLE_NOT_CARED)).toHaveCount(0);

    // Switch accounts in this context (no impersonation carries over), then
    // step into the Trainee's view. The owner-only eye is the signal that the
    // Full-timer's session, not the Trainee's, is the one now rendered.
    await signInAs(page, 'fulltimer');
    await expect(page.getByRole('button', { name: EYE_BTN })).toBeVisible({ timeout: 15_000 });
    await impersonateTrainee(page);
    await clickNavLink(page, 'People');
    await expect(page).toHaveURL(/\/directory$/);

    // Exactly the Trainee's rows: same set, same count, same order — no one
    // outside their scope leaks in for having "seen as" them.
    const impersonatedRows = await directoryPeople(page);
    expect(impersonatedRows).toEqual(traineeRows);
    expect(impersonatedRows).toHaveLength(SEEDED_TRAINEE_PEOPLE.length);

    // Negative check inside the list container itself, so the equal counts
    // above are proven to be the same people rather than a coincidental size.
    const list = page.getByRole('main');
    await expect(list.getByText(UNTIED_CONTACT)).toHaveCount(0);
    await expect(list.getByText(VISIBLE_NOT_CARED)).toHaveCount(0);
    await expect(list).not.toContainText('Missing or insufficient permissions');
  });

  // ── cut-or-keep §28: writes are the signed-in actor's, not the persona's ──
  test('an interaction logged while viewing as the Trainee is attributed to the Full-timer (cut-or-keep §28)', async ({ page }) => {
    const interaction = `Logged while seeing as the trainee ${Date.now()}`;

    await signInAs(page, 'fulltimer');
    await gotoHome(page);
    await impersonateTrainee(page);
    await clickNavLink(page, 'People');
    await expect(page).toHaveURL(/\/directory$/);
    await expect(page.getByRole('main').getByText(CARE_CONTACT)).toBeVisible({ timeout: 10_000 });
    await page.getByRole('main').getByText(CARE_CONTACT).click();

    const contactPage = page.getByRole('main');
    await expect(contactPage.getByRole('button', { name: `About ${CARE_CONTACT}` }).first()).toBeVisible({
      timeout: 10_000,
    });

    // Log an interaction from inside the impersonated view.
    const story = contactPage.getByRole('region', { name: /the story so far/i }).first();
    const composer = story.getByRole('textbox', { name: /what happened with/i }).first();
    await composer.click();
    await composer.fill(interaction);
    await story.getByRole('button', { name: /^log$/i }).click();

    const row = story.locator('[data-kind="conversation"]').filter({ hasText: interaction }).first();
    await expect(row).toBeVisible({ timeout: 10_000 });

    // The rules require `userId == request.auth.uid`, so a write made while
    // impersonating belongs to the signed-in Full-timer — never the Trainee
    // whose view was borrowed. Read the stored record itself first...
    if (getApps().length === 0) initializeApp({ projectId: 'sac-campus-hub' });
    const fulltimerUid = (await getAuth().getUserByEmail(DEFAULT_CREDENTIALS.fulltimer.email)).uid;
    const traineeUid = (await getAuth().getUserByEmail(DEFAULT_CREDENTIALS.trainee.email)).uid;
    // The row shows from the local cache first; poll until the write lands.
    const readWritten = () =>
      getFirestore()
        .collection('contacts')
        .doc('e2e-contact-lila')
        .collection('interactions')
        .where('content', '==', interaction)
        .get();
    await expect.poll(async () => (await readWritten()).size, { timeout: 15_000 }).toBe(1);
    const written = await readWritten();
    const entry = written.docs[0].data();
    expect(entry.userId).toBe(fulltimerUid);
    expect(entry.userName).toBe(OWNER_NAME);
    expect(entry.userId).not.toBe(traineeUid);

    // ...then the row reads that written attribution back: the author is the
    // Full-timer...
    await expect(row.getByTestId('story-avatar')).toHaveAttribute('data-avatar-name', OWNER_NAME);
    await expect(row.getByText(OWNER_NAME, { exact: true })).toBeVisible();
    // ...and not the Trainee.
    await expect(row.getByText(TRAINEE_NAME, { exact: true })).toHaveCount(0);
    // The row's Edit control is gated on `user.uid === interaction.userId` for
    // a manager view, so its presence proves the stored `userId` is the
    // Full-timer's signed-in uid, not the impersonated one.
    await expect(row.getByRole('button', { name: /^edit$/i })).toBeVisible();
    await expect(contactPage.getByText(/missing or insufficient permissions/i)).toHaveCount(0);
  });
});
