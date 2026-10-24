---
target: /prayer (src/views/PrayerList.tsx → src/views/PrayerListMobile.tsx at 375x812)
total_score: 22
max_score: 40
na_heuristics:
p0_count: 1
p1_count: 7
target_identity: "file:/Users/twang/cisa-campus-work-tracker/.worktrees/issue-1765/src/views/PrayerList.tsx"
timestamp: 2026-10-24T00-48-44Z
slug: src-views-prayer-list-at-375x812
---
⚠️ DEGRADED: single-context (no sub-agent tool in this session; one assessor read the source and then measured the live render). Every number below is measured on the seeded emulator at 375×812, not on a mock.

# Critique: On our hearts — the team's prayer list at 375×812

Target: `/prayer`, signed in as `fulltimer.e2e@example.com` at 375×812, against the seeded emulator through the dev server (`VITE_E2E_MODE=true`, `qa-db`).

**The brief says “sign in as Trainee”; a Trainee cannot open this route.** `canAccessRoute('manager', '/prayer')` is false (the trainee allowlist in `src/lib/permissions.ts`), and `e2e/journeys/student-community.spec.ts` asserts `/prayer` is denied to a Trainee. Verified live: signed in as `trainee.e2e@example.com`, opening `/prayer` redirects to `/`. So this pass measured the page as the role that actually owns it — the Full-timer, whose list it is — and filed the role question as **#1794** rather than changing a permission the e2e matrix asserts. A Trainee's prayer surface is the home card (“Prayers we're praying for”: “just between you and God”), which is a *personal* list; this page is the *team's* list.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | The card said **“All answered”** for a person whose only prayer was **unmarked** — the pill and the status control 200px below it contradicted each other on the same card. Nothing explained the coloured dots on the spine. |
| 2 | Match System / Real World | 3 | The prayer grammar is right and reads like a page, not a feed: a serif title, “Who we're carrying”, this week / last week on one spine. But the screen called itself three things — **Prayer** (eyebrow), **On our hearts** (nav, tab), **Who we're carrying** (title) — and the status sentence was not true. |
| 3 | User Control and Freedom | 2 | Clear-prayer and remove-from-list both undo (and the undo names the team), but the destructive controls were 16px text-links sitting beside the benign one, and taking someone off a **shared** list was a bare 32px ×. |
| 4 | Consistency and Standards | 2 | The card was 40px-radius with a hairline border where DESIGN.md says Card = 24px and borderless; the nested strip was 32px where Sub-container = 20px; the selected segment was a 6% tint with a drop shadow, against the Inversion Rule and Flat-By-Default; the byline was painted in the hairline-mute token; the date was hard-coded `en-US`. |
| 5 | Error Prevention | 2 | The two destructive actions are the two smallest targets on the screen and shared one 12px row. Both are undoable, so the blast radius is small — but a mis-tap on “Clear this prayer” while aiming at “Make a to-do” deletes a prayer. |
| 6 | Recognition Rather Than Recall | 3 | Names, dates, week labels and the shared-list sentence do the work. But the count on “Pray for someone” was the *filtered* count (it read **0** under Sisters while two people were on the team list), and the picker — opened under a filter — offered already-held people as if they were new. |
| 7 | Flexibility and Efficiency | 2 | No search on the phone (desktop has one), no quick mark from the list, and the only status control is a native select that starts below the fold. The picker is the one fast path and it is good. |
| 8 | Aesthetic and Minimalist Design | 2 | The Field Notebook voice is here — big serif, soft slate, a spine with dots. But **293px** of header, tabs and filters sat above the first card, the card was **423px** tall for one prayer, and “No interactions” appeared twice inside it. |
| 9 | Error Recovery | 3 | A failed load gets `DataLoadError`; both destructive actions offer Undo. A failed status write gives no local feedback beyond the global handler. |
| 10 | Help and Documentation | 2 | “Everyone on the team sees this list.” is the right sentence in the right place. Nothing explains the dots, the count, or that the × removes the person for everyone — though the undo toast does say “the team's”. |
| **Total** | | **22/40** | **Good bones, a false status, and a row of un-tap-able controls** |

## Design Specificity Verdict

