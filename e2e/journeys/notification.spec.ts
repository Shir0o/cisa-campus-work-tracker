/**
 * The notification journey (#1479).
 *
 * Only something addressed to you rings the bell (§28): an @mention raises one,
 * opening it lands on the Thread a reply answers, and a contact mention opens
 * the contact. A message without a mention raises nothing. It folds in
 * `notification-bell-deep-linking.spec.ts` (#682) and
 * `push-notifications.spec.ts`, both retired with this journey.
 *
 * Escape rows (docs/research/e2e-coverage-audit.md, research branch):
 *  - row 15 — a notification about a reply opened the stream, not its Thread
 *             (#1303). The stream rework moved replies into Threads; the link
 *             built by `threadNotificationLink` didn't follow, so a reply's bell
 *             entry pointed at `/people/:id?tab=thread` with no `parent`. The
 *             fix carries the parent message (`&parent={id}`), and `Stream`
 *             opens the Thread under it. Reverting 31b962c7 drops the parameter
 *             again, the pane opens the stream, and the `Thread` region never
 *             appears — the reply test below goes red. Row 16 (payload over
 *             4096 bytes) is a unit test on #1440, covered elsewhere.
 *
 * Serial: the reply test builds on the comment the full-timer posts first.
 */

import { test, expect, type Locator, type Page } from '@playwright/test';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { signInAs } from '../helpers/auth';
import { DEFAULT_CREDENTIALS, type Role } from '../helpers/auth-defaults';

const LILA = 'e2e-contact-lila';

async function waitForShell(page: Page) {
  await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });
}

/** The bell button and the panel it opens. */
async function openBell(page: Page) {
  const bell = page.getByRole('button', { name: /notification/i }).first();
  await expect(bell).toBeVisible({ timeout: 10_000 });
  await bell.click();
  const panel = page.getByRole('dialog', { name: 'Notifications' });
  await expect(panel).toBeVisible({ timeout: 5_000 });
  return panel;
}

/** The one row for `itemText`. The bell shows everything it receives, so each
 *  entry is its own row (cut-or-keep §28). */
async function notificationRow(panel: Locator, subject: RegExp, itemText: string) {
  const rowName = new RegExp(`^${subject.source}`);
  const target = panel.getByRole('button', { name: rowName }).filter({ hasText: itemText }).first();
  await expect(target).toBeVisible({ timeout: 15_000 });
  return target;
}

