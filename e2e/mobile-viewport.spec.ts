import { test, expect } from '@playwright/test';
import { signInAs } from './helpers/auth';

test.describe('Mobile Viewport Compliance (#761)', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  const routes = [
    { path: '/', name: 'MyDay' },
    { path: '/directory', name: 'People' },
    { path: '/attendance', name: 'Attendance' },
    { path: '/prayer', name: 'PrayerList' },
    { path: '/board', name: 'JourneyBoard' },
    { path: '/history', name: 'History' },
    { path: '/visits', name: 'Visits' },
    { path: '/coordination', name: 'CoordinationNotes' },
    { path: '/settings', name: 'Settings' },
    { path: '/support', name: 'Support' },
    { path: '/privacy', name: 'PrivacyPolicy' },
  ];

  test('no horizontal overflow across mobile routes', async ({ page }) => {
    await signInAs(page, 'fulltimer');

    for (const route of routes) {
      await page.goto(route.path);
      await page.waitForSelector('[aria-label="Main Navigation"], main, [role="main"]', { timeout: 15_000 });

      // Check for horizontal overflow: scrollWidth should equal clientWidth on document root
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));

      expect(
        scrollWidth,
        `Horizontal overflow detected on route ${route.path} (${route.name}): scrollWidth ${scrollWidth} > clientWidth ${clientWidth}`,
      ).toBeLessThanOrEqual(clientWidth);
    }
  });

  test('touch targets on Directory header and bulk actions meet min 44px height', async ({ page }) => {
    await signInAs(page, 'fulltimer');
    await page.goto('/directory');
    await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });

    // "Add someone" button and "More" button in mobile header
    const addSomeoneBtn = page.getByRole('button', { name: /add someone/i }).first();
    await expect(addSomeoneBtn).toBeVisible({ timeout: 10_000 });
    const addBox = await addSomeoneBtn.boundingBox();
    expect(addBox, 'Add someone button bounding box should exist').not.toBeNull();
    if (addBox) {
      expect(addBox.height, 'Add someone button height should be >= 43.5px').toBeGreaterThanOrEqual(43.5);
    }

    const moreBtn = page.getByRole('button', { name: /more/i }).first();
    await expect(moreBtn).toBeVisible({ timeout: 10_000 });
    const moreBox = await moreBtn.boundingBox();
    expect(moreBox, 'More button bounding box should exist').not.toBeNull();
    if (moreBox) {
      expect(moreBox.height, 'More button height should be >= 43.5px').toBeGreaterThanOrEqual(43.5);
    }

    // Open the More menu to check nested action touch targets
    await moreBtn.click();
    const smartImportBtn = page.getByRole('button', { name: /smart import/i });
    if (await smartImportBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      const smartImportBox = await smartImportBtn.boundingBox();
      if (smartImportBox) {
        expect(smartImportBox.height, 'Smart Import menu button height should be >= 43.5px').toBeGreaterThanOrEqual(43.5);
      }
    }
  });
});
