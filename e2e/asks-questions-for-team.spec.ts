import { test, expect, Page } from '@playwright/test';
import { signInAs } from './helpers/auth';

// Questions for the team (#603, #645) — driven against its own page (#646).
// These stories used to run through the Messages rail's "Questions for the team"
// channel. That channel is gone: its bottom composer read as "reply" but posted a
// new question, so the surface moved to /questions, where answering happens ON a
// question and asking is a panel you open on purpose.

const heading = (page: Page) => page.getByRole('heading', { name: 'Questions for the team' });

async function openQuestions(page: Page) {
  await page.goto('/questions');
  await expect(heading(page)).toBeVisible({ timeout: 15_000 });
}

/** Open the ask panel. The header button toggles to "Close", so afterwards the
 *  only "Ask the team" control left is the panel's own submit. */
async function openAskPanel(page: Page) {
  await page.getByRole('button', { name: 'Ask the team', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
}

const OWN_PLACEHOLDER = /What do you want to ask/;
const FOR_PLACEHOLDER = /In their words, as close as you can remember/;

test.describe('Questions for the Team E2E - User Stories (#603, #645)', () => {
  test.describe.configure({ mode: 'serial' });

  test('Story 1 & 2: Full-timer in Trainee preview can view and submit questions without Firestore permission errors', async ({ page }) => {
    await signInAs(page, 'fulltimer');

    const eyeBtn = page.getByLabel('See as their view');
    if (await eyeBtn.isVisible()) {
      await eyeBtn.click();
      await expect(page.getByRole('heading', { name: /see as their view/i })).toBeVisible();
      const traineeRoleBtn = page.getByRole('button', { name: 'Trainee' }).first();
      if (await traineeRoleBtn.isVisible()) await traineeRoleBtn.click();
      const closeBtn = page.getByLabel('Close modal');
      if (await closeBtn.isVisible()) await closeBtn.click();
    }

    await openQuestions(page);
    await openAskPanel(page);

    const composer = page.getByPlaceholder(OWN_PLACEHOLDER);
    await composer.fill('E2E Simulated Trainee Question: How do we coordinate campus outreach?');
    await composer.press('Meta+Enter');

    // Writes stay bound to the real authenticated account (#603).
    await expect(page.locator('body')).not.toContainText('Missing or insufficient permissions');
  });

  test('Story 3 & 4: Trainee can read the team feed and post a new question to the team', async ({ page }) => {
    await signInAs(page, 'trainee');
    await openQuestions(page);
    await openAskPanel(page);

    const composer = page.getByPlaceholder(OWN_PLACEHOLDER);
    await expect(composer).toBeVisible();

    const testQuestion = `E2E Trainee Question ${Date.now()}: Where can we get extra flyers?`;
    await composer.fill(testQuestion);
    await composer.press('Meta+Enter');

    await expect(page.locator('body')).not.toContainText('Missing or insufficient permissions');
    await page.getByRole('button', { name: /^All/ }).click();
    await expect(page.getByText(testQuestion)).toBeVisible({ timeout: 15_000 });
  });

  test('Story 5, 6 & 7: Full-timer sees every open question, answers on it, and records an in-person question', async ({ page }) => {
    await signInAs(page, 'fulltimer');
    await openQuestions(page);
    await openAskPanel(page);

    // Both modes are offered, and "My own question" is the default — the old
    // channel defaulted to recording for a trainee, which is how answers became
    // questions filed under someone else's name.
    const someoneAskedBtn = page.getByRole('button', { name: 'Someone asked me' });
    const myOwnBtn = page.getByRole('button', { name: 'My own question' });
    await expect(someoneAskedBtn).toBeVisible();
    await expect(myOwnBtn).toBeVisible();
    await expect(page.getByPlaceholder(OWN_PLACEHOLDER)).toBeVisible();
    await expect(page.getByText('Who asked it?')).not.toBeVisible();

    // Recording in person: nobody is pre-selected, so the action stays disabled.
    await someoneAskedBtn.click();
    const inPersonInput = page.getByPlaceholder(FOR_PLACEHOLDER);
    await inPersonInput.fill('E2E In-person question recorded by Full-timer');
    const writeItDown = page.getByRole('button', { name: 'Write it down' });
    await expect(writeItDown).toBeDisabled();

    await page.getByText('Who asked it?').waitFor();
    await page.getByRole('button', { name: /Caleb/ }).first().click();
    await expect(writeItDown).toBeEnabled();
    await writeItDown.click();
    await expect(page.locator('body')).not.toContainText('Missing or insufficient permissions');

    // And their own question.
    await openAskPanel(page);
    const ownInput = page.getByPlaceholder(OWN_PLACEHOLDER);
    await ownInput.fill('E2E Full-timer staff question: When is staff prayer this week?');
    await ownInput.press('Meta+Enter');
    await expect(page.locator('body')).not.toContainText('Missing or insufficient permissions');
  });

  test('Story 8 & 9: Non-staff roles (Student and Community) cannot reach Questions at all', async ({ page }) => {
    // The route itself is staff-only, so these roles are redirected off it and
    // never see it in the More menu.
    await signInAs(page, 'student');
    await page.goto('/questions');
    await expect(heading(page)).not.toBeVisible();

    await signInAs(page, 'community');
    await page.goto('/questions');
    await expect(heading(page)).not.toBeVisible();
  });

  test('Story 11 (#645): A Full-timer\'s "My own question" is visible to a Trainee on the page and the trainee home', async ({ page }) => {
    await signInAs(page, 'fulltimer');
    await openQuestions(page);
    await openAskPanel(page);

    const ftQuestion = `E2E FT Question ${Date.now()}: Where is the team retreat?`;
    const ownInput = page.getByPlaceholder(OWN_PLACEHOLDER);
    await ownInput.fill(ftQuestion);
    await ownInput.press('Meta+Enter');
    await expect(page.locator('body')).not.toContainText('Missing or insufficient permissions');

    await signInAs(page, 'trainee');
    await page.goto('/');
    await expect(page.getByText(ftQuestion)).toBeVisible({ timeout: 15_000 });

    await openQuestions(page);
    await page.getByRole('button', { name: /^All/ }).click();
    await expect(page.getByText(ftQuestion)).toBeVisible({ timeout: 15_000 });
  });

  test('Story 12 (#645): Another Trainee\'s question and the Full-timer\'s answer are visible to a Trainee, inline', async ({ page }) => {
    await signInAs(page, 'trainee2');
    await openQuestions(page);
    await openAskPanel(page);

    const t2Question = `E2E Trainee2 Question ${Date.now()}: How do we handle late students?`;
    const t2Input = page.getByPlaceholder(OWN_PLACEHOLDER);
    await t2Input.fill(t2Question);
    await t2Input.press('Meta+Enter');
    await expect(page.locator('body')).not.toContainText('Missing or insufficient permissions');

    // The Full-timer answers ON the question — no thread pane, no ambient composer.
    await signInAs(page, 'fulltimer');
    await openQuestions(page);
    const card = page.locator('article', { hasText: t2Question });
    await card.getByRole('button', { name: /^Answer / }).click();
    const answerBox = card.getByRole('textbox');
    await answerBox.fill('Say hi when they arrive and catch them after.');
    await card.getByRole('button', { name: 'Send answer' }).click();

    await signInAs(page, 'trainee');
    await page.goto('/');
    await expect(page.getByText(t2Question)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Caleb Owusu').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Say hi when they arrive and catch them after.')).toBeVisible({ timeout: 15_000 });
  });

  test('Story 13 (#645): A Trainee reads another staff member\'s question but cannot answer it', async ({ page }) => {
    await signInAs(page, 'fulltimer');
    await openQuestions(page);
    await openAskPanel(page);

    const ftQuestion = `E2E Readonly Question ${Date.now()}: Any update on the flyer order?`;
    const ownInput = page.getByPlaceholder(OWN_PLACEHOLDER);
    await ownInput.fill(ftQuestion);
    await ownInput.press('Meta+Enter');

    // The trainee reads it, and the card offers no answer control at all.
    await signInAs(page, 'trainee');
    await openQuestions(page);
    await page.getByRole('button', { name: /^All/ }).click();
    const card = page.locator('article', { hasText: ftQuestion });
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.getByText('A full-timer will answer this.')).toBeVisible();
    await expect(card.getByRole('button', { name: /^Answer / })).toHaveCount(0);
  });
});
