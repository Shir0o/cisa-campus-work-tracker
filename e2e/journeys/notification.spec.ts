/**
 * The notification journey (#1479).
 *
 * A reply in a stream raises a bell entry for the other user → opening it lands
 * on the Thread, not the stream → a contact notification opens the contact. It
 * folds in `notification-bell-deep-linking.spec.ts` (#682) and
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
 * Serial: the reply tests build on the comment the full-timer posts first.
 */

import { test, expect, type Locator, type Page } from '@playwright/test';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { signInAs } from '../helpers/auth';
import { DEFAULT_CREDENTIALS, type Role } from '../helpers/auth-defaults';

const LILA = 'e2e-contact-lila';
const CHAT_ROOM = 'e2e-dm-check-in';

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

/**
 * The notification row for `itemText`. When a later journey has raised a second
 * notification about the same person, the bell groups them under a collapsed
 * "N notifications on …" stack whose only control is its toggle, and the rows
 * are not in the DOM until it is opened. Expand it first, then take the row
 * itself — matching the stack toggle would just expand it and never navigate
 * (#1568).
 */
async function notificationRow(panel: Locator, subject: RegExp, itemText: string) {
  const rowName = new RegExp(`^${subject.source}`);
  const row = panel.getByRole('button', { name: rowName }).filter({ hasText: itemText }).first();
  // Only open the stack if the row is not already showing, so an expanded
  // stack is never toggled shut.
  if ((await row.count()) === 0) {
    const stack = panel.getByRole('button', { name: new RegExp(`notifications on ${subject.source}`) });
    if ((await stack.count()) > 0) await stack.first().click();
  }
  const target = panel.getByRole('button', { name: rowName }).filter({ hasText: itemText }).first();
  await expect(target).toBeVisible({ timeout: 15_000 });
  return target;
}