**LLM assessment.** This is not a generic CRUD list. The page is built around one person and one week: a contact's face and name, one prayer for *this* week, the prior week beneath it, a fold for earlier prayers, and a single vertical spine whose dot colour says how the prayer landed. The copy carries the ministry's own vocabulary (“Who we're carrying”, “Where did it land?”, “Mark status”, “Holding in prayer”), and CONTEXT.md's shared-list decision (#1692/#1755) is stated in the header in plain words. That is a design with a point of view, and it is why the page scores well on match-to-world despite the bugs.

Where it drifts is the usual phone-pass drift: a mobile branch written with utility classes that a later `.prm`/`.prt` override block (src/index.css, “Appended Mobile Prayer CSS Overrides”) contradicts — the last word wins, so the markup's 24px card, 16px sub-panel and `text-xs` byline all rendered as something else. Three separate symptoms below (40px card, 32px strip, 2.35:1 byline) are one root cause: **two layers styling the same element**.

**Deterministic scan.** `impeccable detect` is not installed in this worktree, so no CLI scan was run; every finding below is from the live DOM. The detector would not see a tap that lands on the wrong element, a text colour equal to a placeholder token, or a label that is a `<span>`.

**Visual overlays.** One live render at 375×812 (device scale 1) in English and Spanish, plus the seeded picker sheet. Dark mode was **not observed** — the local theme key did not take effect in this session, so dark numbers are computed from tokens and marked unverified.

## Overall Impression

The page is one good idea — a shared prayer list that reads like a page — wearing a phone layout that has not been finished. The header is warm and honest, the card is calm, the picker is genuinely nice. Then the card states a status that isn't true, paints its authorship line in a colour you cannot read, and puts its one status control half under the bottom bar.

Every fix below is small and local: one helper for the status sentence, one line of CSS for the card ladder, one aria-label, one copy change. Nothing here needs a redesign, and nothing here is a reason to add a feature.

## What's Working

1. **The spine.** One vertical line, a dot at the top of each week's prayer, a fold for earlier ones. It says “this person's prayer has a history” without a table or a second column, and it survives a long prayer — eight lines wrapped cleanly at a 243px measure.
2. **The picker.** “Who are we praying for?” as a sheet, with a search, 54px rows, an “already on our prayer list” row that is visibly disabled, and a footer that counts what you have added and what the team holds.
3. **The shared-list sentence.** “Everyone on the team sees this list.” is a direct answer to #1692's question, in the header, above the action, at 7.1:1.
4. **Undo on both destructive paths.** “Prayer cleared · Undo” and “Removed {name} from the team's prayer list” — the removal copy already knew the list was the team's, which is more than the button that triggered it knew.
5. **The empty list's sentence.** “No one here yet — tap ‘Pray for someone’ to start.” tells the reader what to do next in one line.

## Priority Issues

### [P0] The card claimed prayers were answered when they were not
- **What**: the contact header's carry pill was computed as `ongoing > 0 ? "{n} ongoing" : prayers.length === 0 ? "No prayers yet" : "All answered"`. A person with **one unmarked prayer** therefore rendered **“All answered”**, while the same card's `Mark status` control read **“Not yet marked”**. Measured on the seeded `Held Burden` card: pill “All answered”, select value “Not yet marked”, both on screen at once.
- **Why it matters**: this is a prayer record. Saying a prayer was answered when nobody has marked it is the one kind of wrong this page cannot afford — it is read as a report of what God has done. It also made the pill useless as a scan: every contact with any prayer and no “ongoing” one read identical.
- **Fix**: a pure `prayerCarrySummary(prayers)` helper with an order that cannot lie — any unmarked prayer → “Needs marking”; else any ongoing → “{n} ongoing”; else all answered → “All answered”; else all archived → “All archived”; none → “No prayers yet”. The pill also carries its `tone-*` class, which the markup never applied, so “All answered” was rendering in plain dim grey instead of its success tone. Covered by six unit tests and a component test asserting “Needs marking” and the absence of “All answered”.

### [P1] “Holding in prayer” was rendered as if a teammate wrote it
- **What**: choosing a person writes the burden string “Holding in prayer” into a real prayer record, and the card then printed it at 15px body ink, in the same slot and weight as “Settling into the new term after the move.” on the card above. In Spanish the string stayed **English** on an otherwise-Spanish card, because it was stored as content in the author's locale.
- **Why it matters**: #1691 asked for exactly this. A reader cannot tell a placeholder from a burden, and a bilingual reader gets a sentence that belongs to neither language. It is also the first thing every newly added person says.
- **Fix**: a placeholder treatment, not a data migration. Both strings the app ever writes (`Holding in prayer` / `Sosteniendo en oración`) are recognised, and the slot renders the **localized prompt** — “What are we praying for {name} this week?” in Spanish too — in the muted italic register, with a 40px **Add prayer** control instead of the small Edit link. Stored text is never rewritten; #1691's copy call stays open. Tests: the prompt renders, the filler never does, and a real burden still prints as prose.

### [P1] The authorship line — the shared list's only provenance cue — was unreadable
- **What**: `.prt-meta` rendered “Added by …” at 12.5px in `--text-mute` (`#A1A1AA`) on `#F4F4F5`: **2.35:1**. It was also `white-space: nowrap` + ellipsis, so the seeded name clipped to “Added by Full-timer Test Us…”. The same line carries the person's stage and carers, joined with “ · ”.
- **Why it matters**: #1755 made the list team-wide, so “who put this person on our hearts” is the fact that makes a shared list legible — and it was the least legible text on the card. AA needs 4.5:1.
- **Fix**: `--text-dim` (**7.1:1**, same token in dark) and two lines of room instead of a hard ellipsis.

### [P1] Taking someone off a shared list was a bare 32px ×
- **What**: the remove control was a 32×32 `×` at the card's top-right, named “Remove {first name} from prayer list”, and it takes the person off **every teammate's** page (the write lands on the contact as `prayerListRemoved`). The undo toast was the only place that said “the team's”.
- **Why it matters**: the page says the list is shared, then its most consequential control behaves like a personal bookmark — on the smallest target in the card.
- **Fix**: a 44px target, and the control now says what it does — “Remove {name} from the team's prayer list” in both locales. Undo still holds the way back. (Three existing assertions were updated to the new copy.)

### [P1] The status select had no accessible name
- **What**: “Mark status” was a `<span>`, and the `<select>` had no `id`, no `aria-label` and no `aria-labelledby`. An accessibility snapshot reported `combobox` with an empty name.
- **Why it matters**: this is the control that records whether a prayer was answered. A screen-reader user met an unnamed popup button holding the page's most important choice.
- **Fix**: `aria-label` from the same string the visible label uses (including “Where did it land?” on last week's item), and the edit textarea gained a label too. Test: `getByLabelText('Mark status')` resolves to the SELECT.

### [P1] The actions that change a prayer were 16px tall
- **What**: “Make a to-do” measured `78×16`, “Clear this prayer” `112×16`, “Log Interaction” `123×23`, “Edit” `48×32`, and the remove × `32×32`. The two 16px ones sat in one row, one benign and one destructive.
- **Why it matters**: one-handed use while walking is this screen's real context; a mis-tap on “Clear this prayer” deletes a prayer (undoable, but it costs the reader their place).
- **Fix**: the visual stays compact, with a 40px minimum hit height on a coarse pointer for every control in the prayer's tool row, the edit link, “Log Interaction”, the filter chips and the remove × (44px). The clock icon row and a `prt-prayer-tools` wrapper gave the CSS stable hooks.

### [P1] The filter's empty state was the list's empty state, and the count followed the filter
- **What**: with **Sisters** selected and two people held, the page said “No one here yet — tap ‘Pray for someone’ to start.” and the CTA badge read **0**. Worse, the picker received the *filtered* ids, so it offered already-held people as selectable — picking one would write a second burden for the same person.
- **Why it matters**: a filter that empties a screen is not an empty list, and the sentence told the reader to add people they had already added. The duplicate-add path is a data bug hiding behind a cosmetic one.
- **Fix**: a filter-specific sentence (“No sisters on our hearts yet.”) with a **Show everyone** action; the badge counts the **unfiltered** team list with an accessible name; the picker is given the unfiltered held ids. Tests: the filter sentence and action render, the badge still reads 1 while the filter hides the only person, and the picker marks that person “already on our prayer list”.

### [P1] Shell: the window still scrolls 64px behind the sticky header (not fixed here)
- **What**: the document is **876** tall on an 812 viewport. The cause is not this screen: the shell root is `min-h-screen … pb-16` while its inner pane is `h-screen`, so the 64px bottom padding becomes page height. Scrolling the window to 64 moves “Who we're carrying” from y83 to −36 and the sticky top bar covers it.
- **Why it matters**: on a phone the last drag of any list chains into the page and the title disappears under the chrome. It is the same defect class the Messages pass (#1764) hit, and it is why the bottom bar looks like it is sitting on top of content.
- **Fix**: **none in this pass.** The fix belongs to the shared mobile shell (`DashboardLayout`), not to this screen, and a one-line change there would move every screen's scroll behaviour — that is the Nav shell sweep (#1775). Filed as **#1795** (mobile shell); this pass removed the page's own redundant bottom padding so the shell's is the only one.

## Persona Red Flags

- **Alex (Full-timer, walking between meetings)**:
  - *“Did anyone pray for this?”* — the card said “All answered”, the control said “Not yet marked” (fixed).
  - *Cannot read who added them* — the byline was a ghost at 2.35:1 and clipped (fixed).
  - *One thumb, one list* — the two buttons they use most are 16px tall and adjacent, one of them destructive (fixed on touch; unverified in headless).
  - *Cannot remove safely* — a 32px × that removes the person for the whole team (fixed: 44px and it says “the team's”).
- **Jordan (new staff, Spanish-first)**:
  - *The list said “Holding in prayer” in English* on an otherwise-Spanish card, and it read like the burden itself (fixed: a Spanish prompt).
  - *“Oct 23”* stayed English on the Spanish page (fixed: “23 oct”).
- **Sam (screen reader / keyboard)**:
  - *Unnamed combobox* — the status control announced nothing (fixed).
  - *Unnamed textarea* in the edit state (fixed).
  - The card's header button announces the whole card as one string — “HB Held Burden Added by Full-timer Test User Needs marking No interactions…” — because the meta and pills live inside the name button. Verbose, but it does reach the right place.

## Minor Observations

- The grey “All answered” pill was painted `--accent` (dim) because the markup never added the `tone-*` class the CSS expects; fixed, and a new `tone-pending` covers “Needs marking”.
- “No interactions” appears twice per card: an amber pill in the header and a stale-action strip with “Log Interaction”. Removing the duplicate would need a decision about non-operators (who never see the strip), so it is left.
- Card radius 40px with a 1px `#E4E4E7` border, and a nested strip at 32px with a 60%-alpha fill: the radius ladder was inverted and the card separated by border where DESIGN.md separates by fill. Fixed to 24px, borderless, and a 20px nested strip.
- The edit textarea was `rounded-xl` (24px) for a control; now `rounded-sm` (10px) per the No-Stadium rule, with a label.
- The eyebrow was 10.5px (`Mark status`) and 11px (`Prayer`); the mark label is now 11px, DESIGN's caption floor.
- The date was formatted with a hard-coded `'en-US'` in `formatDate`; it now follows the reader's language.
- `AddThisWeekMobile` hard-coded an English “Cancel”; it goes through `t()` now.
- The empty state was a dashed outline with `shadow-inner` and a 40%-alpha fill, invisible on white; it is a panel now.
- The **“Leave a note”** FAB (`296,684 48×48`) covers the right end of the action row and the last line of a long prayer; global chrome, already tracked (#1785).
- The header reads “0 prayers answered this year.” — a statistic with no action and no comparison, on a line that could carry the shared-list sentence alone.
- On a long prayer (8 lines measured) the card reaches ~640px: one person per screen. That is the density consequence of the three fact strips, not of the prayer itself.
- The page title and contact names are set in Literata (`font-serif`), which DESIGN.md's Scripture Exclusivity Rule reserves for scripture. It is the page's established voice across the app, so it is noted, not changed.

## Questions to Consider

- **Should a Trainee be able to open this page at all?** The epic's brief assumed yes; the role matrix says no, and a Trainee's prayers live on the home card as a personal list. Shared team list vs personal list, and which roles carry the team's burdens, is a product decision — filed as **#1794** rather than changed here.
- **Should “Holding in prayer” exist as stored content at all?** The treatment above makes it legible without touching data, but the cleaner model is a prayer with *no* burden: a person held, nothing written. That is a schema question and belongs with #1691.
- **Does the phone need a search on this page?** The desktop has one and the picker has one; the list itself does not. If a team holds 40 people, the phone list becomes a long scroll. Not fixed — it needs a decision about where search lives.
- **Is a native `<select>` the right mark control?** It is honest and accessible once labelled, but `Answered` opens a second composer (testimony) below it and `Archived` opens a third (reason), so “mark” becomes a two-step form the reader did not ask for on a phone. Worth its own pass.
- **Should the bottom bar step out of the way on a list this tall?** The Messages thread hides it for a reason. Here it is legitimate chrome, so the fix is density, not hiding.

## What this pass changed (same PR)

- The carry pill can no longer claim “All answered” for an unmarked prayer; it says “Needs marking”, and the tone classes finally apply.
- A placeholder prayer reads as a localized prompt with an **Add prayer** action, not as a teammate's prose (#1691).
- The byline is ink at 7.1:1 and wraps to two lines instead of ellipsizing.
- Remove-from-list is a 44px target that says “the team's”.
- The status control is named for assistive tech; the edit textarea is too.
- Everything that changes a prayer has a 40px hit height on touch.
- A filter that empties the list says so, offers **Show everyone**, and the CTA badge counts the whole team list; the picker knows who is already held even when a filter is active.
- Spanish: the date follows the active locale, the placeholder prompt is localized, and the stray English “Cancel” is gone.
- The card follows the DESIGN.md ladder (24px, borderless, 20px nested strip), the selected tab inverts, and the CTA reads as a button rather than a text field.
- The page's own redundant bottom padding is gone; the shell's clearance is the only one.

**Unverified**: dark mode (the local theme switch did not apply — the fixed tokens are `--text-dim` / `--panel-2`, which resolve per theme, but the rendered result was not seen); the coarse-pointer hit-area rules (headless Chrome reports `pointer: fine`, so the 40px targets were measured with the media query inactive); VoiceOver's reading order over the spine; and whether the iOS overscroll chain still nudges the page (no device here).
