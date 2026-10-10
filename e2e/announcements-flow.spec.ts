import { test, expect } from '@playwright/test';
import { signInAs } from './helpers/auth';

/**
 * E2E test suite for Announcements UI/UX rework (GitHub Issue #743).
 *
 * Exercises the user stories for both roles:
 *  - Full-timer (admin): Announcement creation wizard (audience preset -> compose -> review -> send),
 *    pinned announcement, broadcasting to all members, viewing read receipts.
 *  - Trainee (manager): Rail sectioning (Announcements separated from Conversations),
 *    post card presentation (Full-timer badge, acknowledgement "Got it"),
 *    guidance bar (top-level composer hidden for non-fulltimers), and thread replies.
 */
test.describe('Announcements UI/UX Rework (#743)', () => {
  test.describe.configure({ mode: 'serial' });

  const uniqueSuffix = Date.now();
  const announcementTitle = `Fall Campus Retreat ${uniqueSuffix}`;
  const announcementBody = `Important announcement regarding pickup times and packing list for the retreat. ${uniqueSuffix}`;
  const traineeReply = `Will there be van transport from the campus north gate? ${uniqueSuffix}`;

  test('Full-timer can create an announcement via 3-step wizard, broadcast to everyone, and pin it', async ({ page }) => {
    // 1. Sign in as Full-timer (admin)
    await signInAs(page, 'fulltimer');

    // 2. Navigate to Messages
    await page.goto('/messages');
    await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });

    // 3. Open New Chat modal
    const newChatBtn = page.getByRole('button', { name: /new/i }).first();
    await expect(newChatBtn).toBeVisible({ timeout: 10_000 });
    await newChatBtn.click();

    // 4. Switch to "Announcement" tab (User Stories 1, 4)
    const announceTab = page.getByRole('button', { name: /^announcement$/i });
    await expect(announceTab).toBeVisible({ timeout: 5_000 });
    await announceTab.click();

    // 5. Step 1: Channel Name & Audience Preset
    await page.getByLabel(/channel name/i).fill(announcementTitle);

    // Verify "Everyone in the app" preset is active by default (User Story 1, 2)
    await expect(page.getByText('Everyone in the app', { exact: true })).toBeVisible();

    // Click "Next" to go to Step 2
    const nextBtn = page.getByRole('button', { name: /^next$/i });
    await expect(nextBtn).toBeEnabled();
    await nextBtn.click();

    // 6. Step 2: Compose & Pin (User Stories 5, 11)
    await expect(page.getByPlaceholder(/write your announcement/i)).toBeVisible({ timeout: 5_000 });
    await page.getByPlaceholder(/write your announcement/i).fill(announcementBody);

    // Pin the announcement
    const pinBtn = page.getByRole('button', { name: /^pin it$/i });
    await pinBtn.click();

    // Click "Review" to go to Step 3 (User Stories 6, 8, 9)
    const reviewBtn = page.getByRole('button', { name: /^review$/i });
    await reviewBtn.click();

    // 7. Step 3: Review summary & Notification preview
    await expect(page.getByRole('heading', { name: /^review$/i })).toBeVisible();
    await expect(page.getByText(announcementTitle).first()).toBeVisible();
    await expect(page.getByText(/pinned/i).first()).toBeVisible();

    // Test back button preserves data (User Story 9)
    const backBtn = page.getByRole('button', { name: /^back$/i });
    await backBtn.click();
    await expect(page.getByPlaceholder(/write your announcement/i)).toHaveValue(announcementBody);
    await page.getByRole('button', { name: /^review$/i }).click();

    // 8. Send announcement
    const sendBtn = page.getByRole('button', { name: /send to/i });
    await expect(sendBtn).toBeEnabled();
    await sendBtn.click();

    // Modal closes upon successful creation
    await expect(page.getByRole('heading', { name: /review/i })).not.toBeVisible({ timeout: 10_000 });

    // 9. Verify channel opens in stream
    await expect(page.locator('.msgs-thread-title')).toContainText(announcementTitle, { timeout: 10_000 });

    // Verify top-level post card renders with Pinned strip & Full-timer badge
    await expect(page.locator('.strm-pinstrip')).toContainText('Pinned', { timeout: 10_000 });
    await expect(page.getByText('Full-timer').first()).toBeVisible();
    await expect(page.getByText(announcementBody).first()).toBeVisible();

    // Full-timer sees audience strip above composer (User Story 15)
    await expect(page.getByText(/posting to everyone on campus/i)).toBeVisible();
    await expect(page.getByPlaceholder(/write an announcement…/i)).toBeVisible();
  });

  test('Trainee sees Announcements in rail, post card presentation, guidance bar, and replies in thread', async ({ page }) => {
    // 1. Sign in as Trainee (manager role)
    await signInAs(page, 'trainee');

    // 2. Navigate to Messages
    await page.goto('/messages');
    await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });

    // 3. Verify Rail Sectioning: Announcements vs Conversations (User Story 20)
    await expect(page.locator('.sech').filter({ hasText: /announcements/i })).toBeVisible({ timeout: 10_000 });

    // 4. Verify the created announcement card is visible in the rail with snippet (User Story 21)
    const announceCard = page.locator('.anrow', { hasText: announcementTitle });
    await expect(announceCard).toBeVisible({ timeout: 10_000 });
    await expect(announceCard).toContainText('Important announcement regarding pickup times');

    // 5. Open the announcement room
    await announceCard.click();

    // 6. Verify Post Card layout (User Stories 24, 25, 38)
    const postCard = page.locator('.strm-flow [data-stream-row]', { hasText: announcementBody });
    await expect(postCard).toBeVisible({ timeout: 10_000 });
    await expect(postCard.locator('.strm-tag-role')).toContainText('Full-timer');
    await expect(page.locator('.strm-pinstrip')).toContainText('Pinned');

    // 7. Verify Guidance bar replaces the composer for non-admin Trainee (User Stories 36, 45)
    await expect(page.getByText(/only full-timers post here\. anyone can reply in a thread\./i)).toBeVisible();
    await expect(page.getByPlaceholder(/write an announcement/i)).toHaveCount(0);

    // 8. Test "Got it" acknowledgement toggle (User Stories 29, 30, 31)
    const ackBtn = postCard.getByRole('button', { name: /got it/i });
    await expect(ackBtn).toBeVisible();
    await expect(ackBtn).toContainText('Got it');

    // Click "Got it"
    await ackBtn.click();
    await expect(ackBtn).toHaveAttribute('aria-pressed', 'true', { timeout: 5_000 });

    // Click again to toggle off
    await ackBtn.click();
    await expect(ackBtn).toHaveAttribute('aria-pressed', 'false', { timeout: 5_000 });

    // Toggle back on
    await ackBtn.click();
    await expect(ackBtn).toHaveAttribute('aria-pressed', 'true', { timeout: 5_000 });

    // 9. Test Reply in Thread (User Stories 16, 32, 33, 34, 35)
    const threadReplyBtn = postCard.getByRole('button', { name: /reply in thread/i }).first();
    await expect(threadReplyBtn).toBeVisible();
    await threadReplyBtn.click();

    // Thread pane opens
    await expect(page.getByRole('region', { name: 'Thread' })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('region', { name: 'Thread' })).toContainText('Thread');

    // Trainee posts a reply in thread
    const threadComposer = page.getByRole('region', { name: 'Thread' }).locator('textarea');
    await expect(threadComposer).toBeVisible();
    await threadComposer.fill(traineeReply);
    await threadComposer.press('Meta+Enter');

    // Reply appears inside the thread pane (also still in the composer input, so
