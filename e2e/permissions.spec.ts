/**
 * End-to-end permissions validation against REAL Firebase Auth + Firestore.
 *
 * Signs in as each real test user and verifies the sidebar nav items,
 * route access / redirects, and Quick Actions FAB visibility.
 *
 * Prerequisites (see playwright.config.ts):
 *   - e2e/.test-credentials.json present
 *   - VITE_FIREBASE_API_KEY set
 *   Run:  VITE_FIREBASE_API_KEY=<key> npm run test:e2e
 */

import { test, expect, type Page } from '@playwright/test';
import { signInAs, type Role } from './helpers/auth';

async function visibleNavLabels(page: Page): Promise<string[]> {
  return page.getByLabel('Main Navigation').getByRole('link').allInnerTexts();
}

async function expectRedirectedFrom(page: Page, from: string, expectedLanding: string) {
  await page.goto(from);
  await page.waitForURL((url) => url.pathname !== from, { timeout: 8_000 });
  expect(new URL(page.url()).pathname).toBe(expectedLanding);
}

// role (display key) → expected nav + route access. Internal role in parens.
const EXPECT: Record<Role, {
  nav: { present: string[]; absent: string[] };
  allowed: string[];
  denied: string[];
  fallback: string;
  fab: boolean;
}> = {
  community: { // viewer
    nav: { present: ['Gatherings', 'Prayer', 'Settings'], absent: ['Today', 'The Journey', 'People', 'Looking back'] },
    allowed: ['/attendance', '/prayer', '/settings'],
    denied: ['/', '/board', '/directory', '/history', '/admin/feedback'],
    fallback: '/attendance',
    fab: false,
  },
  student: { // operator
    nav: { present: ['Today', 'People', 'Gatherings', 'Prayer', 'Settings'], absent: ['The Journey', 'Looking back'] },
    allowed: ['/', '/directory', '/attendance', '/prayer', '/settings'],
    denied: ['/board', '/history', '/admin/feedback'],
    fallback: '/',
    fab: true,
  },
  trainee: { // manager
    nav: { present: ['Today', 'The Journey', 'People', 'Looking back', 'Gatherings', 'Prayer', 'Settings'], absent: [] },
    allowed: ['/', '/board', '/directory', '/history', '/attendance', '/prayer', '/settings'],
    denied: ['/admin/feedback'],
    fallback: '/',
    fab: true,
  },
  fulltimer: { // admin
    nav: { present: ['Today', 'The Journey', 'People', 'Looking back', 'Gatherings', 'Prayer', 'Settings'], absent: [] },
    allowed: ['/', '/board', '/directory', '/history', '/attendance', '/prayer', '/settings', '/admin/feedback'],
    denied: [],
    fallback: '/',
    fab: true,
  },
};

for (const role of Object.keys(EXPECT) as Role[]) {
  const spec = EXPECT[role];

  test.describe(`Role: ${role}`, () => {
    test.beforeEach(async ({ page }) => {
      await signInAs(page, role);
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
        await page.waitForLoadState('networkidle');
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

    test('Quick Actions FAB visibility', async ({ page }) => {
      const fab = page.getByRole('button', { name: /quick actions/i });
      if (spec.fab) await expect(fab).toBeVisible();
      else await expect(fab).toHaveCount(0);
    });
  });
}
