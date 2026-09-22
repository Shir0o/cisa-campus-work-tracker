// Every bell entry reaches the recipient's devices (web, PWA, iOS, Android).
//
// Runs against the Functions emulator: the notification Cloud Function
// (firebase-functions/) fires on each new bell doc and, under the emulator,
// records what it would have sent in `pushSink` instead of calling Expo or a
// browser push service. These tests drive the real UI and assert that sink —
// so a writer that stops producing a bell entry, a trigger that stops firing,
// or a recipient rule that drifts all turn this suite red.
import { test, expect, type Page } from '@playwright/test';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { signInAs } from './helpers/auth';
import { DEFAULT_CREDENTIALS, type Role } from './helpers/auth-defaults';

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

test.describe('Push notifications reach every device (bell → function → devices)', () => {
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

  test('a full-timer\'s comment on a trainee\'s person buzzes the trainee', async ({ page }) => {
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
    await box.fill('Looping in @Cal');
    await page.getByRole('option', { name: /Caleb Owusu/ }).click();
    await box.press('Meta+Enter');

    await expectPushTo('trainee2', /mentioned you on Priya Push/);
    // The trainee already heard about Priya this hour: the bell gets this one,
    // the phone does not buzz again (#813 coalescing).
    await page.waitForTimeout(3_000);
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
    // One strip opens at a time, so its composer is the page's only one.
    await page.getByRole('button', { name: 'Question', exact: true }).click();
    const box = page.getByRole('textbox', { name: /What do you want to know/ });
    await box.fill('Is Omar coming Thursday?');
    await page.getByRole('button', { name: 'Post' }).click();

    await expectPushTo('trainee2', /asked about Omar Around/);
    await expectPushTo('trainee', /asked about Omar Around/);
  });

  test('a chat message buzzes the other member', async ({ page }) => {
    await signInAs(page, 'fulltimer');
    await page.goto('/messages/e2e-dm-check-in');
    const box = page.getByPlaceholder('Write a message… (@ to mention)');
    await expect(box).toBeVisible({ timeout: 15_000 });
    await box.fill('See you at the table at noon');
    await box.press('Meta+Enter');

    await expectPushTo('trainee', /New message/);
  });

  test('a public sign-up reaches every full-timer device and no trainee', async ({ page, browser }) => {
    await page.goto('/signup');
    await expect(page.getByRole('heading', { name: 'Tell us about you.' })).toBeVisible({ timeout: 15_000 });
    await page.locator('#signup-name').fill('Sam Signup');
    await page.getByRole('button', { name: 'Male', exact: true }).click();
    await page.getByRole('button', { name: 'Freshman', exact: true }).click();
    await page.locator('#signup-major').fill('Biology');
    await page.locator('#signup-phone').fill('555-987-6543');
    await page.locator('#signup-email').fill(`sam.signup.${Date.now()}@example.com`);
    await page.getByRole('button', { name: 'Bible study', exact: true }).click();
    await page.getByRole('button', { name: 'Send it' }).click();
    await expect(page.getByText(/Thank you for signing up, Sam\./)).toBeVisible({ timeout: 10_000 });

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
