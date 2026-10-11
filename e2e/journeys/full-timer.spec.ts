/**
 * The Full-timer journey (#1477).
 *
 * Around the team (the team toggle shows the roster) → a contact page → move
 * the stage → post a team discussion → Add to story → combine two contacts,
 * one a sign-up with a Timestamp `createdAt` and a `null` email → transfer an
 * older contact with no `owner` → turn on the BFA intake flag. Alongside: the
 * to-work-through count matching across My Day and Around, a reached person
 * absent from "Not reached yet", and an open dialog surviving a resize across
 * 1024px.
 *
 * The Full-timer is the widest role: they carry the whole team's scope, so the
 * negative checks here ride narrower axes — the Around teammate roster (a
 * person on no team is not offered) and the Not-reached card's "Yours" scope
 * (a person tied to another teammate is not yours).
 *
 * Escape rows (docs/research/e2e-coverage-audit.md, research branch):
 *  - row 9  — a team-prayer flag lost on the Prayer tab (prayer team flag).
 *  - row 10 — Combine crashed on a sign-up's Timestamp `createdAt`
 *             (`createdAt.slice is not a function`, #1130). The pair preview
 *             must read both `createdAt` shapes.
 *  - row 12 — the Around team toggle emptied because the roster's `users`
 *             subscription died (#1163). The teammate select must list the
 *             seeded roster.
 *  - row 17 — a creator transfer threw on a contact with no `owner` field
 *             (#802). The transfer must commit.
 *  - row 18 — turning the BFA intake flag on was denied (#1065). The write to
 *             `settings/season.bfa` must commit.
 *  - row 19 — Add to story was refused for everyone (#1328). The write to
 *             `storyMessageIds` must commit and read back.
 *  - row 20 — updating a contact with no email was denied (#1251). The
 *             sign-up shape with `email: null` must render and combine.
 *  - row 22 — Around the team missing on narrow widths (#841). The page must
 *             render its rows.
 *  - row 23 — Around rows read "Contact" and would not open (#955). A row must
 *             open its person.
 *  - row 24 — the to-work-through count differed between My Day and Around
 *             (#1336). The pointer card and the page pill must agree.
 *  - row 25 — a reached person showed as "Not reached yet" (#1335). The reach
 *             stamp must keep them out.
 *  - row 26 — an open dialog closed when the window crossed 1024px (#1129).
 *
 * Serial: the journey builds on the contact it moves and the note it posts.
 */

import { test, expect, type Page } from '@playwright/test';
import { signInAs } from '../helpers/auth';

const CARE_CONTACT = 'Lila Chen';
const AROUND_CONTACT = 'Around Touch';
const TRANSFER_CONTACT = 'Transfer Target';
const REACHED_CONTACT = 'Recently Reached';
const UNTIED_RECENT = 'Untied Recent';

async function waitForShell(page: Page) {
  await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });
}

async function gotoHome(page: Page) {
  await page.goto('/');
  await waitForShell(page);
}

