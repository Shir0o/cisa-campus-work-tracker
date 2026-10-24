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
 *
 * This file also absorbs the retired feature specs (the Full-timer is the widest
 * role, so the admin-driven surfaces live here): `settings-and-partners.spec.ts`,
 * `people-directory.spec.ts`, `prayer-carrying.spec.ts`, `announcements-flow.spec.ts`,
 * `asks-questions-for-team.spec.ts`, `feedback-submission.spec.ts`, and the
 * Full-timer halves of `cross-role-journey.spec.ts` and `quick-capture.spec.ts`.
 */

import { test, expect, type Page } from '@playwright/test';
import { signInAs } from '../helpers/auth';
import { initializeApp, getApps } from 'firebase-admin';
import { getFirestore as adminFS } from 'firebase-admin/firestore';

const CARE_CONTACT = 'Lila Chen';
const CARE_ID = 'e2e-contact-lila';
const AROUND_CONTACT = 'Around Touch';
const TRANSFER_CONTACT = 'Transfer Target';
const REACHED_CONTACT = 'Recently Reached';
const UNTIED_RECENT = 'Untied Recent';
const HELD_CONTACT = 'Held Burden';

async function waitForShell(page: Page) {
  await page.waitForSelector('[aria-label="Main Navigation"]', { timeout: 15_000 });
}

async function gotoHome(page: Page) {
  await page.goto('/');
  await waitForShell(page);
}

/**
 * The browser SDK writes optimistically, so a fresh page's own query can miss a
 * just-written doc that the emulator has not durably accepted yet. Poll the
 * emulator directly (the `emulators:exec` child has the admin SDK pointed at
 * it) before reading the write back on another page.
 */
async function waitForDurablePrayer(burden: string) {
  await expect(async () => {
    if (getApps().length === 0) initializeApp({ projectId: 'sac-campus-hub' });
    const snap = await adminFS().collection('prayers').where('burden', '==', burden).get();
    expect(snap.size).toBeGreaterThan(0);
  }).toPass({ timeout: 15_000 });
}

/** The contact write behind a team-list removal (or its Undo) is optimistic in
 *  the browser, so poll the emulator for the field before a reload reads it. */
