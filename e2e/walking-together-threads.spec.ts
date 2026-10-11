import { test, expect } from '@playwright/test';
import { signInAs } from './helpers/auth';

// The Full-timer half of this spec (contact threads, the general Conversation
// post, and the team-confidential "Full-timers" discussion) now lives in
// e2e/journeys/full-timer.spec.ts (#1477), where it is re-homed alongside the
// rest of the Full-timer journey. The Student half remains for #1480.
test.describe('Walking-Together Contact Threads & Team Confidentiality (#630)', () => {
  test.describe.configure({ mode: 'serial' });

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