test.describe('Notification journey (#1479)', () => {
  test.describe.configure({ mode: 'serial' });

  const comment = `Coffee with Lila went well ${Date.now()}`;
  const reply = `Glad to hear it — let us follow up ${Date.now()}`;

  test('a comment on a person raises a bell entry that opens the contact', async ({ browser }) => {
    // Full-timer (a stakeholder) writes a top-level message on Lila's
    // Conversation. Trainee is the other stakeholder, so the bell entry is hers.
    // The writer is a separate context kept open: `signInAs` reloads its page,
    // and reloading before the fire-and-forget bell write lands would drop it.
    const writer = await browser.newContext();
    const writerPage = await writer.newPage();
    await signInAs(writerPage, 'fulltimer');
    await writerPage.goto(`/people/${LILA}?tab=thread`);
    await waitForShell(writerPage);

    const box = writerPage.getByPlaceholder(/Write something…/).first();
    await expect(box).toBeVisible({ timeout: 15_000 });
    await box.fill(comment);
    await box.press('Meta+Enter');
    await expect(writerPage.locator('[data-stream-row]').getByText(comment)).toBeVisible({ timeout: 10_000 });

    // The trainee opens her bell; the notification about the comment is there.
    const reader = await browser.newContext();
    const readerPage = await reader.newPage();
    await signInAs(readerPage, 'trainee');
    const panel = await openBell(readerPage);
    const item = await notificationRow(panel, /Full-timer commented on Lila Chen/, comment);
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

  test('a reply in the thread raises a bell entry that opens its Thread (row 15)', async ({ browser }) => {
    // The trainee replies under the full-timer's message. That reply notifies the
    // full-timer, whose bell entry must open the Thread — not the stream. Again
    // the writer stays on its page so the reply's bell write can land.
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
    await replyBox.fill(reply);
    await replyBox.press('Meta+Enter');
    await expect(thread.getByText(reply).first()).toBeVisible({ timeout: 10_000 });

    // The full-timer opens the bell entry for that reply.
    const reader = await browser.newContext();
    const readerPage = await reader.newPage();
    await signInAs(readerPage, 'fulltimer');
    const panel = await openBell(readerPage);
    const item = await notificationRow(panel, /Zion commented on Lila Chen/, reply);
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

  test('the Messages rail opens a room URL that direct-links back', async ({ page }) => {
    // Folded from `notification-bell-deep-linking.spec.ts` (#682).
    await signInAs(page, 'fulltimer');
    await page.goto('/messages');
    await waitForShell(page);

    const rail = page.locator('.msgs-list');
    await rail.getByText('Zion Adeyemi').first().click();
    await expect(page).toHaveURL(/\/messages\/[a-zA-Z0-9_-]+/);
    const url = page.url();

    // A direct link to the room URL reopens the same conversation.
    await page.goto(url);
    await expect(page.getByPlaceholder(/Write a message/)).toBeVisible({ timeout: 10_000 });
  });

  test('Questions for the team renders with its door', async ({ page }) => {
    // Folded from `notification-bell-deep-linking.spec.ts` (#682).
    await signInAs(page, 'fulltimer');
    await page.goto('/questions');
    await waitForShell(page);
    await expect(page.getByRole('heading', { name: 'Questions for the team' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Ask the team' })).toBeVisible();
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
const AROUND = 'e2e-push-around';

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
    // A person trainee2 brought in and the trainee cares for — the trainee is
    // tied only as a carer, which Around the team used to leave out (#1166).
    const around = db.collection('contacts').doc(AROUND);
    await around.set({
      name: 'Omar Around',
      email: '',
      stage: 'First Contact',
      createdBy: uid.trainee2,
      createdByName: 'Caleb Owusu',
      founders: [uid.trainee2],
      carers: [uid.trainee],
      visibleTo: [uid.trainee2, uid.trainee],
      createdAt: now,
      updatedAt: now,
    });
    await around.collection('interactions').doc('e2e-push-int').set({
      userId: uid.trainee2,
      userName: 'Caleb Owusu',
      content: 'Met Omar after the club fair; he wants to read together.',
      type: 'meetup',
      title: 'Club fair',
      createdAt: now,
      dateTime: now,
    });
  });

  test("a full-timer's comment on a trainee's person buzzes the trainee", async ({ page }) => {
    await signInAs(page, 'fulltimer');
    const box = await openThread(page, PRIYA);
    await box.fill('How did coffee with Priya go?');
    await box.press('Meta+Enter');

    await expectPushTo('trainee', /commented on Priya Push/);
    const [p] = (await pushes()).filter((x) => x.uid === uid.trainee);
    expect(p.link).toBe(`/people/${PRIYA}?tab=thread`);
  });

  test('an @mention always buzzes the person named, even inside the hourly window', async ({ page }) => {
    await signInAs(page, 'fulltimer');
    const box = await openThread(page, PRIYA);
    const traineeBellCount = async () =>
      (await db.collection('notifications').where('userId', '==', uid.trainee).get()).size;
    const traineeBellBefore = await traineeBellCount();
    await box.fill('Looping in @Cal');
    await page.getByRole('option', { name: /Caleb Owusu/ }).click();
    await box.press('Meta+Enter');

    await expectPushTo('trainee2', /mentioned you on Priya Push/);
    // The trainee already heard about Priya this hour: the bell gets this one,
    // the phone does not buzz again (#813 coalescing). Absence has no signal of
    // its own, so wait for the trainee's bell entry for this comment: its push
    // is dispatched alongside the mention's, which has already landed.
    await expect.poll(traineeBellCount, { timeout: 20_000 }).toBeGreaterThan(traineeBellBefore);
    expect((await pushes()).filter((p) => p.uid === uid.trainee)).toHaveLength(1);
  });

  test('a question from Around the team reaches every trainee tied to the person, carers included', async ({ page }) => {
    await signInAs(page, 'fulltimer');
    await page.goto('/around');
    const card = page
      .locator('div')
      .filter({ has: page.getByRole('button', { name: 'Omar Around' }) })
      .filter({ has: page.getByRole('button', { name: 'Comment' }) })
      .last();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.getByRole('button', { name: 'Comment' }).click();
    // One strip opens at a time, so its composer is the page's only one. The
    // box now carries a "Write a message" label, so target its placeholder.
    await page.getByRole('button', { name: 'Question', exact: true }).click();
    const box = page.getByPlaceholder(/What do you want to know/);
    await box.fill('Is Omar coming Thursday?');
    await page.getByRole('button', { name: 'Post' }).click();

    await expectPushTo('trainee2', /asked about Omar Around/);
    await expectPushTo('trainee', /asked about Omar Around/);
  });

  test('a chat message buzzes the other member', async ({ page }) => {
    await signInAs(page, 'fulltimer');
    await page.goto(`/messages/${CHAT_ROOM}`);
    const box = page.getByPlaceholder(/Write a message/);
    await expect(box).toBeVisible({ timeout: 15_000 });
    await box.fill('See you at the table at noon');
    await box.press('Meta+Enter');

    await expectPushTo('trainee', /New message/);
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