async function waitForContactRemoval(removed: boolean) {
  await expect(async () => {
    if (getApps().length === 0) initializeApp({ projectId: 'sac-campus-hub' });
    const snap = await adminFS().collection('contacts').doc('e2e-contact-held').get();
    expect(!!snap.data()?.prayerListRemoved).toBe(removed);
  }).toPass({ timeout: 15_000 });
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
    await expect(page.getByRole('main').getByText(new RegExp(`${count} to work through`))).toBeVisible({ timeout: 10_000 });

    // Row 24 sensitivity: reviewing a card drops the page's number, and My Day
    // mirrors the same remaining count. A pointer that counted a different axis
    // (unseen, or an unfiltered total) would disagree here.
    const remaining = Number(count) - 1;
    await page.getByRole('button', { name: 'Reviewed', exact: true }).first().click();
    const pillNumber = async () => {
      const text = await page.getByRole('main').getByText(/to work through/).innerText().catch(() => '');
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

  test('the contact page moves the stage and posts a team discussion (#1627, #1666, #1671)', async ({ page }) => {
    await signInAs(page, 'fulltimer');
    await page.goto('/directory');
    await waitForShell(page);
    await page.getByRole('main').getByText(CARE_CONTACT).click();

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
    // The composer's one shared "Post" control enables off the draft state;
    // wait for it before ⌘↵ so the command registry (whose handler refreshes in
    // a passive effect) is dispatching the closure that owns this text (#1568).
    await expect(contactPage.getByRole('button', { name: 'Post', exact: true })).toBeEnabled();
    await convo.press('Meta+Enter');
    // The composer clears only once the write resolves; the clear confirms the
    // post landed before the next one goes into the same shared box.
    await expect(convo).toHaveValue('', { timeout: 10_000 });

    // Post a team (Full-timers-only) discussion note.
    await contactPage.getByRole('button', { name: /^full-timers/i }).click();
    await expect(contactPage.getByText(/Confidential Staff Note/i).first()).toBeVisible({ timeout: 10_000 });
    const note = `Staff coordination note ${Date.now()}`;
    const composer = contactPage.getByPlaceholder(/Write something only Full-timers will see/i).first();
    await expect(composer).toBeVisible({ timeout: 5_000 });
    await composer.fill(note);
    await expect(contactPage.getByRole('button', { name: 'Post', exact: true })).toBeEnabled();
    await composer.press('Meta+Enter');
    await expect(contactPage.getByText(note).first()).toBeVisible({ timeout: 10_000 });
    await expect(contactPage.getByText(/missing or insufficient permissions/i)).toHaveCount(0);

    // #1627: the viewer's own team note never raises the unread dot. Switching
    // the pane back to Conversation shows no dot on the Full-timers tab (nor on
    // the header's Conversation button), matching the stream's own-messages-are-
    // read rule.
    await contactPage
      .getByRole('group', { name: 'Which Conversation' })
      .getByRole('button', { name: /^Conversation/ })
      .click();
    await expect(contactPage.locator('[aria-label="New in Full-timers"]')).toHaveCount(0);

    // #1671: Delegate is not a header button — it opens from More actions.
    await expect(contactPage.getByRole('button', { name: 'Delegate' })).toHaveCount(0);
    // The stream's per-message toolbars are "More actions" too, and they are in
    // the accessibility tree now that a tap (not just hover) reveals them
    // (#1764) — the page's own header button comes first in the DOM.
    await contactPage.getByRole('button', { name: 'More actions' }).first().click();
    await contactPage.getByRole('button', { name: 'Delegate' }).click();
    const delegateSheet = page.getByRole('dialog', { name: /Delegate Lila Chen/i });
    await expect(delegateSheet).toBeVisible({ timeout: 5_000 });
    await delegateSheet.getByRole('button', { name: 'Cancel' }).click();
    await expect(delegateSheet).toBeHidden({ timeout: 5_000 });

    // #1666: "Edit details" is a header action, not something buried in the
    // overflow menu. It stays the only instance while the menu is open.
    await expect(contactPage.getByRole('button', { name: 'Edit details' })).toBeVisible();
    await contactPage.getByRole('button', { name: 'More actions' }).first().click();
    await expect(contactPage.getByText('Log interaction')).toBeVisible();
    await expect(contactPage.getByRole('button', { name: 'Edit details' })).toHaveCount(1);
  });

  test('Add to story writes and reads back into the story', async ({ page }) => {
    await signInAs(page, 'fulltimer');
    await page.goto('/directory');
    await waitForShell(page);
    await page.getByRole('main').getByText(CARE_CONTACT).click();

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
    // Two seeded copies of Sam (the combine pair), so two rows are expected.
    await page.getByRole('main').getByText('Signup Sam').first().click();

    const contactPage = page.getByRole('main');
    await expect(contactPage.getByRole('button', { name: /About Signup Sam/ }).first()).toBeVisible({
      timeout: 10_000,
    });

    // Row 20: the sign-up shape carries `email: null`; the rule once required an
    // email on every contact write, so any edit was denied.
    // #1666: Edit is a header action, not a More-actions item.
    await contactPage.getByRole('button', { name: 'Edit details' }).first().click();
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

/**
 * Escape row 9 (#1042, #1406): a burden typed on a contact's Prayer composer
 * belongs to that contact. The write carries `teamPrayer: false`, and
 * `isTeamPrayer` reads a MISSING flag as the team's, so dropping that field
 * wrongly surfaces the person on "On our hearts" — the exact escape.
 */
test.describe('Full-timer journey — a private burden stays off On our hearts (#1477)', () => {
  test('a prayer typed on a contact does not put the person on On our hearts', async ({ page }) => {
    await signInAs(page, 'fulltimer');

    // Positive control: a seeded team prayer (`teamPrayer: true`) keeps its
    // person here, so an empty page cannot make the negative below pass.
    await page.goto('/prayer');
    await waitForShell(page);
    await expect(page.getByRole('heading', { name: 'On our hearts' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('main').getByText(HELD_CONTACT)).toBeVisible({ timeout: 15_000 });

    // Row 9: type the burden on the contact's own Prayer composer.
    const burden = `Kept between us ${Date.now()}`;
    await page.goto(`/people/${CARE_ID}`);
    await waitForShell(page);
    const story = page.getByRole('region', { name: 'The story so far' }).first();
    await expect(story).toBeVisible({ timeout: 10_000 });
    await story.getByRole('button', { name: 'Prayer', exact: true }).click();
    const box = story.getByPlaceholder(/what are we praying for/i).first();
    await expect(box).toBeVisible({ timeout: 5_000 });
    await box.fill(burden);
    await story.getByRole('button', { name: 'Add prayer' }).click();
    await expect(story.getByText(burden).first()).toBeVisible({ timeout: 10_000 });
    await waitForDurablePrayer(burden);

    // It belongs to the contact, so the person never reaches the team page.
    await page.goto('/prayer');
    await waitForShell(page);
    await expect(page.getByRole('main').getByText(HELD_CONTACT)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(CARE_CONTACT)).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('Missing or insufficient permissions');
  });
});

/**
 * #1692: "On our hearts" is the team's list, so taking someone off it is a
 * write on the shared contact, not a per-browser hide. A reload proves the
 * difference: the local set would have been cleared with the page's storage,
 * while the contact field survives and keeps the person off for everyone.
 */
test.describe('Full-timer journey — a removal belongs to the team (#1692)', () => {
  test('removing a person survives a reload, and adding them back clears it', async ({ page }) => {
    await signInAs(page, 'fulltimer');
    await page.goto('/prayer');
    await waitForShell(page);
    await expect(page.getByRole('heading', { name: 'On our hearts' })).toBeVisible({ timeout: 15_000 });

    const main = page.getByRole('main');
    await expect(main.getByText(HELD_CONTACT)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Everyone on the team sees this list.')).toBeVisible();

    await page.getByRole('button', { name: `More for ${HELD_CONTACT}` }).click();
    await page.getByRole('menuitem', { name: /Remove Held from prayer list/ }).click();
    await expect(page.getByText("Removed Held from the team's prayer list")).toBeVisible({
      timeout: 10_000,
    });
    await expect(main.getByText(HELD_CONTACT)).toHaveCount(0, { timeout: 10_000 });

    // The bar and the row move optimistically; wait for the emulator to hold
    // the write before a reload reads the doc back from it.
    await waitForContactRemoval(true);

    await page.reload();
    await waitForShell(page);
    await expect(main.getByText(HELD_CONTACT)).toHaveCount(0, { timeout: 15_000 });

    // "Choose people" is the way back: the team burden clears the removal.
    await page.getByRole('button', { name: 'Choose people' }).click();
    const picker = page.getByRole('dialog');
    await picker.getByRole('button', { name: new RegExp(HELD_CONTACT) }).click();
    await picker.getByRole('button', { name: 'Done' }).click();
    // The picker stays up while its batch commits; wait for it to close before
    // reading the page, or its own row shadows the card.
    await expect(picker).toBeHidden({ timeout: 15_000 });
    await expect(main.getByText(HELD_CONTACT)).toBeVisible({ timeout: 15_000 });
    await waitForContactRemoval(false);

    await page.reload();
    await waitForShell(page);
    await expect(main.getByText(HELD_CONTACT)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('body')).not.toContainText('Missing or insufficient permissions');
  });
});

/**
 * Folded from `settings-and-partners.spec.ts` (#629). The Full-timer's admin
 * Settings surface and the role gate that keeps everyone else off it.
 */
test.describe('Full-timer journey — Settings and the role gate (#1477)', () => {
  test('the Full-timer manages partners, the day goal, and roles in Settings', async ({ page }) => {
    await signInAs(page, 'fulltimer');
    await page.goto('/settings');
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible({ timeout: 15_000 });

    for (const section of ['Your team', 'Going out together', "The day's goal", 'Roles & access']) {
      await expect(page.getByRole('heading', { level: 2, name: section })).toBeVisible();
    }

    // Gospel partner assignment: pair two seeded trainees, then unpair them.
    await page.getByRole('button', { name: /Two trainees going out together/i }).click();
    await expect(page.getByRole('main').getByText("Who's the first of the two?")).toBeVisible();
    await page.getByRole('button', { name: /Zion Adeyemi/i }).first().click();
    await expect(page.getByRole('main').getByText(/Who goes out with/i)).toBeVisible();
    await page.getByRole('button', { name: /Caleb Owusu/i }).first().click();
    await expect(page.getByRole('main').getByText('Zion Adeyemi and Caleb Owusu')).toBeVisible({ timeout: 5_000 });
    // End the pairing again (the card's End -> End pairing confirm).
    await page.getByRole('button', { name: /^End$/ }).first().click();
    await page.getByRole('button', { name: /^End pairing$/ }).click();

    // The day's goal switch round-trips.
    const goalToggle = page.getByRole('switch', { name: /give the day a goal/i });
    await expect(goalToggle).toBeVisible();
    const before = await goalToggle.getAttribute('aria-checked');
    await goalToggle.click();
    await expect(goalToggle).toHaveAttribute('aria-checked', before === 'true' ? 'false' : 'true');
    await goalToggle.click();

    // Inviting a teammate offers the Full-timer role.
    await page.getByRole('button', { name: /Add someone/i }).click();
    await expect(page.getByRole('main').getByText('Add someone by email')).toBeVisible();
    const roleOptions = await page.getByLabel('Role').locator('option').allInnerTexts();
    expect(roleOptions).toContain('Full-timer');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Add someone by email')).not.toBeVisible();
  });

  test('a Trainee is redirected off /settings and its admin sections', async ({ page }) => {
    await signInAs(page, 'trainee');
    await page.goto('/settings');
    await page.getByLabel('Main Navigation').waitFor({ state: 'visible', timeout: 20_000 });
    expect(new URL(page.url()).pathname).toBe('/');
    await expect(page.getByRole('heading', { level: 2, name: 'Going out together' })).not.toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: "The day's goal" })).not.toBeVisible();
  });

  test('Student and Community see only their profile in Settings', async ({ page }) => {
    for (const role of ['student', 'community'] as const) {
      await signInAs(page, role);
      await page.goto('/settings');
      await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole('main').getByText('Your account and preferences.')).toBeVisible();
      await expect(page.getByText('Your team')).not.toBeVisible();
      await expect(page.getByText('Going out together')).not.toBeVisible();
      await expect(page.getByText("The day's goal")).not.toBeVisible();
    }
  });
});

/**
 * Folded from `people-directory.spec.ts` and `prayer-carrying.spec.ts`. The
 * Trainee's Directory is already asserted in the Trainee journey (#1475); these
 * are the remaining role-access checks (Student Directory, and the prayer wall
 * for the non-carer roles).
 */
test.describe('Full-timer journey — Directory and On our hearts per role (#1477)', () => {
  test('the Directory opens for the Student and Trainee roles', async ({ page }) => {
    for (const role of ['trainee', 'student'] as const) {
      await signInAs(page, role);
      await page.goto('/directory');
      await waitForShell(page);
      expect(new URL(page.url()).pathname).toBe('/directory');
    }
  });

  test('On our hearts opens for the full-timer, Student and Community roles', async ({ page }) => {
    for (const role of ['fulltimer', 'student', 'community'] as const) {
      await signInAs(page, role);
      await page.goto('/prayer');
      await waitForShell(page);
      expect(new URL(page.url()).pathname).toBe('/prayer');
      await expect(page.getByRole('heading', { name: 'On our hearts' })).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('body')).not.toContainText('Missing or insufficient permissions');
    }
  });
});

/**
 * Folded from `announcements-flow.spec.ts` (#743): the Full-timer's broadcast
 * wizard, the Trainee's acknowledgement and thread reply, and the author's read
 * receipts. Serial: each step builds on the announcement the one before it made.
 */
test.describe('Full-timer journey — Announcements (#1477)', () => {
  test.describe.configure({ mode: 'serial' });

  const suffix = Date.now();
  const title = `Fall Campus Retreat ${suffix}`;
  const body = `Pickup times and packing list for the retreat. ${suffix}`;
  const reply = `Will there be van transport from the north gate? ${suffix}`;

  test('a Full-timer creates, pins, and broadcasts an announcement', async ({ page }) => {
    await signInAs(page, 'fulltimer');
    await page.goto('/messages');
    await waitForShell(page);

    await page.getByRole('button', { name: /new/i }).first().click();
    await page.getByRole('button', { name: /^announcement$/i }).click();
    await page.getByLabel(/channel name/i).fill(title);
    await expect(page.getByRole('dialog').getByText('Everyone in the app', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /^next$/i }).click();

    await page.getByPlaceholder(/write your announcement/i).fill(body);
    await page.getByRole('button', { name: /^pin it$/i }).click();
    await page.getByRole('button', { name: /^review$/i }).click();
    await expect(page.getByRole('heading', { name: /^review$/i })).toBeVisible();
    // The review step names the channel twice (a chip and a summary row).
    await expect(page.getByRole('dialog').getByText(title).first()).toBeVisible();
    // Back preserves the draft.
    await page.getByRole('button', { name: /^back$/i }).click();
    await expect(page.getByPlaceholder(/write your announcement/i)).toHaveValue(body);
    await page.getByRole('button', { name: /^review$/i }).click();
    await page.getByRole('button', { name: /send to/i }).click();

    await expect(page.locator('.msgs-thread-title')).toContainText(title, { timeout: 10_000 });
    await expect(page.locator('.strm-pinstrip')).toContainText('Pinned', { timeout: 10_000 });
    await expect(page.locator('.strm-flow').getByText(body)).toBeVisible();
    await expect(page.getByPlaceholder(/write an announcement…/i)).toBeVisible();
  });

  test('a Trainee acknowledges the announcement and replies in the thread', async ({ page }) => {
    await signInAs(page, 'trainee');
    await page.goto('/messages');
    await waitForShell(page);

    await expect(page.locator('.sech').filter({ hasText: /announcements/i })).toBeVisible({ timeout: 10_000 });
    const card = page.locator('.anrow', { hasText: title });
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.click();

    const post = page.locator('.strm-flow [data-stream-row]', { hasText: body });
    await expect(post).toBeVisible({ timeout: 10_000 });
    await expect(post.locator('.strm-tag-role')).toContainText('Full-timer');
    await expect(page.locator('.strm-pinstrip')).toContainText('Pinned');
    // A non-author sees the guidance bar, not a composer.
    await expect(page.getByRole('main').getByText(/only full-timers post here/i)).toBeVisible();
    await expect(page.getByPlaceholder(/write an announcement/i)).toHaveCount(0);

    const ack = post.getByRole('button', { name: /got it/i });
    await ack.click();
    await expect(ack).toHaveAttribute('aria-pressed', 'true', { timeout: 5_000 });
    await ack.click();
    await expect(ack).toHaveAttribute('aria-pressed', 'false', { timeout: 5_000 });
    await ack.click();
    await expect(ack).toHaveAttribute('aria-pressed', 'true', { timeout: 5_000 });

    await post.getByRole('button', { name: /reply in thread/i }).first().click();
    const thread = page.getByRole('region', { name: 'Thread' });
    await expect(thread).toBeVisible({ timeout: 5_000 });
    const threadComposer = thread.locator('textarea');
    await threadComposer.fill(reply);
    await threadComposer.press('Meta+Enter');
    await expect(thread.getByText(reply).first()).toBeVisible({ timeout: 10_000 });
    await expect(post.getByText('1 reply')).toBeVisible({ timeout: 10_000 });
  });

  test('a Full-timer reads the reply and the receipts', async ({ page }) => {
    await signInAs(page, 'fulltimer');
    await page.goto('/messages');
    await waitForShell(page);
    await page.locator('.anrow', { hasText: title }).click();

    const post = page.locator('.strm-flow [data-stream-row]', { hasText: body });
    await expect(post).toBeVisible({ timeout: 10_000 });
    await post.getByText('1 reply').click();
    const thread = page.getByRole('region', { name: 'Thread' });
    await expect(thread.getByText(reply)).toBeVisible({ timeout: 5_000 });

    const receipts = post.getByRole('button', { name: /read by/i });
    await expect(receipts).toContainText(/said got it/i);
    await receipts.click();
    await expect(page.locator('.pophead .poptitle')).toContainText('Read receipts', { timeout: 5_000 });
    await expect(page.locator('.popsec').filter({ hasText: /^Read$/ })).toBeVisible();
    await expect(page.locator('.popsec').filter({ hasText: /^Not yet$/ })).toBeVisible();
    await expect(page.locator('.pop').getByText('Zion Adeyemi')).toBeVisible();
    await page.getByRole('button', { name: /^close$/i }).click();
    await expect(page.locator('.pophead')).not.toBeVisible();
  });
});

/**
 * Folded from `asks-questions-for-team.spec.ts` (#603, #645): the staff-only
 * Questions page, asking and answering in place, and the role gate. Serial: the
 * answer steps build on the questions posted just above.
 */
test.describe('Full-timer journey — Questions for the team (#1477)', () => {
  test.describe.configure({ mode: 'serial' });

  const heading = (page: Page) => page.getByRole('heading', { name: 'Questions for the team' });
  const OWN_PLACEHOLDER = /What do you want to ask/;

  async function openQuestions(page: Page) {
    await page.goto('/questions');
    await expect(heading(page)).toBeVisible({ timeout: 15_000 });
  }

  async function openAskPanel(page: Page) {
    await page.getByRole('button', { name: 'Ask the team', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
  }

  /** The ask panel only closes after the write resolves, so navigating away
   *  before that would cancel the in-flight write. */
  async function postOwnQuestion(page: Page, text: string) {
    const composer = page.getByPlaceholder(OWN_PLACEHOLDER);
    await composer.fill(text);
    await composer.press('Meta+Enter');
    await expect(composer).toBeHidden({ timeout: 10_000 });
  }

  test('a Full-timer asks the team; a Trainee reads it but cannot answer', async ({ page }) => {
    await signInAs(page, 'fulltimer');
    await openQuestions(page);
    await openAskPanel(page);
    const ftQuestion = `E2E FT Question ${Date.now()}: Where is the team retreat?`;
    await postOwnQuestion(page, ftQuestion);
    await expect(page.locator('body')).not.toContainText('Missing or insufficient permissions');

    await signInAs(page, 'trainee');
    await page.goto('/');
    await expect(page.getByRole('main').getByText(ftQuestion)).toBeVisible({ timeout: 15_000 });

    await openQuestions(page);
    await page.getByRole('button', { name: /^All/ }).click();
    const card = page.locator('article', { hasText: ftQuestion });
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.getByText('A full-timer will answer this.')).toBeVisible();
    await expect(card.getByRole('button', { name: /^Answer / })).toHaveCount(0);
  });

  test('a Full-timer records an in-person question and answers a Trainee in place', async ({ page }) => {
    await signInAs(page, 'fulltimer');
    await openQuestions(page);
    await openAskPanel(page);

    // Both modes are offered; "My own question" is the default.
    await page.getByRole('button', { name: 'Someone asked me' }).click();
    const inPerson = page.getByPlaceholder(/In their words, as close as you can remember/);
    await inPerson.fill('E2E In-person question recorded by Full-timer');
    const writeItDown = page.getByRole('button', { name: 'Write it down' });
    await expect(writeItDown).toBeDisabled();
    await page.getByRole('main').getByText('Who asked it?').waitFor();
    await page.getByRole('button', { name: /Caleb/ }).first().click();
    await expect(writeItDown).toBeEnabled();
    await writeItDown.click();
    await expect(page.locator('body')).not.toContainText('Missing or insufficient permissions');

    // The Trainee asks; the Full-timer answers ON the question.
    await signInAs(page, 'trainee2');
    await openQuestions(page);
    await openAskPanel(page);
    const t2Question = `E2E Trainee2 Question ${Date.now()}: How do we handle late students?`;
    await postOwnQuestion(page, t2Question);

    await signInAs(page, 'fulltimer');
    await openQuestions(page);
    const card = page.locator('article', { hasText: t2Question });
    await card.getByRole('button', { name: /^Answer / }).click();
    await card.getByRole('textbox').fill('Say hi when they arrive and catch them after.');
    await card.getByRole('button', { name: 'Send answer' }).click();
    // The toast fires only after the write resolves; navigate only then.
    await expect(page.getByRole('status').filter({ hasText: 'Answered Caleb.' })).toBeVisible({ timeout: 10_000 });

    await signInAs(page, 'trainee');
    await page.goto('/');
    await expect(page.getByRole('main').getByText(t2Question)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('main').getByText('Say hi when they arrive and catch them after.')).toBeVisible({ timeout: 15_000 });
  });

  test('Student and Community cannot reach Questions at all', async ({ page }) => {
    await signInAs(page, 'student');
    await page.goto('/questions');
    await expect(heading(page)).not.toBeVisible();

    await signInAs(page, 'community');
    await page.goto('/questions');
    await expect(heading(page)).not.toBeVisible();
  });
});

/**
 * Folded from `feedback-submission.spec.ts` (#628, ADR 0019): the submitter's
 * Notes page for every role, the admin triage queue, the role redirects, and
 * the FAB that is now the only way to submit.
 */
test.describe('Full-timer journey — Notes and admin triage (#1477)', () => {
  test('every role reaches their Notes page, which is not a composer', async ({ page }) => {
    for (const role of ['community', 'trainee', 'student'] as const) {
      await signInAs(page, role);
      await page.goto('/feedback');
      await waitForShell(page);
      await expect(page.getByRole('heading', { name: /your notes/i })).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('#form-message')).toHaveCount(0);
      await expect(page.getByText(/what kind of note is it/i)).toHaveCount(0);
    }
  });

  test('the Full-timer triages, other roles are redirected, and the FAB is present', async ({ page }) => {
    await signInAs(page, 'fulltimer');
    await page.goto('/admin/feedback');
    await waitForShell(page);
    expect(new URL(page.url()).pathname).toBe('/admin/feedback');
    await expect(page.locator('body')).not.toContainText('Missing or insufficient permissions');

    for (const role of ['trainee', 'student', 'community'] as const) {
      await signInAs(page, role);
      await page.goto('/admin/feedback');
      await page.waitForURL((url) => url.pathname !== '/admin/feedback', { timeout: 8_000 });
      expect(new URL(page.url()).pathname).toBe('/');
    }

    await signInAs(page, 'fulltimer');
    await page.goto('/');
    await waitForShell(page);
    await expect(page.locator('#feedback-fab-btn')).toBeVisible({ timeout: 5_000 });
  });
});

/**
 * Folded from the Full-timer parts of `quick-capture.spec.ts` and
 * `cross-role-journey.spec.ts` (#628, #631): Quick Capture minimum payload,
 * the optional disclosure, persistence, advancing across the Journey board,
 * and the story composer's "By:" chip (#1494). Serial: later steps reuse the
 * contact the first one captured.
 */
test.describe('Full-timer journey — Quick Capture and the Journey board (#1477)', () => {
  test.describe.configure({ mode: 'serial' });

  const captured = `E2E Captured ${Date.now()}`;

  test('Quick Capture creates a contact with tags and a stage, and it survives a reload', async ({ page }) => {
    await signInAs(page, 'fulltimer');
    await page.goto('/directory');
    await waitForShell(page);

    await page.getByRole('button', { name: /add someone/i }).first().click();
    await expect(page.getByRole('heading', { name: /new contact/i })).toBeVisible({ timeout: 5_000 });
    await page.getByPlaceholder(/first name/i).first().fill(captured);
    await page.getByPlaceholder(/\(555\) 000-0000/i).first().fill('555-019-2834');
    await page.getByPlaceholder(/\(555\) 000-0000/i).first().blur();

    await page.getByRole('button', { name: /\+ add the rest/i }).click();
    await page.getByPlaceholder(/e\.g\. Johnson/i).fill('Sample');
    await page.getByPlaceholder(/alex@campus\.edu/i).fill('captured@example.com');
    await page.getByLabel(/^stage$/i).selectOption({ label: 'First Contact' });
    await page.getByPlaceholder(/e\.g\. Gospel/i).first().fill('Gospel, Fall2026');
    await page.getByPlaceholder(/e\.g\. Gospel/i).first().blur();
    await page.getByPlaceholder(/add some context/i).fill('Met at the campus welcome week.');
    await page.getByRole('button', { name: /^add contact$/i }).click();

    await expect(page.getByRole('heading', { name: /new contact/i })).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('main').getByText(captured)).toBeVisible({ timeout: 10_000 });
    const row = page.getByRole('main').locator('div.group').filter({ hasText: captured }).first();
    await expect(row.getByText(/^(Gospel|Fall2026)$/).first()).toBeVisible({ timeout: 8_000 });

    // Persistence: a fresh load still lists the contact.
    await page.reload();
    await waitForShell(page);
    await expect(page.getByRole('main').getByText(captured)).toBeVisible({ timeout: 10_000 });
  });

  test('the captured contact advances across the pipeline and the By-chip reaches every teammate (#1494)', async ({ page }) => {
    await signInAs(page, 'fulltimer');
    await page.goto('/directory');
    await waitForShell(page);
    await page.getByRole('main').getByText(captured).click();

    const contactPage = page.getByRole('main');
    await expect(contactPage.getByRole('button', { name: /Move to a step: First Contact/i })).toBeVisible({
      timeout: 10_000,
    });
    // Advance the stage from their own page.
    await contactPage.getByRole('button', { name: /Move to a step:/i }).click();
    await contactPage.getByRole('menuitem', { name: 'Second Contact' }).click();
    await expect(contactPage.getByRole('button', { name: /Move to a step: Second Contact/i })).toBeVisible({
      timeout: 5_000,
    });

    // The board reflects the new step.
    await page.goto('/board');
    await waitForShell(page);
    await expect(page.getByRole('main').getByText(captured)).toBeVisible({ timeout: 10_000 });

    // Back on the contact page, the story's By chip (#1494) offers every
    // teammate's name without clipping.
    await page.goto('/directory');
    await waitForShell(page);
    await page.getByRole('main').getByText(captured).click();
    const story = page.getByRole('main').getByRole('region', { name: /the story so far/i }).first();
    const composer = story.getByRole('textbox', { name: /what happened with/i }).first();
    await composer.click();
    const byChip = story.getByRole('button', { name: /^by:/i }).first();
    await expect(byChip).toBeVisible({ timeout: 5_000 });
    await byChip.click();
    const me = page.getByRole('menuitem', { name: 'Me', exact: true });
    const teammate = page.getByRole('menuitem', { name: /Zion Adeyemi/ });
    await expect(me).toBeVisible();
    await expect(teammate).toBeVisible();
    await teammate.click();
    await expect(story.getByRole('button', { name: /^by: zion adeyemi/i })).toBeVisible();
    // The topmost option — the first to clip when the menu opened upward.
    await byChip.click();
    await me.click();
    await expect(story.getByRole('button', { name: /^by: me$/i })).toBeVisible();

    // #1669: an entry logged on Zion's behalf carries his portrait, not the
    // logger's. The seeded users have no photo, so his initials are what the
    // row must show — on the breaking read it rendered a blank person icon.
    const onBehalf = `E2E reached Zion ${Date.now()}`;
    await byChip.click();
    await teammate.click();
    await composer.fill(onBehalf);
    await composer.press('Meta+Enter');
    const onBehalfRow = story.locator('[data-kind="conversation"]').filter({ hasText: onBehalf }).first();
    await expect(onBehalfRow).toBeVisible({ timeout: 10_000 });
    await expect(onBehalfRow.getByTestId('story-avatar')).toHaveAttribute('data-avatar-name', 'Zion Adeyemi');
    await expect(onBehalfRow.getByTestId('story-avatar')).toContainText('ZA');
    await expect(onBehalfRow.getByText('logged by Full-timer Test User')).toBeVisible();
  });

  test('To ask lists a not-reached person under its Trainee (#1649)', async ({ page }) => {
    await signInAs(page, 'fulltimer');
    await gotoHome(page);

    // The My Day pointer card is the door in.
    const card = page.locator('a[href="/ask"]').first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.click();
    await expect(page).toHaveURL(/\/ask$/, { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: 'To ask', exact: true })).toBeVisible({ timeout: 10_000 });

    // The seeded "Untied Recent" (added by the YP Trainee, never reached) is
    // drafted under that Trainee, using the same whole-team rule My Day reads.
    const caleb = page.getByRole('region', { name: 'Caleb Owusu' });
    await expect(caleb).toBeVisible({ timeout: 10_000 });
    await expect(caleb.getByText('Untied Recent — not reached yet')).toBeVisible({ timeout: 10_000 });
  });

  test('a Trainee cannot open To ask (#1649)', async ({ page }) => {
    await signInAs(page, 'trainee');
    await page.goto('/ask');
    // The route guard bounces them home; the notepad never renders.
    await waitForShell(page);
    await expect(page.getByRole('heading', { name: 'To ask', exact: true })).not.toBeVisible({ timeout: 5_000 });
    await expect(page).not.toHaveURL(/\/ask$/);
  });
});
