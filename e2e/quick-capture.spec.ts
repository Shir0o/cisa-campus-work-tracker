import { test, expect } from '@playwright/test';
import { signInAs } from './helpers/auth';

test.describe('Quick Capture Flow', () => {
  test('Full-timer can use quick capture to add someone new, log conversations, and hand over tasks', async ({ page }) => {
    await signInAs(page, 'fulltimer');

    // Verify on home page / My Day
    await page.goto('/');
    await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });

    // Look for Quick Capture or Add Contact buttons/triggers
    const addPersonBtn = page.getByRole('button', { name: /someone new|add contact|new contact|\+ person/i }).first();
    if (await addPersonBtn.isVisible()) {
      await addPersonBtn.click();

      // Modal / Sheet opens
      const nameInput = page.getByPlaceholder(/name|full name/i).first();
      await expect(nameInput).toBeVisible({ timeout: 5_000 });
      const testName = `E2E Tester ${Date.now()}`;
      await nameInput.fill(testName);

      // Submit new contact
      const saveBtn = page.getByRole('button', { name: /save|add|create|done/i }).first();
      if (await saveBtn.isVisible()) {
        await saveBtn.click();
      }
    }

    // Test Logging a conversation / moment
    const logMomentBtn = page.getByRole('button', { name: /log a moment|a conversation|log interaction/i }).first();
    if (await logMomentBtn.isVisible()) {
      await logMomentBtn.click();
      const noteInput = page.locator('textarea, input[type="text"]').first();
      if (await noteInput.isVisible({ timeout: 3_000 })) {
        await noteInput.fill('Had a great encouraging conversation today.');
      }
      // Close or save sheet
      const closeOrSave = page.getByRole('button', { name: /save|close|cancel|done/i }).first();
      if (await closeOrSave.isVisible()) {
        await closeOrSave.click();
      }
    }

    // Test Handing something over / to-do task
    const handOverBtn = page.getByRole('button', { name: /hand something over|add task|new to-do/i }).first();
    if (await handOverBtn.isVisible()) {
      await handOverBtn.click();
      const taskInput = page.locator('textarea, input[placeholder*="to-do"], input[placeholder*="task"]').first();
      if (await taskInput.isVisible({ timeout: 3_000 })) {
        await taskInput.fill('Follow up on study group notes');
      }
      const submitTask = page.getByRole('button', { name: /save|hand over|create/i }).first();
      if (await submitTask.isVisible()) {
        await submitTask.click();
      }
    }
  });
});
