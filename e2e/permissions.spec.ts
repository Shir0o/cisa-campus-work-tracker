/**
 * End-to-end permissions validation against REAL Firebase Auth + Firestore.
 *
 * Signs in as each real test user and verifies the landing route, the sidebar
 * nav items, and route access / redirects.
 *
 * Mirrors the matrix in src/lib/permissions.ts (and its unit test,
 * src/test/permissions.test.tsx). Every approved role lands on `/`; guarded
 * routes redirect a denied role back to `/`. The home nav label is role-aware:
 * admin (Full-timer) sees "My Day", everyone else sees "Home".
 *
 * Prerequisites (see playwright.config.ts):
 *   - e2e/.test-credentials.json present
 *   - VITE_FIREBASE_API_KEY set
 *   Run:  VITE_FIREBASE_API_KEY=<key> npm run test:e2e
 */

import { test, expect, type Page } from '@playwright/test';
import { signInAs, type Role } from './helpers/auth';

async function visibleNavLabels(page: Page): Promise<string[]> {
  const nav = page.getByLabel('Main Navigation');
  // Primary tabs + brand link (anchor elements)
  const labels = await nav.getByRole('link').allInnerTexts();
  // Open "More" to gather the remaining destinations (menu items are buttons)
  const more = nav.getByRole('button', { name: /More/i });
  if (await more.isVisible().catch(() => false)) {
    await more.click();
    const moreLabels = await nav.getByRole('menu').getByRole('button').allInnerTexts();
    labels.push(...moreLabels);
  }
  return labels;
}

async function expectRedirectedFrom(page: Page, from: string, expectedLanding: string) {
  await page.goto(from);
  await page.waitForURL((url) => url.pathname !== from, { timeout: 8_000 });
  expect(new URL(page.url()).pathname).toBe(expectedLanding);
}

// role (display key) → expected landing, nav, and route access. Internal role
// in parens. Denied routes all redirect to `fallback`.
const EXPECT: Record<Role, {
  landing: string;
  nav: { present: string[]; absent: string[] };
  allowed: string[];
  denied: string[];
  fallback: string;
}> = {
  community: { // viewer
    landing: '/',
    nav: {
      present: ['Home', 'Gatherings', 'On our hearts', 'Messages'],
      absent: ['The Journey', 'People', 'Looking back', 'Coordination Notes'],
    },
    allowed: ['/', '/attendance', '/prayer', '/messages', '/settings', '/feedback'],
    denied: ['/board', '/directory', '/history', '/coordination', '/admin/feedback'],
    fallback: '/',
  },
  student: { // operator
    landing: '/',
    nav: {
      present: ['Home', 'People', 'Gatherings', 'On our hearts', 'Messages', 'Coordination Notes'],
      absent: ['The Journey', 'Looking back'],
    },
    allowed: ['/', '/directory', '/attendance', '/prayer', '/messages', '/settings', '/feedback'],
    denied: ['/board', '/history', '/admin/feedback'],
    fallback: '/',
  },
  trainee: { // manager
    landing: '/',
    nav: {
      present: ['Home', 'The Journey', 'People', 'Messages'],
      absent: ['Coordination Notes', 'Visits'],
    },
    allowed: ['/', '/board', '/directory', '/messages', '/feedback'],
    denied: ['/coordination', '/admin/feedback', '/settings'],
    fallback: '/',
  },
  fulltimer: { // admin — home nav label is "My Day", not "Home"
    landing: '/',
    nav: {
      present: ['My Day', 'The Journey', 'People', 'Looking back', 'Gatherings', 'On our hearts', 'Coordination Notes', 'Messages'],
      absent: [],
    },
    allowed: ['/', '/board', '/directory', '/history', '/attendance', '/prayer', '/messages', '/settings', '/feedback', '/coordination', '/admin/feedback'],
    denied: [],
    fallback: '/',
  },
};

for (const role of Object.keys(EXPECT) as Role[]) {
  const spec = EXPECT[role];

  test.describe(`Role: ${role}`, () => {
    test.beforeEach(async ({ page }) => {
      await signInAs(page, role);
    });

    test('lands on the default route', async ({ page }) => {
      expect(new URL(page.url()).pathname).toBe(spec.landing);
    });

    test('sidebar shows correct nav items', async ({ page }) => {
      const labels = await visibleNavLabels(page);
      for (const label of spec.nav.present) {
        expect(labels.some((l) => l.includes(label)), `expected "${label}" present`).toBe(true);
      }
      for (const label of spec.nav.absent) {
        expect(labels.some((l) => l.includes(label)), `"${label}" should be absent`).toBe(false);
      }
    });

    test('allowed routes stay put', async ({ page }) => {
      for (const route of spec.allowed) {
        await page.goto(route);
        // Firebase keeps connections open, so 'networkidle' never fires — wait
        // for the authed app shell to render instead, then assert the guard
        // didn't bounce us elsewhere.
        await page.getByLabel('Main Navigation').waitFor({ state: 'visible', timeout: 20_000 });
        expect(new URL(page.url()).pathname).toBe(route);
      }
    });

    if (spec.denied.length > 0) {
      test('denied routes redirect to fallback', async ({ page }) => {
        for (const route of spec.denied) {
          await expectRedirectedFrom(page, route, spec.fallback);
        }
      });
    }
  });
}