test.describe('Notification journey (#1479)', () => {
  test.describe.configure({ mode: 'serial' });

  const comment = `Coffee with Lila went well ${Date.now()}`;
  const reply = `Glad to hear it — let us follow up ${Date.now()}`;

  test('an @mention in a conversation raises a bell entry that opens the contact', async ({ browser }) => {
    // Full-timer writes a top-level message on Lila's Conversation and names the
    // Trainee. Only the mention is addressed to her, so it is the bell entry
    // (cut-or-keep §28). The writer is a separate context kept open: `signInAs`
    // reloads its page, and reloading before the fire-and-forget bell write
    // lands would drop it.
    const writer = await browser.newContext();
    const writerPage = await writer.newPage();
    await signInAs(writerPage, 'fulltimer');
    await writerPage.goto(`/people/${LILA}?tab=thread`);
    await waitForShell(writerPage);

    const box = writerPage.getByPlaceholder(/Write something…/).first();
    await expect(box).toBeVisible({ timeout: 15_000 });
    await box.fill(`${comment} @Zion`);
    await writerPage.getByRole('option', { name: /Zion Adeyemi/ }).click();
    await box.press('Meta+Enter');
    await expect(writerPage.locator('[data-stream-row]').getByText(comment)).toBeVisible({ timeout: 10_000 });

    // The trainee opens her bell; the mention's entry is there.
    const reader = await browser.newContext();
    const readerPage = await reader.newPage();
    await signInAs(readerPage, 'trainee');
    const panel = await openBell(readerPage);
    const item = await notificationRow(panel, /Full-timer mentioned you on Lila Chen/, comment);
    await item.click();

    // A contact notification opens the contact — the Conversation, not a Thread.
    await expect(readerPage.getByRole('button', { name: 'About Lila Chen' }).first()).toBeVisible({
      timeout: 10_000,
    });
    const conversation = readerPage.getByRole('region', { name: 'Conversation' });
    await expect(conversation).toBeVisible({ timeout: 10_000 });
    await expect(conversation.getByText(comment)).toBeVisible({ timeout: 10_000 });
    await expect(readerPage.getByRole('region', { name: 'Thread' })).toHaveCount(0);

    await writer.close();
    await reader.close();
  });

  test('an @mention in a reply raises a bell entry that opens its Thread (row 15)', async ({ browser }) => {
    // The trainee replies under the full-timer's message and names the
    // Full-timer. That mention's bell entry must open the Thread — not the
    // stream. Again the writer stays on its page so the bell write can land.
    const writer = await browser.newContext();
    const writerPage = await writer.newPage();
    await signInAs(writerPage, 'trainee');
    await writerPage.goto(`/people/${LILA}?tab=thread`);
    await waitForShell(writerPage);

    const row = writerPage.locator('[data-stream-row]').filter({ hasText: comment }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.hover();
    await row.getByRole('button', { name: 'Reply in thread' }).click();

    const thread = writerPage.getByRole('region', { name: 'Thread' });
    await expect(thread).toBeVisible({ timeout: 10_000 });
    await expect(thread.getByText(comment).first()).toBeVisible({ timeout: 10_000 });
    const replyBox = thread.locator('textarea').first();
    await replyBox.fill(`${reply} @Full`);
    await writerPage.getByRole('option', { name: /Full-timer Test User/ }).click();
    await replyBox.press('Meta+Enter');
    await expect(thread.getByText(reply).first()).toBeVisible({ timeout: 10_000 });

    // The full-timer opens the bell entry for that mention.
    const reader = await browser.newContext();
    const readerPage = await reader.newPage();
    await signInAs(readerPage, 'fulltimer');
    const panel = await openBell(readerPage);
    const item = await notificationRow(panel, /Zion mentioned you on Lila Chen/, reply);
    await item.click();

    // Row 15: opening it lands on the Thread, not the stream.
    await expect(readerPage).toHaveURL(/parent=/, { timeout: 10_000 });
    const threadPane = readerPage.getByRole('region', { name: 'Thread' });
    await expect(threadPane).toBeVisible({ timeout: 10_000 });
    await expect(threadPane.getByText(comment).first()).toBeVisible({ timeout: 10_000 });
    await expect(threadPane.getByText(reply).first()).toBeVisible({ timeout: 10_000 });
    // The stream is replaced: its composer is gone, only the reply box remains.
    await expect(readerPage.getByPlaceholder(/Write something…/)).toHaveCount(0);

    await writer.close();
    await reader.close();
  });

  test('a contact deep link opens the person and ?tab=thread opens their Conversation', async ({ page }) => {
    // Folded from `notification-bell-deep-linking.spec.ts` (#682).
    await signInAs(page, 'fulltimer');
    await page.goto(`/people/${LILA}`);
    await waitForShell(page);
    await expect(page.getByRole('button', { name: 'About Lila Chen' }).first()).toBeVisible({ timeout: 10_000 });

    await page.goto(`/people/${LILA}?tab=thread`);
    await expect(page.getByRole('button', { name: 'About Lila Chen' }).first()).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole('region', { name: 'Conversation' }).getByText('Great first connection with Lila. Let us follow up this week.'),
    ).toBeVisible({ timeout: 10_000 });
  });
});

/**
 * Folded from `push-notifications.spec.ts`: every bell entry reaches the
 * recipient's devices.
 *
 * Runs against the Functions emulator: the notification Cloud Function fires on
 * each new bell doc and, under the emulator, records what it would have sent in
 * `pushSink` instead of calling Expo or a browser push service. These tests
 * drive the real UI and assert that sink — so a writer that stops producing a
 * bell entry, a trigger that stops firing, or a recipient rule that drifts all
 * turn this suite red.
 */
const PRIYA = 'e2e-push-priya';

let db: Firestore;
const uid = {} as Record<Role, string>;

interface Push {
  uid: string;
  kind: 'expo' | 'web';
  title: string;
  body: string;
  link: string;
}

async function pushes(): Promise<Push[]> {
  const snap = await db.collection('pushSink').get();
  return snap.docs.map((d) => d.data() as Push);
}

/** Waits for the function to record a push to `who` whose title matches. */
async function expectPushTo(who: Role, title: RegExp) {
  await expect
    .poll(async () => (await pushes()).filter((p) => p.uid === uid[who] && title.test(p.title)).length, {
      timeout: 20_000,
      message: `a push to ${who} titled ${title}`,
    })
    .toBeGreaterThan(0);
}

async function openThread(page: Page, contactId: string) {
  await page.goto(`/people/${contactId}?tab=thread`);
  const box = page.getByPlaceholder('Write something…').first();
  await expect(box).toBeVisible({ timeout: 15_000 });
  return box;
}