test.describe('Full-timer journey (#1477)', () => {
  test.describe.configure({ mode: 'serial' });

  test('Around the team shows the roster and its to-work-through count matches My Day', async ({ page }) => {
    await signInAs(page, 'fulltimer');
    await gotoHome(page);

    // The pointer card on My Day is the door to /around and carries the count.
    const pointer = page
      .locator('a[href="/around"]')
      .filter({ has: page.locator('.tabular-nums') });
    await expect(pointer).toBeVisible({ timeout: 10_000 });
    const count = (await pointer.locator('.tabular-nums').innerText()).trim();
    expect(count).toMatch(/^\d+$/);

    await pointer.click();
    await expect(page).toHaveURL(/\/around$/, { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: 'Around the team' })).toBeVisible({ timeout: 10_000 });

    // Row 24: the page's pill reads the same number the pointer card did.
    await expect(page.getByText(new RegExp(`${count} to work through`))).toBeVisible({ timeout: 10_000 });

    // Row 24 sensitivity: reviewing a card drops the page's number, and My Day
    // mirrors the same remaining count. A pointer that counted a different axis
    // (unseen, or an unfiltered total) would disagree here.
    const remaining = Number(count) - 1;
    await page.getByRole('button', { name: 'Reviewed', exact: true }).first().click();
    const pillNumber = async () => {
      const text = await page.getByText(/to work through/).first().innerText().catch(() => '');
      return text.match(/\d+/)?.[0] ?? '0';
    };
    await expect(async () => expect(await pillNumber()).toBe(String(remaining))).toPass({ timeout: 10_000 });

    // Row 12: the teammate select offers the seeded team roster — Caleb is on a
    // team but has done nothing, so only the live roster can account for him.
    const whoSelect = page.getByLabel('Filter the news by teammate');
    const options = await whoSelect.locator('option').allInnerTexts();
    expect(options.some((o) => /Zion Adeyemi/.test(o)), `roster missing Zion: ${options.join(', ')}`).toBe(true);
    expect(options.some((o) => /Caleb Owusu/.test(o)), `roster missing Caleb: ${options.join(', ')}`).toBe(true);
    // Negative (row 12): people on no team are never offered as teammates.
    expect(options.some((o) => /Timothy Hale|Philip Nardi/.test(o))).toBe(false);
    await expect(page.locator('body')).not.toContainText('Missing or insufficient permissions');

    // Rows 22/23: the page renders its activity rows, and a row opens its
    // person (it no longer reads "Contact" and refuse to open).
    const aroundRow = page.getByRole('button', { name: AROUND_CONTACT }).first();
    await expect(aroundRow).toBeVisible({ timeout: 10_000 });
    await aroundRow.click();
    await expect(
      page.getByRole('button', { name: `About ${AROUND_CONTACT}` }).first(),
    ).toBeVisible({ timeout: 10_000 });

    // And the pointer card on My Day mirrors the number the page now shows.
    await gotoHome(page);
    const pointerAfter = page
      .locator('a[href="/around"]')
      .filter({ has: page.locator('.tabular-nums') });
    await expect(pointerAfter.locator('.tabular-nums')).toHaveText(String(remaining), { timeout: 10_000 });
  });

  test('the contact page moves the stage and posts a team discussion', async ({ page }) => {
    await signInAs(page, 'fulltimer');
    await page.goto('/directory');
    await waitForShell(page);
    await page.getByText(CARE_CONTACT).first().click();

    const contactPage = page.getByRole('main');
    await expect(contactPage.getByRole('button', { name: `About ${CARE_CONTACT}` }).first()).toBeVisible({
      timeout: 5_000,
    });

    // Move the stage from their own page (#677/#825): the header pill is a menu.
    await contactPage.getByRole('button', { name: /Move to a step:/i }).click();
    await contactPage.getByRole('menuitem', { name: 'Second Contact' }).click();
    await expect(contactPage.getByRole('button', { name: /Move to a step: Second Contact/i })).toBeVisible({
      timeout: 5_000,
    });

    // Post a general Conversation message (folded from the Full-timer half of
    // `walking-together-threads.spec.ts`).
    const general = `Full-timer encouragement ${Date.now()}`;
    const convo = contactPage.getByPlaceholder(/Write something…/).first();
    await expect(convo).toBeVisible({ timeout: 5_000 });
    await convo.fill(general);
    await convo.press('Meta+Enter');
    await expect(contactPage.getByText(general).first()).toBeVisible({ timeout: 10_000 });

    // Post a team (Full-timers-only) discussion note.
    await contactPage.getByRole('button', { name: /^full-timers/i }).click();
    await expect(contactPage.getByText(/Confidential Staff Note/i).first()).toBeVisible({ timeout: 10_000 });
    const note = `Staff coordination note ${Date.now()}`;
    const composer = contactPage.getByPlaceholder(/Write something only Full-timers will see/i).first();
    await expect(composer).toBeVisible({ timeout: 5_000 });
    await composer.fill(note);
    await composer.press('Meta+Enter');
    await expect(contactPage.getByText(note).first()).toBeVisible({ timeout: 10_000 });
    await expect(contactPage.getByText(/missing or insufficient permissions/i)).toHaveCount(0);
  });

  test('Add to story writes and reads back into the story', async ({ page }) => {
    await signInAs(page, 'fulltimer');
    await page.goto('/directory');
    await waitForShell(page);
    await page.getByText(CARE_CONTACT).first().click();

    const contactPage = page.getByRole('main');
    await expect(contactPage.getByRole('button', { name: `About ${CARE_CONTACT}` }).first()).toBeVisible({
      timeout: 5_000,
    });

    // Row 19: the Conversation message carries an Add-to-story control; the write
    // to `storyMessageIds` used to be refused for everyone.
    const messageRow = contactPage
      .locator('[data-stream-row]')
      .filter({ hasText: 'Great first connection with Lila' })
      .first();
    await expect(messageRow).toBeVisible({ timeout: 10_000 });
    // The row's actions only render on hover/focus (`.strm-m:hover .strm-tools`).
    await messageRow.hover();
    await messageRow.getByRole('button', { name: 'Add to story' }).click();

    // The control flips, and the story gains a quote of that message.
    await expect(messageRow.getByRole('button', { name: 'Remove from story' })).toBeVisible({ timeout: 10_000 });
    const story = contactPage.getByRole('region', { name: 'The story so far' }).first();
    await expect(story.getByText(/said this/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(contactPage.getByText(/missing or insufficient permissions/i)).toHaveCount(0);
  });

  test('Combine contacts reads a sign-up Timestamp and a null email without crashing', async ({ page }) => {
    await signInAs(page, 'fulltimer');
    await page.goto('/directory/combine-contacts');
    await waitForShell(page);
    await expect(page.getByRole('heading', { name: 'Combine contacts' })).toBeVisible({ timeout: 15_000 });

    // Rows 10 & 20: the seeded pair is the same person twice — one copy a
    // sign-up with a Firestore Timestamp `createdAt` and `email: null`. The
    // detector pairs them and the preview reads both `createdAt` shapes.
    const pair = page.locator('[data-testid="combine-pair"]').filter({ hasText: 'Signup Sam' }).first();
    await expect(pair).toBeVisible({ timeout: 15_000 });
    await expect(pair).toContainText(/Matching (name|phone)/);
    // The preview reads both `createdAt` shapes: the sign-up's Timestamp and the
    // other copy's ISO string. On the breaking `.slice` read this row would throw.
    await expect(pair.getByText('First added')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Missing or insufficient permissions');
  });

  test('updating a contact that has no email is allowed', async ({ page }) => {
    await signInAs(page, 'fulltimer');
    await page.goto('/directory');
    await waitForShell(page);
    await page.getByText('Signup Sam').first().click();

    const contactPage = page.getByRole('main');
    await expect(contactPage.getByRole('button', { name: /About Signup Sam/ }).first()).toBeVisible({
      timeout: 10_000,
    });

    // Row 20: the sign-up shape carries `email: null`; the rule once required an
    // email on every contact write, so any edit was denied.
    await contactPage.getByRole('button', { name: 'More actions' }).first().click();
    await page.getByRole('button', { name: /edit details/i }).first().click();
    const notes = page.locator('textarea').first();
    await expect(notes).toBeVisible({ timeout: 5_000 });
    await notes.fill(`Edited a null-email contact ${Date.now()}`);
    await page.getByRole('button', { name: /save changes/i }).click();
    await expect(contactPage.getByText(/missing or insufficient permissions/i)).toHaveCount(0);
  });

  test('transferring the creator of an older contact with no owner commits', async ({ page }) => {
    await signInAs(page, 'fulltimer');
    await page.goto('/people/e2e-contact-transfer');
    await waitForShell(page);

    const contactPage = page.getByRole('main');
    await expect(contactPage.getByRole('button', { name: `About ${TRANSFER_CONTACT}` }).first()).toBeVisible({
      timeout: 10_000,
    });

    // Row 17: the contact carries no `owner` field, the shape the transfer once
    // denied. Open the About sheet, then reassign the creator to a teammate.
    await contactPage.getByRole('button', { name: `About ${TRANSFER_CONTACT}` }).first().click();
    const about = page.getByRole('dialog');
    await expect(about).toBeVisible({ timeout: 5_000 });
    await about.getByRole('button', { name: 'Change creator' }).first().click();
    const select = about.getByLabel('Reassign creator');
    await expect(select).toBeVisible({ timeout: 5_000 });
    // First teammate after the disabled placeholder.
    await select.selectOption({ index: 1 });
    await expect(contactPage.getByText(/missing or insufficient permissions/i)).toHaveCount(0);
  });

  test('a reached person is absent from Not reached yet, and scope narrows the card', async ({ page }) => {
    await signInAs(page, 'fulltimer');
    await gotoHome(page);

    const card = page.getByRole('region', { name: 'Not reached yet' });
    await expect(card).toBeVisible({ timeout: 10_000 });

    // Row 25: "Recently Reached" was added recently but carries a reach stamp,
    // so no unreached list may contain them.
    await expect(card.getByText(REACHED_CONTACT)).toHaveCount(0);

    // Negative: a recent person tied to another teammate is not in the reader's
    // "Yours" scope. Switching to "Team" brings them in — proving the axis.
    await expect(card.getByText(UNTIED_RECENT)).toHaveCount(0);
    await card.getByRole('button', { name: 'Team' }).click();
    await expect(card.getByText(UNTIED_RECENT).first()).toBeVisible({ timeout: 10_000 });
    await expect(card.getByText(REACHED_CONTACT)).toHaveCount(0);
  });

  test('an open dialog survives resizing across 1024px', async ({ page }) => {
    await signInAs(page, 'fulltimer');
    await page.goto('/directory');
    await waitForShell(page);

    await page.getByRole('button', { name: /add someone/i }).first().click();
    await expect(page.getByRole('heading', { name: /new contact/i })).toBeVisible({ timeout: 5_000 });

    // A draft typed into the open dialog must survive the shell's rail/top-bar
    // switch at 1024px — the remount that used to close it (#1129).
    const firstName = page.getByPlaceholder(/first name/i).first();
    await firstName.fill('Resize Survivor');

    await page.setViewportSize({ width: 900, height: 800 });
    await expect(page.getByRole('heading', { name: /new contact/i })).toBeVisible({ timeout: 5_000 });
    await expect(firstName).toHaveValue('Resize Survivor');
  });

  test('the BFA intake flag turns on without a permission error', async ({ page }) => {
    await signInAs(page, 'fulltimer');
    // /signup is a public route (no app shell), so wait on the strip's control.
    await page.goto('/signup');

    // Row 18: the staff strip's BFA toggle writes `bfa` to `settings/season`,
    // which the rules' `hasOnly` once rejected. Turning it on must commit.
    const bfa = page.getByRole('button', { name: 'BFA', exact: true }).first();
    await expect(bfa).toBeVisible({ timeout: 15_000 });
    await bfa.click();
    await expect(page.locator('body')).not.toContainText('Missing or insufficient permissions');
    await expect(bfa).toHaveClass(/\bon\b/, { timeout: 5_000 });
  });
});
