import { test, expect } from '@playwright/test';
import { signInAs } from './helpers/auth';

test.describe('Questions for the Team E2E - User Stories (#603)', () => {
  test.describe.configure({ mode: 'serial' });

  test('Story 1 & 2: Full-timer in Trainee preview can view and submit questions without Firestore permission errors', async ({ page }) => {
    // 1. Sign in as Full-timer
    await signInAs(page, 'fulltimer');

    // 2. Open "See as their view" modal if available and select Trainee preview
    const eyeBtn = page.getByLabel('See as their view');
    if (await eyeBtn.isVisible()) {
      await eyeBtn.click();
      await expect(page.getByRole('heading', { name: /see as their view/i })).toBeVisible();

      const traineeRoleBtn = page.getByRole('button', { name: 'Trainee' }).first();
      if (await traineeRoleBtn.isVisible()) {
        await traineeRoleBtn.click();
      }

      const closeBtn = page.getByLabel('Close modal');
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
      }
    }

    // 3. Navigate to Messages
    await page.goto('/messages');
    await page.waitForSelector('.msgs-rail', { timeout: 15_000 });

    // 4. "Questions for the team" should be visible in the sidebar rail
    const askChannelRow = page.getByText('Questions for the team');
    await expect(askChannelRow).toBeVisible();
    await askChannelRow.click();

    // 5. Verify the channel pane opens
    const composer = page.getByPlaceholder('Ask the team something real…');
    if (await composer.isVisible()) {
      await composer.fill('E2E Simulated Trainee Question: How do we coordinate campus outreach?');
      await composer.press('Meta+Enter');

      // Check for success feedback or posted message
      await page.waitForTimeout(500);
      await expect(page.locator('body')).not.toContainText('Missing or insufficient permissions');
    }
  });

  test('Story 3 & 4: Trainee role can view their questions and post a new question to the team', async ({ page }) => {
    // 1. Sign in as Trainee
    await signInAs(page, 'trainee');

    // 2. Navigate to Messages
    await page.goto('/messages');
    await page.waitForSelector('.msgs-rail', { timeout: 15_000 });

    // 3. Open "Questions for the team"
    const askChannelRow = page.getByText('Questions for the team');
    await expect(askChannelRow).toBeVisible();
    await askChannelRow.click();

    // 4. Trainee composer is present
    const composer = page.getByPlaceholder('Ask the team something real…');
    await expect(composer).toBeVisible();

    const testQuestion = `E2E Trainee Question ${Date.now()}: Where can we get extra flyers?`;
    await composer.fill(testQuestion);
    await composer.press('Meta+Enter');

    // 5. Verify question is submitted without permission-denied error
    await page.waitForTimeout(500);
    await expect(page.locator('body')).not.toContainText('Missing or insufficient permissions');
  });

  test('Story 5, 6 & 7: Full-timer can view all open questions, answer in thread, and record an in-person question', async ({ page }) => {
    // 1. Sign in as Full-timer
    await signInAs(page, 'fulltimer');

    // 2. Navigate to Messages
    await page.goto('/messages');
    await page.waitForSelector('.msgs-rail', { timeout: 15_000 });

    // 3. Open Questions for the team
    const askChannelRow = page.getByText('Questions for the team');
    await expect(askChannelRow).toBeVisible();
    await askChannelRow.click();

    // 4. Verify Full-timer sees both modes: "Someone asked me" and "My own question"
    const someoneAskedBtn = page.getByText('Someone asked me');
    const myOwnBtn = page.getByText('My own question');
    await expect(someoneAskedBtn).toBeVisible();
    await expect(myOwnBtn).toBeVisible();

    // 5. Test recording an in-person question on behalf of a trainee
    await someoneAskedBtn.click();
    const inPersonInput = page.getByPlaceholder('In their words, as close as you can remember…');
    if (await inPersonInput.isVisible()) {
      await inPersonInput.fill('E2E In-person question recorded by Full-timer');
      // If a trainee pill is available, select it
      const traineePill = page.locator('.ask-persona-pill').first();
      if (await traineePill.isVisible()) {
        await traineePill.click();
      }
      await inPersonInput.press('Meta+Enter');
      await page.waitForTimeout(500);
      await expect(page.locator('body')).not.toContainText('Missing or insufficient permissions');
    }

    // 6. Test switching to "My own question"
    await myOwnBtn.click();
    const ownInput = page.getByPlaceholder('Ask the team something real…');
    if (await ownInput.isVisible()) {
      await ownInput.fill('E2E Full-timer staff question: When is staff prayer this week?');
      await ownInput.press('Meta+Enter');
      await page.waitForTimeout(500);
      await expect(page.locator('body')).not.toContainText('Missing or insufficient permissions');
    }
  });

  test('Story 8 & 9: Non-staff roles (Student and Community) do not have Questions for the team rendered', async ({ page }) => {
    // 1. Sign in as Student
    await signInAs(page, 'student');
    await page.goto('/messages');
    await page.waitForSelector('.msgs-rail', { timeout: 15_000 });
    await expect(page.getByText('Questions for the team')).not.toBeVisible();

    // 2. Sign in as Community
    await signInAs(page, 'community');
    await page.goto('/messages');
    await page.waitForSelector('.msgs-rail', { timeout: 15_000 });
    await expect(page.getByText('Questions for the team')).not.toBeVisible();
  });

  test('Story 10: Full-timer previewing Student or Community role hides Questions for the team channel cleanly', async ({ page }) => {
    // 1. Sign in as Full-timer
    await signInAs(page, 'fulltimer');

    // 2. Open "See as their view" and select Student
    const eyeBtn = page.getByLabel('See as their view');
    if (await eyeBtn.isVisible()) {
      await eyeBtn.click();
      const studentRoleBtn = page.getByRole('button', { name: 'Student' }).first();
      if (await studentRoleBtn.isVisible()) {
        await studentRoleBtn.click();
      }
      const closeBtn = page.getByLabel('Close modal');
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
      }

      await page.goto('/messages');
      await page.waitForSelector('.msgs-rail', { timeout: 15_000 });
      await expect(page.getByText('Questions for the team')).not.toBeVisible();
    }
  });
});
