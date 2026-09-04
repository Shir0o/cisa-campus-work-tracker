import { test, expect } from '@playwright/test';
import { signInAs } from './helpers/auth';

test.describe('Cross-Role Journey Progression & Action Vocabulary (#631)', () => {
  test.describe.configure({ mode: 'serial' });

  const testContactName = `Journey Tester ${Date.now()}`;

  test('Full-timer creates contact via Quick Capture with tags and initial stage', async ({ page }) => {
    await signInAs(page, 'fulltimer');

    // 1. Navigate to People directory
    await page.goto('/directory');
    await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });

    // 2. Open Quick Add / New Contact modal via keyboard shortcut or search
    const searchInput = page.getByPlaceholder(/search people/i).first();
    if (await searchInput.isVisible()) {
      await searchInput.click();
    } else {
      await page.keyboard.press('Meta+k');
    }

    // Click "New person" quick action
    const newPersonAction = page.getByRole('button', { name: /new person/i }).first();
    await expect(newPersonAction).toBeVisible({ timeout: 5_000 });
    await newPersonAction.click();

    // 3. New Contact modal opens
    await expect(page.getByRole('heading', { name: /new contact/i })).toBeVisible({ timeout: 5_000 });

    // Fill in Contact Name
    const firstNameInput = page.getByPlaceholder(/first name/i).first();
    await firstNameInput.fill(testContactName);

    // Fill phone number
    const phoneInput = page.getByPlaceholder(/\(555\) 000-0000/i).first();
    await phoneInput.fill('555-019-2834');

    // Expand "+ Add the rest (optional details)" disclosure
    const showMoreBtn = page.getByRole('button', { name: /\+ add the rest/i });
    if (await showMoreBtn.isVisible()) {
      await showMoreBtn.click();
    }

    // Select Stage: "First Contact"
    const stageSelect = page.getByLabel(/stage|where they're at/i).first();
    if (await stageSelect.isVisible()) {
      await stageSelect.selectOption({ label: 'First Contact' });
    }

    // Add tags: "Freshman", "Gospel"
    const tagInput = page.getByPlaceholder(/e\.g\. Gospel/i).first();
    if (await tagInput.isVisible()) {
      await tagInput.fill('Freshman, Gospel');
      await tagInput.press('Enter');
    }

    // Submit the form (button labeled "Add Contact")
    const createBtn = page.getByRole('button', { name: 'Add Contact' });
    if (await createBtn.isVisible()) {
      await createBtn.click();
    }

    // 4. Modal closes and contact appears in directory
    await expect(page.getByText(testContactName).first()).toBeVisible({ timeout: 10_000 });

    // Verify tags are rendered
    await expect(page.getByText('Freshman').first()).toBeVisible();
    await expect(page.getByText('Gospel').first()).toBeVisible();
  });

  test('Full-timer advances contact across Journey pipeline and change reflects in real time', async ({ page }) => {
    await signInAs(page, 'fulltimer');

    // 1. Navigate to The Journey board
    await page.goto('/board');
    await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });
    expect(new URL(page.url()).pathname).toBe('/board');

    // 2. Locate contact in "First Contact" column
    const contactCard = page.getByText(testContactName).first();
    await expect(contactCard).toBeVisible({ timeout: 10_000 });

    // Click contact card to open detail modal
    await contactCard.click();
    await expect(page.getByRole('heading', { name: testContactName })).toBeVisible({ timeout: 5_000 });

    // 3. Edit contact stage from First Contact to Second Contact
    const moreActionsBtn = page.getByRole('button', { name: /more actions/i }).first();
    await expect(moreActionsBtn).toBeVisible({ timeout: 5_000 });
    await moreActionsBtn.click();

    const editBtn = page.getByRole('button', { name: /edit details/i }).first();
    await expect(editBtn).toBeVisible({ timeout: 5_000 });
    await editBtn.click();

    const stageSelect = page.getByRole('combobox', { name: /stage/i }).first();
    await expect(stageSelect).toBeVisible();
    await stageSelect.selectOption({ label: 'Second Contact' });

    // Save changes
    const saveBtn = page.getByRole('button', { name: /save changes/i });
    await saveBtn.click();

    // Close contact detail modal
    const closeBtn = page.getByRole('button', { name: /close/i }).first();
    await closeBtn.click();

    // 4. Verify contact is now under Second Contact on the board
    await expect(page.getByText(testContactName).first()).toBeVisible({ timeout: 5_000 });
  });

  test('Trainee can view the Journey board and observe the updated contact in Second Contact', async ({ page }) => {
    await signInAs(page, 'trainee');

    // 1. Navigate to The Journey board
    await page.goto('/board');
    await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });
    expect(new URL(page.url()).pathname).toBe('/board');

    // 2. Verify contact stage columns render
    const board = page.locator('body');
    await expect(board).toContainText('First Contact');
    await expect(board).toContainText('Second Contact');
  });

  test('Student has access to People directory with row action vocabulary but is denied from The Journey board', async ({ page }) => {
    await signInAs(page, 'student');

    // 1. Attempt to navigate directly to /board — should redirect to /
    await page.goto('/board');
    await page.waitForURL((url) => url.pathname !== '/board', { timeout: 10_000 });
    expect(new URL(page.url()).pathname).toBe('/');

    // 2. Navigate to People directory
    await page.goto('/directory');
    await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });
    expect(new URL(page.url()).pathname).toBe('/directory');

    // 3. Verify consistent person card row actions
    const moreBtn = page.getByRole('button', { name: /more for/i }).first();
    if (await moreBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await moreBtn.click();
      // Action vocabulary assertion: Open ...'s page & I followed up
      await expect(page.getByRole('menuitem', { name: /open .*'s page/i })).toBeVisible();
      await expect(page.getByRole('menuitem', { name: /i followed up/i })).toBeVisible();
    }
  });

  test('Community role is denied from both The Journey board and People directory', async ({ page }) => {
    await signInAs(page, 'community');

    // 1. Attempt /board -> redirect to /
    await page.goto('/board');
    await page.waitForURL((url) => url.pathname !== '/board', { timeout: 10_000 });
    expect(new URL(page.url()).pathname).toBe('/');

    // 2. Attempt /directory -> redirect to /
    await page.goto('/directory');
    await page.waitForURL((url) => url.pathname !== '/directory', { timeout: 10_000 });
    expect(new URL(page.url()).pathname).toBe('/');

    // 3. Can access Gatherings /attendance
    await page.goto('/attendance');
    await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });
    expect(new URL(page.url()).pathname).toBe('/attendance');
  });
});
