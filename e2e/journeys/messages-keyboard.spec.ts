/**
 * The messages composer and the phone's soft keyboard (#1790).
 *
 * `index.html` asks for `interactive-widget=resizes-visual`, so an Android
 * keyboard shrinks the *visual* viewport while the layout viewport — and the
 * `h-[100dvh]` shell — keeps its full height. The composer used to sit at the
 * layout viewport's bottom, under the keyboard. The page now measures the
 * overlap the way the phone popup sheet does (#1444) and lifts the thread by
 * it, so the message stream shrinks instead of the composer hiding.
 *
 * The harness cannot raise a real keyboard, so this spec stands a stub in for
 * `window.visualViewport`: the same object the popup sheet's unit test uses
 * (`src/test/LogVisitModal.test.tsx`), with a reduced `height` and a `resize`.
 * What a human still has to confirm on a real Android device: that Chrome's
 * own `visualViewport` reports the same overlap while the keyboard animates,
 * and that the draft, attach and send are reachable one-handed.
 */

import { test, expect, type Page } from '@playwright/test';
import { signInAs } from '../helpers/auth';

const PHONE = { width: 375, height: 812 };
/** A typical Android keyboard: 332 of the 812px layout viewport. */
const KEYBOARD_PX = 332;

/** Replace `window.visualViewport` with a controllable stand-in, before the app
 *  loads, and expose `window.__raiseKeyboard` to simulate the keyboard. */
async function stubVisualViewport(page: Page) {
  await page.addInitScript(() => {
    const vv = Object.assign(new EventTarget(), {
      width: window.innerWidth,
      height: window.innerHeight,
      offsetTop: 0,
      offsetLeft: 0,
      pageTop: 0,
      pageLeft: 0,
      scale: 1,
    });
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
    (window as unknown as { __raiseKeyboard: (px: number) => void }).__raiseKeyboard = (px: number) => {
      vv.height = window.innerHeight - px;
      vv.dispatchEvent(new Event('resize'));
    };
  });
}

test.describe('Messages on a phone (#1790)', () => {
  test('the composer stays above the keyboard and the stream shrinks', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await stubVisualViewport(page);
    await signInAs(page, 'trainee');

    await page.goto('/messages');
    // The seeded direct conversation with the Full-timer.
    await page.locator('.msgs-item').filter({ hasText: 'Welcome aboard! Reply here any time.' }).click();

    const composer = page.locator('.msgs-thread [data-stream-composer]');
    const stream = page.locator('.msgs-thread [data-stream-list]');
    const draft = page.getByPlaceholder(/Write a message/i);
    await expect(draft).toBeVisible();
    await draft.fill('A draft the keyboard must not cover');
    await draft.click();

    // Before the keyboard: the composer is at the bottom of the phone screen.
    const streamBefore = await stream.boundingBox();
    const composerBefore = await composer.boundingBox();
    expect(streamBefore).not.toBeNull();
    expect(composerBefore).not.toBeNull();
    expect(Math.round(composerBefore!.y + composerBefore!.height)).toBeGreaterThanOrEqual(PHONE.height - 2);

    // Raise the stubbed keyboard.
    await page.evaluate((px) => (window as unknown as { __raiseKeyboard: (n: number) => void }).__raiseKeyboard(px), KEYBOARD_PX);
    const viewportBottom = PHONE.height - KEYBOARD_PX;

    // The composer's bottom edge is inside the visual viewport...
    await expect
      .poll(async () => {
        const box = await composer.boundingBox();
        return box ? Math.round(box.y + box.height) : Number.POSITIVE_INFINITY;
      })
      .toBeLessThanOrEqual(viewportBottom);
    // ...with the draft, attach and send all reachable above it.
    await expect(draft).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Attach' })).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Post', exact: true })).toBeInViewport();

    // The stream gave up the space rather than scrolling behind the keyboard.
    const streamAfter = await stream.boundingBox();
    expect(streamAfter).not.toBeNull();
    expect(Math.round(streamBefore!.height - streamAfter!.height)).toBeGreaterThanOrEqual(KEYBOARD_PX - 2);
    expect(Math.round(streamBefore!.height - streamAfter!.height)).toBeLessThanOrEqual(KEYBOARD_PX + 2);
  });
});
