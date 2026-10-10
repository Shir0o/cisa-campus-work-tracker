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

    // 4. Contact Details Modal opens (titled "Contact details" since #1521,
    //    with the contact name as an "About …" button).
    const dialog = page.getByRole('dialog', { name: /contact details/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Lila Chen').first()).toBeVisible();

    // 5. Open the "Conversation" (thread) tab
    const threadTab = page.getByRole('button', { name: /conversation/i }).first();
    await expect(threadTab).toBeVisible();
    await threadTab.click();

    // Verify initial seeded thread message is rendered
    await expect(page.getByText('Great first connection with Lila. Let us follow up this week.')).toBeVisible();

    // Post a new message in the Conversation thread
    const threadInput = page.getByPlaceholder('Write something…').first();
    await expect(threadInput).toBeVisible();
    const newThreadMessage = `Full-timer encouragement message ${Date.now()}`;
    await threadInput.fill(newThreadMessage);
    await threadInput.press('Meta+Enter');

    // Message appears without Firestore permission errors. Scope to the first
    // match: the composer holds the same text until its draft clears.
    await expect(page.getByText(newThreadMessage).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('body')).not.toContainText('Missing or insufficient permissions');

    // 6. Open "Full-timers" tab (Team confidential discussion for Full-timers)
    const discussionTab = page.getByRole('button', { name: /full-timers/i }).first();
    await expect(discussionTab).toBeVisible();
    await discussionTab.click();

    // Verify confidential seed note is rendered
    await expect(page.getByText(/Confidential Staff Note: Lila mentioned some family challenges/i)).toBeVisible();

    // Post a confidential discussion note
    const discussionInput = page.getByPlaceholder(/Write something only Full-timers will see/i).first();
    await expect(discussionInput).toBeVisible();
    const confidentialNote = `Staff confidential coordination note ${Date.now()}`;
    await discussionInput.fill(confidentialNote);
    await discussionInput.press('Meta+Enter');

    await expect(page.getByText(confidentialNote).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('body')).not.toContainText('Missing or insufficient permissions');
  });

  // The trainee half of this spec (the Full-timers stream staying hidden) now
  // lives in e2e/journeys/trainee.spec.ts (#1475). The Full-timer half remains
  // for the full-timer journey (#1477); the Student half for #1480.

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

    // 4. Verify the Full-timers tab is hidden from Student
    await expect(page.getByRole('button', { name: /^full-timers/i })).not.toBeVisible();
    await expect(page.locator('body')).not.toContainText('Confidential Staff Note');

    // 5. The contact pane shows the Conversation directly for a Student too
    // (no Full-timers tab, so no tab switcher).
    await expect(page.getByText('Great first connection with Lila. Let us follow up this week.')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Missing or insufficient permissions');
  });
});
