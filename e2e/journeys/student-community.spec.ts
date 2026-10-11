/**
 * The Student and Community journey (#1480).
 *
 * A Student lands on `/`, sees their nav (People, Gatherings, …), opens a
 * seeded contact and its shared thread, and opens Quick Capture from People.
 * A Community member lands on `/`, sees their own nav — and has no door to the
 * contact directory: not People, and not sideways through Gatherings (#950).
 *
 * It folds in the last top-level feature specs the e2e map retires, so `e2e/`
 * holds only `journeys/` and `helpers/` after this lands:
 *
 *  - `permissions.spec.ts` — the whole role matrix (landing route, sidebar nav,
 *    route guards) for every role. It is the only coverage of the nav item set
 *    per role (audit §8), so the full matrix moves here verbatim.
 *  - `gatherings-attendance.spec.ts` — `/attendance` loads for a Student and a
 *    Full-timer. No escape row: the retired spec only loaded `/attendance`.
 *  - the Student half of `walking-together-threads.spec.ts` — a contact's
 *    shared thread is readable, the team-confidential note is not (audit row 5
 *    web analogue).
 *  - the Student/Community halves of `cross-role-journey.spec.ts` (#631) — the
 *    People row-action vocabulary, and the Community denials.
 *  - the Student/Community halves of `quick-capture.spec.ts` (#628) — a Student
 *    opens New Contact from People; a Community member gets no entry point.
 *  - `whats-new-video-spike.spec.ts` — deleted, not folded: the recording spike
 *    was retired (ADR 0030) and its remaining My Day → Directory → contact walk
 *    is covered by the Full-timer journey (#1477); Help & What's New gets no
 *    backfill.
 *
 * Negative check: a seeded contact (`Lila Chen`, outside the Community role's
 * navigable scope) is asserted absent from every surface a Community member can
 * reach, and the guarded routes bounce them to `/`.
 */

import { test, expect, type Page } from '@playwright/test';
import { signInAs, type Role } from '../helpers/auth';

const SEEDED_CONTACT = 'Lila Chen'; // seeded contact with threads
const SHARED_THREAD = /great first connection with lila/i;
const CONFIDENTIAL_NOTE = /confidential staff note/i;

async function waitForShell(page: Page) {
  await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });
}

