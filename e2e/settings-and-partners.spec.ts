import { test, expect } from '@playwright/test';
import { signInAs } from './helpers/auth';

test.describe('Administrative Settings & Gospel Partner Assignments', () => {
  test.describe('Full-timer (Admin)', () => {
    test('can access Settings, manage partner configurations, goal settings, and member roles', async ({ page }) => {
      await signInAs(page, 'fulltimer');

      // Navigate to Settings
      await page.goto('/settings');
      await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible({ timeout: 15_000 });

      // 1. Verify Administrative Sections are Present
      await expect(page.getByRole('heading', { level: 2, name: 'Your team' })).toBeVisible();
      await expect(page.getByRole('heading', { level: 2, name: 'Going out together' })).toBeVisible();
      await expect(page.getByRole('heading', { level: 2, name: "The day's goal" })).toBeVisible();
      await expect(page.getByRole('heading', { level: 2, name: 'Roles & access' })).toBeVisible();

      // 2. Gospel Partner Assignment Workflow
      // Check if there are any existing pairs and test creating a partnership
      const twoTogetherBtn = page.getByRole('button', { name: /Two trainees going out together/i });
      if (await twoTogetherBtn.isVisible()) {
        await twoTogetherBtn.click();

        // First pick dialog
        await expect(page.getByText("Who's the first of the two?")).toBeVisible();

        // Pick first trainee if available
        const firstTrainee = page.getByRole('button', { name: /Zion Adeyemi|Trainee/i }).first();
        if (await firstTrainee.isVisible()) {
          await firstTrainee.click();

          // Second pick dialog
          await expect(page.getByText(/Who goes out with/i)).toBeVisible();
          const secondTrainee = page.getByRole('button', { name: /Caleb Owusu|Trainee/i }).first();
          if (await secondTrainee.isVisible()) {
            await secondTrainee.click();

            // Verify pair is rendered
            await expect(page.getByText(/Partners this term|going as one/i).first()).toBeVisible({ timeout: 5_000 });
          }
        }
      }

      // Test dropping/resetting pair
      const notPartnersBtn = page.getByRole('button', { name: /They're not partners/i }).first();
      if (await notPartnersBtn.isVisible()) {
        await notPartnersBtn.click();
      }

      // 3. The Day's Goal Workflow
      const goalHeading = page.getByRole('heading', { level: 2, name: "The day's goal" });
      await expect(goalHeading).toBeVisible();

      const goalToggle = page.getByRole('switch');
      if (await goalToggle.isVisible()) {
        const isChecked = await goalToggle.getAttribute('aria-checked');
        await goalToggle.click();
        await expect(goalToggle).toHaveAttribute('aria-checked', isChecked === 'true' ? 'false' : 'true');
        // Toggle back
        await goalToggle.click();
      }

      const raiseGoalBtn = page.getByRole('button', { name: /Raise the day's goal/i });
      if (await raiseGoalBtn.isVisible()) {
        await raiseGoalBtn.click();
      }

      // 4. Team Member Role Management / Add Someone
      const addSomeoneBtn = page.getByRole('button', { name: /Add someone/i });
      await expect(addSomeoneBtn).toBeVisible();
      await addSomeoneBtn.click();

      await expect(page.getByText('Add someone by email')).toBeVisible();

      // Check role options in invitation modal (Full-timer should see Full-timer option)
      const roleSelect = page.locator('form select');
      await expect(roleSelect).toBeVisible();
      const options = await roleSelect.locator('option').allInnerTexts();
      expect(options).toContain('Full-timer');

      // Close modal
      await page.getByRole('button', { name: 'Cancel' }).click();
      await expect(page.getByText('Add someone by email')).not.toBeVisible();
    });
  });

  test.describe('Trainee (Manager)', () => {
    test('is restricted from administrative partner settings and /settings route', async ({ page }) => {
      await signInAs(page, 'trainee');

      // Per permissions.ts, /settings is denied for trainees and redirects to /
      await page.goto('/settings');
      await page.getByLabel('Main Navigation').waitFor({ state: 'visible', timeout: 20_000 });
      expect(new URL(page.url()).pathname).toBe('/');

      // Trainee does not see Going out together or The day's goal anywhere
      await expect(page.getByRole('heading', { level: 2, name: 'Going out together' })).not.toBeVisible();
      await expect(page.getByRole('heading', { level: 2, name: "The day's goal" })).not.toBeVisible();
    });
  });

  test.describe('Student (Operator) and Community (Viewer)', () => {
    test('Student lands on profile view without administrative settings or partner options', async ({ page }) => {
      await signInAs(page, 'student');

      await page.goto('/settings');
      await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible({ timeout: 15_000 });

      await expect(page.getByText('Your account and preferences.')).toBeVisible();
      await expect(page.getByText('Your team')).not.toBeVisible();
      await expect(page.getByText('Going out together')).not.toBeVisible();
      await expect(page.getByText("The day's goal")).not.toBeVisible();
    });

    test('Community lands on profile view without administrative settings or partner options', async ({ page }) => {
      await signInAs(page, 'community');

      await page.goto('/settings');
      await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible({ timeout: 15_000 });

      await expect(page.getByText('Your account and preferences.')).toBeVisible();
      await expect(page.getByText('Your team')).not.toBeVisible();
      await expect(page.getByText('Going out together')).not.toBeVisible();
      await expect(page.getByText("The day's goal")).not.toBeVisible();
    });
  });
});