test.describe('Notification journey — pushes reach every device (#1479)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    if (getApps().length === 0) initializeApp({ projectId: 'sac-campus-hub' });
    db = getFirestore();
    for (const role of ['fulltimer', 'trainee', 'trainee2'] as Role[]) {
      uid[role] = (await getAuth().getUserByEmail(DEFAULT_CREDENTIALS[role].email)).uid;
    }

    // Clean slate for the sink and the hourly coalescing window.
    for (const name of ['pushSink', 'pushThrottle']) {
      const snap = await db.collection(name).get();
      await Promise.all(snap.docs.map((d) => d.ref.delete()));
    }

    // A full-timer on a laptop browser and a phone; trainees on phones.
    const device = (role: Role, id: string, data: Record<string, unknown>) =>
      db.collection('users').doc(uid[role]).collection('pushDevices').doc(id).set({ ...data, updatedAt: new Date() });
    await device('fulltimer', 'web-e2e', {
      kind: 'web',
      endpoint: 'https://push.example/fulltimer',
      keys: { p256dh: 'p', auth: 'a' },
    });
    await device('fulltimer', 'expo-e2e', { kind: 'expo', token: 'ExponentPushToken[fulltimer]', platform: 'ios' });
    await device('trainee', 'expo-e2e', { kind: 'expo', token: 'ExponentPushToken[trainee]', platform: 'android' });
    await device('trainee2', 'expo-e2e', { kind: 'expo', token: 'ExponentPushToken[trainee2]', platform: 'ios' });

    const now = new Date().toISOString();
    // A person the trainee brought in.
    await db.collection('contacts').doc(PRIYA).set({
      name: 'Priya Push',
      email: '',
      stage: 'First Contact',
      createdBy: uid.trainee,
      createdByName: 'Zion Adeyemi',
      founders: [uid.trainee],
      visibleTo: [uid.trainee],
      createdAt: now,
      updatedAt: now,
    });
  });

  test('an @mention on a trainee\'s person buzzes the person named', async ({ page }) => {
    await signInAs(page, 'fulltimer');
    const box = await openThread(page, PRIYA);
    await box.fill('Looping in about Priya @Zion');
    await page.getByRole('option', { name: /Zion Adeyemi/ }).click();
    await box.press('Meta+Enter');

    await expectPushTo('trainee', /mentioned you on Priya Push/);
    const [p] = (await pushes()).filter((x) => x.uid === uid.trainee);
    expect(p.link).toBe(`/people/${PRIYA}?tab=thread`);
  });

  test('an announcement buzzes every other Full-timer and Trainee, and not the poster', async ({ page }) => {
    await signInAs(page, 'fulltimer');
    await page.goto('/');
    await waitForShell(page);
    const box = page.getByLabel('Post an announcement');
    await expect(box).toBeVisible({ timeout: 15_000 });
    await box.fill(`Gathering starts at 7pm ${Date.now()}`);
    await page.getByRole('button', { name: 'Post', exact: true }).click();

    await expectPushTo('trainee', /posted an announcement/);
    await expectPushTo('trainee2', /posted an announcement/);
    // The poster already knows: the bell entries are for everyone else.
    expect((await pushes()).filter((p) => p.uid === uid.fulltimer && /posted an announcement/.test(p.title))).toHaveLength(0);
  });

  test('a public sign-up reaches every full-timer device and no trainee', async ({ page, browser }) => {
    await page.goto('/signup');
    await expect(page.getByRole('heading', { name: 'Tell us about you.' })).toBeVisible({ timeout: 15_000 });
    await page.getByLabel('Full name').fill('Sam Signup');
    await page.getByRole('button', { name: 'Male', exact: true }).click();
    await page.getByRole('button', { name: 'Freshman', exact: true }).click();
    await page.getByLabel('Major').fill('Biology');
    await page.getByLabel('Cell number').fill('555-987-6543');
    await page.getByLabel('Email').fill(`sam.signup.${Date.now()}@example.com`);
    await page.getByRole('button', { name: 'Bible study', exact: true }).click();
    await page.getByRole('button', { name: 'Send it' }).click();
    await expect(page.getByRole('heading', { name: /Thank you for signing up, Sam\./ })).toBeVisible({ timeout: 10_000 });

    await expect
      .poll(async () =>
        (await pushes())
          .filter((p) => p.uid === uid.fulltimer && p.title === 'New Student Sign-up')
          .map((p) => p.kind)
          .sort(),
      { timeout: 20_000 })
      .toEqual(['expo', 'web']);
    expect(
      (await pushes()).filter((p) => p.title === 'New Student Sign-up' && p.uid !== uid.fulltimer),
    ).toHaveLength(0);

    // And the trainee's bell never shows it.
    const ctx = await browser.newContext();
    const trainee = await ctx.newPage();
    await signInAs(trainee, 'trainee');
    await trainee.getByRole('button', { name: /notifications/i }).first().click();
    await expect(trainee.getByText('New Student Sign-up')).toHaveCount(0);
    await ctx.close();
  });
});
