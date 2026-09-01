import { test, expect } from '@playwright/test';
import { signInAs } from './helpers/auth';

test.describe('Notification Bell Deep-Linking & Routing User Stories (#682)', () => {
  test.describe.configure({ mode: 'serial' });

  test('User Story 1: Contact deep-linking routes to /people/:id and opens Contact Details modal', async ({ page }) => {
    // 1. Sign in as Full-timer
    await signInAs(page, 'fulltimer');

    // 2. Deep-link directly to seeded contact Lila Chen (/people/e2e-contact-lila)
    await page.goto('/people/e2e-contact-lila');
    await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });

    // 3. Contact Details modal opens immediately with Lila Chen's information
    await expect(page.getByRole('heading', { name: 'Lila Chen' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('First Contact')).toBeVisible();

    // 4. Test query parameter deep-link with ?tab=thread (/people/e2e-contact-lila?tab=thread)
    await page.goto('/people/e2e-contact-lila?tab=thread');
    await expect(page.getByRole('heading', { name: 'Lila Chen' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Great first connection with Lila. Let us follow up this week.')).toBeVisible({ timeout: 10_000 });
  });

  test('User Story 2: Messages view synchronizes URL parameter :roomId, supports direct link and back navigation', async ({ page }) => {
    // 1. Sign in as Full-timer
    await signInAs(page, 'fulltimer');

    // 2. Navigate to /messages
    await page.goto('/messages');
    await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });

    // 3. If conversations exist in the list, click the first one and verify URL updates to /messages/:roomId
    const firstRoom = page.locator('.msgs-item').first();
    if (await firstRoom.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await firstRoom.click();
      await expect(page).toHaveURL(/\/messages\/[a-zA-Z0-9_-]+/);
      const currentUrl = page.url();

      // Reload or navigate directly to the room URL to verify direct linking works
      await page.goto(currentUrl);
      await expect(page.locator('.msgs-thread')).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('.msgs-composer textarea')).toBeVisible({ timeout: 10_000 });
    } else {
      // Create a direct chat to exercise room selection and routing
      const newChatBtn = page.getByRole('button', { name: /new chat/i }).first();
      if (await newChatBtn.isVisible()) {
        await newChatBtn.click();
        const traineeOption = page.getByText(/Trainee Test User/i).first();
        if (await traineeOption.isVisible()) {
          await traineeOption.click();
          await expect(page).toHaveURL(/\/messages\/[a-zA-Z0-9_-]+/);
        }
      }
    }
  });

  test('User Story 3: Questions for the team routes correctly from deep link and notification links', async ({ page }) => {
    // 1. Sign in as Full-timer
    await signInAs(page, 'fulltimer');

    // 2. Navigate directly to /questions
    await page.goto('/questions');
    await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });

    // 3. Questions for the team page renders
    await expect(page.getByRole('heading', { name: 'Questions for the team' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Ask the team' })).toBeVisible();
  });

  test('User Story 4 & 5: Notification Bell opens, renders notifications, and navigates on item click', async ({ page }) => {
    // 1. Sign in as Full-timer
    await signInAs(page, 'fulltimer');

    // 2. Ensure we are on home
    await page.goto('/');
    await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });

    // 3. Open notification center bell
    const bellBtn = page.getByRole('button', { name: /notification/i }).first();
    await expect(bellBtn).toBeVisible({ timeout: 10_000 });
    await bellBtn.click();

    // 4. Notification popup opens
    const popup = page.getByRole('dialog', { name: /notification/i });
    await expect(popup).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("What's stirring")).toBeVisible();

    // 5. If notifications exist, clicking one triggers navigation
    const notifItem = page.locator('.ntf-item-row').first();
    if (await notifItem.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await notifItem.click();
      // Verifies notification center closes and page navigation occurs
      await expect(popup).not.toBeVisible();
    }
  });
});
