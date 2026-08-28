import { test, expect } from '@playwright/test';
import { signInAs } from './helpers/auth';

test.describe('Walking-Together Contact Threads & Team Confidentiality (#630)', () => {
  test.describe.configure({ mode: 'serial' });

  test('Full-timer can view contact threads, post a walking-together note, and post confidential team discussion', async ({ page }) => {
    // 1. Sign in as Full-timer
    await signInAs(page, 'fulltimer');

    // 2. Navigate to People directory
    await page.goto('/directory');
    await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });

    // 3. Open Lila Chen's contact card/details
    const contactCard = page.getByText('Lila Chen').first();
    await expect(contactCard).toBeVisible({ timeout: 10_000 });
    await contactCard.click();

    // 4. Contact Details Modal opens
    await expect(page.getByRole('heading', { name: 'Lila Chen' })).toBeVisible();

    // 5. Open "Follow-up" (Thread) tab
    const threadTab = page.getByRole('button', { name: /follow-up/i }).first();
    await expect(threadTab).toBeVisible();
    await threadTab.click();

    // Verify initial seeded thread message is rendered
    await expect(page.getByText('Great first connection with Lila. Let us follow up this week.')).toBeVisible();

    // Post a new message in Follow-up thread
    const threadInput = page.getByPlaceholder('Add a comment…').first();
    await expect(threadInput).toBeVisible();
    const newThreadMessage = `Full-timer encouragement message ${Date.now()}`;
    await threadInput.fill(newThreadMessage);
    await threadInput.press('Meta+Enter');

    // Message appears without Firestore permission errors
    await expect(page.getByText(newThreadMessage)).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('body')).not.toContainText('Missing or insufficient permissions');

    // 6. Open "Discussion" tab (Team confidential discussion for Full-timers)
    const discussionTab = page.getByRole('button', { name: /discussion/i }).first();
    await expect(discussionTab).toBeVisible();
    await discussionTab.click();

    // Verify confidential seed note is rendered
    await expect(page.getByText(/Confidential Staff Note: Lila mentioned some family challenges/i)).toBeVisible();

    // Post a confidential discussion note
    const discussionInput = page.getByPlaceholder("Add to the team's discussion…").first();
    await expect(discussionInput).toBeVisible();
    const confidentialNote = `Staff confidential coordination note ${Date.now()}`;
    await discussionInput.fill(confidentialNote);
    await discussionInput.press('Meta+Enter');

    await expect(page.getByText(confidentialNote)).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('body')).not.toContainText('Missing or insufficient permissions');
  });

  test('Trainee can view permitted walking-together threads and post replies without seeing confidential team discussion', async ({ page }) => {
    // 1. Sign in as Trainee
    await signInAs(page, 'trainee');

    // 2. Navigate to People directory
    await page.goto('/directory');
    await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });

    // 3. Open Lila Chen's contact
    const contactCard = page.getByText('Lila Chen').first();
    await expect(contactCard).toBeVisible({ timeout: 10_000 });
    await contactCard.click();

    // 4. Verify Contact Details modal opens
    await expect(page.getByRole('heading', { name: 'Lila Chen' })).toBeVisible();

    // 5. Check Discussion tab is NOT visible / not accessible
    await expect(page.getByRole('button', { name: /^discussion/i })).not.toBeVisible();
    await expect(page.locator('body')).not.toContainText('Confidential Staff Note');

    // 6. Open Follow-up tab and verify shared walking-together thread is readable
    const threadTab = page.getByRole('button', { name: /follow-up/i }).first();
    await expect(threadTab).toBeVisible();
    await threadTab.click();

    await expect(page.getByText('Great first connection with Lila. Let us follow up this week.')).toBeVisible();

    // Trainee posts a reply / comment in walking-together thread
    const threadInput = page.getByPlaceholder('Add a comment…').first();
    await expect(threadInput).toBeVisible();
    const traineeComment = `Trainee walking-together check-in ${Date.now()}`;
    await threadInput.fill(traineeComment);
    await threadInput.press('Meta+Enter');

    await expect(page.getByText(traineeComment)).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('body')).not.toContainText('Missing or insufficient permissions');
  });

  test('Student role can view contact details and permitted interaction threads without permission errors', async ({ page }) => {
    // 1. Sign in as Student
    await signInAs(page, 'student');

    // 2. Navigate to Directory
    await page.goto('/directory');
    await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });

    // 3. Open Lila Chen's contact card
    const contactCard = page.getByText('Lila Chen').first();
    await expect(contactCard).toBeVisible({ timeout: 10_000 });
    await contactCard.click();

    // 4. Verify Discussion tab is hidden from Student
    await expect(page.getByRole('button', { name: /^discussion/i })).not.toBeVisible();
    await expect(page.locator('body')).not.toContainText('Confidential Staff Note');

    // 5. Open Follow-up tab
    const threadTab = page.getByRole('button', { name: /follow-up/i }).first();
    await expect(threadTab).toBeVisible();
    await threadTab.click();

    // Student sees general thread messages cleanly without permission denied errors
    await expect(page.getByText('Great first connection with Lila. Let us follow up this week.')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Missing or insufficient permissions');
  });
});