// target the posted bubble explicitly).
    await expect(page.getByRole('region', { name: 'Thread' }).getByText(traineeReply).first()).toBeVisible({ timeout: 10_000 });

    // Main stream post footer updates to show "1 reply"
    await expect(postCard.getByText('1 reply')).toBeVisible({ timeout: 10_000 });
  });

  test('Full-timer can view thread reply and inspect Read receipts modal', async ({ page }) => {
    // 1. Sign in as Full-timer
    await signInAs(page, 'fulltimer');

    // 2. Navigate to Messages and open the announcement channel
    await page.goto('/messages');
    await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });

    const announceCard = page.locator('.anrow', { hasText: announcementTitle });
    await expect(announceCard).toBeVisible({ timeout: 10_000 });
    await announceCard.click();

    const postCard = page.locator('.strm-flow [data-stream-row]', { hasText: announcementBody });
    await expect(postCard).toBeVisible({ timeout: 10_000 });

    // 3. Check thread replies count & open thread to read Trainee reply (User Stories 16, 18)
    await expect(postCard.getByText('1 reply')).toBeVisible({ timeout: 5_000 });
    await postCard.getByText('1 reply').click();

    await expect(page.getByRole('region', { name: 'Thread' })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('region', { name: 'Thread' }).getByText(traineeReply)).toBeVisible();

    // 4. Open Read receipts modal (User Stories 12, 13, 14)
    const readReceiptBtn = postCard.getByRole('button', { name: /read by/i });
    await expect(readReceiptBtn).toBeVisible();
    // The Trainee acknowledged in the earlier test, so the author's receipt
    // line counts it ("… said got it").
    await expect(readReceiptBtn).toContainText(/said got it/i);
    await readReceiptBtn.click();

    // Modal popup appears
    await expect(page.locator('.pophead .poptitle')).toContainText('Read receipts', { timeout: 5_000 });
    await expect(page.locator('.popsec').filter({ hasText: /^Read$/ })).toBeVisible();
    await expect(page.locator('.popsec').filter({ hasText: /^Not yet$/ })).toBeVisible();

    // The Trainee is listed in the receipts. The modal badges "Got it" only for
    // members who also hold a passive read receipt, and acknowledging does not
    // by itself record one — the acknowledgement is asserted on the receipt
    // line above instead.
    const readSection = page.locator('.pop');
    await expect(readSection.getByText('Zion Adeyemi')).toBeVisible();

    // Close Read receipts modal
    await page.getByRole('button', { name: /^close$/i }).click();
    await expect(page.locator('.pophead')).not.toBeVisible();
  });
});