/** The labels the role's shell exposes: primary links plus the More menu. */
async function visibleNavLabels(page: Page): Promise<string[]> {
  const nav = page.getByLabel('Main Navigation');
  const labels = await nav.getByRole('link').allInnerTexts();
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
type MatrixRole = Extract<Role, 'community' | 'student' | 'trainee' | 'fulltimer'>;

const EXPECT: Record<MatrixRole, {
  landing: string;
  nav: { present: string[]; absent: string[] };
  allowed: string[];
  denied: string[];
  fallback: string;
}> = {
  community: { // viewer
    landing: '/',
    nav: {
      present: ['Home', 'On our hearts', 'Messages'],
      absent: ['The Journey', 'People', 'Gatherings', 'Looking back', 'Coordination Notes'],
    },
    allowed: ['/', '/prayer', '/messages', '/settings', '/feedback'],
    denied: ['/board', '/directory', '/attendance', '/history', '/coordination', '/admin/feedback'],
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

/**
 * Folded from `permissions.spec.ts`: the role matrix — landing route, sidebar
 * nav, route guards. Mirrors `src/lib/permissions.ts` (and its unit test,
 * `src/test/permissions.test.tsx`). Every approved role lands on `/`; a guarded
 * route redirects a denied role back to `/`.
 */
test.describe('Role matrix — landing, nav and guards (#1480)', () => {
  const roles: MatrixRole[] = ['community', 'student', 'trainee', 'fulltimer'];

  for (const role of roles) {
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
});

/**
 * Folded from the Student/Community halves of the retired feature specs and
 * `gatherings-attendance.spec.ts`. Serial: the steps share the one seeded
 * emulator database and read the same seeded contact.
 */
test.describe('Student and Community journey (#1480)', () => {
  test.describe.configure({ mode: 'serial' });

  test('a Student lands home, sees People and Gatherings, and reaches both', async ({ page }) => {
    await signInAs(page, 'student');

    // Their nav carries People (primary) and Gatherings (More menu).
    const labels = await visibleNavLabels(page);
    expect(labels.some((l) => l.includes('People'))).toBe(true);
    expect(labels.some((l) => l.includes('Gatherings'))).toBe(true);

    // People → the seeded contact is there.
    await page.goto('/directory');
    await waitForShell(page);
    expect(new URL(page.url()).pathname).toBe('/directory');
    await expect(page.getByRole('main').getByText(SEEDED_CONTACT).first()).toBeVisible({ timeout: 10_000 });

    // Gatherings → the page loads (no escape row; the retired spec only loaded it).
    await page.goto('/attendance');
    await waitForShell(page);
    expect(new URL(page.url()).pathname).toBe('/attendance');
    await expect(page.getByRole('heading', { level: 1, name: 'Gatherings' })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('body')).not.toContainText('Missing or insufficient permissions');
  });

  test('a Student opens a contact and reads the shared thread, not the team-confidential note', async ({ page }) => {
    await signInAs(page, 'student');
    await page.goto('/directory');
    await waitForShell(page);

    await page.getByRole('main').getByText(SEEDED_CONTACT).first().click();

    // The contact page is a route page in the shell's <main>, not a popup (#1560).
    const contactPage = page.getByRole('main');
    await expect(contactPage.getByRole('button', { name: `About ${SEEDED_CONTACT}` }).first()).toBeVisible({
      timeout: 5_000,
    });

    // Row 5 web analogue: a Student has no Full-timers switch and never sees the
    // team-confidential post — only the shared Conversation.
    await expect(contactPage.getByRole('button', { name: /^full-timers/i })).toHaveCount(0);
    await expect(contactPage.getByText(CONFIDENTIAL_NOTE)).toHaveCount(0);
    await expect(contactPage.getByText(SHARED_THREAD).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('body')).not.toContainText('Missing or insufficient permissions');
  });

  test('a Student gets the same row-action vocabulary on a contact', async ({ page }) => {
    await signInAs(page, 'student');
    await page.goto('/directory');
    await waitForShell(page);

    const moreBtn = page.getByRole('button', { name: /more for/i }).first();
    await expect(moreBtn).toBeVisible({ timeout: 5_000 });
    await moreBtn.click();
    await expect(page.getByRole('menuitem', { name: /open .*'s page/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /i followed up/i })).toBeVisible();
  });

  test('a Student opens Quick Capture from the People directory', async ({ page }) => {
    await signInAs(page, 'student');
    await page.goto('/directory');
    await waitForShell(page);

    await page.getByRole('button', { name: /add someone/i }).first().click();
    await expect(page.getByRole('heading', { name: /new contact/i })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByPlaceholder(/first name/i).first()).toBeVisible();
  });

  test('a Community member has no door to the contact directory — not People, not Gatherings (#950)', async ({ page }) => {
    await signInAs(page, 'community');

    // Nav: no People, no Gatherings.
    const labels = await visibleNavLabels(page);
    expect(labels.some((l) => l.includes('People'))).toBe(false);
    expect(labels.some((l) => l.includes('Gatherings'))).toBe(false);

    // Negative check: the seeded contact is outside the Community role's reach —
    // absent on the surfaces they can actually see.
    await expect(page.getByText(SEEDED_CONTACT)).toHaveCount(0);

    // The directory shares no door, straight (/directory) or sideways through
    // Gatherings (/attendance): both bounce home, still without the contact.
    for (const route of ['/directory', '/attendance']) {
      await expectRedirectedFrom(page, route, '/');
      await expect(page.getByText(SEEDED_CONTACT)).toHaveCount(0);
    }

    // No Quick Capture affordance either.
    await expect(page.getByRole('button', { name: /add someone/i })).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('Missing or insufficient permissions');
  });
});
