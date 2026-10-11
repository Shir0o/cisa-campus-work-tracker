import { test, expect } from '@playwright/test';
import { signInAs } from './helpers/auth';

// The Full-timer half of this spec (Quick Capture with tags and a stage, the
// Journey-board advance, and the story composer's "By:" chip) now lives in
// e2e/journeys/full-timer.spec.ts (#1477), where it is re-homed alongside the
// rest of the Full-timer journey. The Student and Community halves remain for
// #1480.
test.describe('Cross-Role Journey Progression & Action Vocabulary (#631)', () => {
  test.describe.configure({ mode: 'serial' });

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

  test('Community role is denied the Journey board, the People directory, and Gatherings', async ({ page }) => {
    await signInAs(page, 'community');

    // 1. Attempt /board -> redirect to /
    await page.goto('/board');
    await page.waitForURL((url) => url.pathname !== '/board', { timeout: 10_000 });
    expect(new URL(page.url()).pathname).toBe('/');

    // 2. Attempt /directory -> redirect to /
    await page.goto('/directory');
    await page.waitForURL((url) => url.pathname !== '/directory', { timeout: 10_000 });
    expect(new URL(page.url()).pathname).toBe('/');

    // 3. Gatherings exposes the whole contact database, so it shares People's
    //    floor — Community is denied /attendance too.
    await page.goto('/attendance');
    await page.waitForURL((url) => url.pathname !== '/attendance', { timeout: 10_000 });
    expect(new URL(page.url()).pathname).toBe('/');
  });
});
