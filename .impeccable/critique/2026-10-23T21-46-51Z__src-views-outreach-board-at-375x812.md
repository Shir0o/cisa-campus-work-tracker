---
target: /board (src/views/OutreachBoard.tsx → src/views/OutreachBoardMobile.tsx at 375x812)
total_score: 22
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 6
target_identity: "file:/Users/twang/cisa-campus-work-tracker/.worktrees/issue-1763/src/views/OutreachBoard.tsx"
timestamp: 2026-10-23T21-46-51Z
slug: src-views-outreach-board-at-375x812
---
⚠️ DEGRADED: single-context (no sub-agent tool exposed in this session; one assessor read the source and then measured the live render). Numbers below are measured on the seeded emulator, not a mock.

# Critique: `/board` — The Journey at 375×812

Target: the phone Journey, signed in as `trainee.e2e@example.com` at 375×812, on the seeded emulator through the dev server (`VITE_E2E_MODE=true`). The phone branch is `OutreachBoardMobile.tsx`; the desktop kanban is `OutreachBoard.tsx`. Every measurement below was read out of the running page.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | The step switcher is static: with 15 cards it sat **1,160px above** the viewport at the bottom of the list, so the screen showed cards with no indication which step they belonged to. A step change made by swipe is announced nowhere (`aria-live` count: 0). The first paint while stages load shows "0 students" and an empty step. |
| 2 | Match System / Real World | 3 | The vocabulary is the ministry's — *First Contact*, *We've only just met*, *Welcome someone new*, *Where is Around now?* — and each default step carries a one-line pastoral caption. But the same screen says "students" while the rest of the app calls them *people in our care*. |
| 3 | User Control and Freedom | 2 | Deep in a list there is no way to change step without scrolling back (before this pass). The Move sheet ignored Escape. A Full-timer's **Shape the journey** button did nothing at all on a phone. Moving a person jumps to the top of the page with no announcement. |
| 4 | Consistency and Standards | 1 | The active step was a **14% tone wash** (`oklch(0.55 0.15 258 / 0.14)`) with 14px semibold tone text — a direct violation of DESIGN.md's Inversion Rule and the chip selected state. Its text measured **3.75:1** on the washed background. Tap targets were 43px (steps), 38px (Move), 28px (sheet close), 30px (admin chip). The card was an `<article>` with `onClick` and no role. |
| 5 | Error Prevention | 2 | A mostly-vertical scroll with 70px of thumb drift changed step **and** scrolled the page (reproduced). The floating team-note button overlaps the third card's Move button by 12×32px at rest. The Move control is 38px next to a whole-card open target. |
| 6 | Recognition Rather Than Recall | 3 | Counts on every step pill and a caption per step mean a Trainee can see the shape of the journey without opening anything. The pills are cut at both edges with no scroll affordance; there is no search or filter on the board itself. |
| 7 | Flexibility and Efficiency | 2 | No search on the board (the top-bar search is one tap away), no keyboard path into a person, and the only fast switch — a horizontal swipe — was undiscoverable and misfired. |
| 8 | Aesthetic and Minimalist Design | 3 | The field-notes header, serif names and 24px card rhythm read as one calm surface. But 381px of the 812px viewport (47%) is chrome before the first card, and the stage-tinted panel washes the entire reading surface. |
| 9 | Error Recovery | 2 | Empty steps offer "Add to {stage}", which is the right exit. But an empty step says **"no one here yet"** over a box that says **"No one at this step just now."**, and a one-person journey read "1 students". |
| 10 | Help and Documentation | 2 | The per-step captions are real help and the best thing on the screen. Nothing explains that the pills scroll sideways, that a card opens on tap, or what the arrow button does beyond its screen-reader label. |
| **Total** | | **22/40** | **Acceptable (55%)** |

## Design Specificity Verdict

**LLM assessment.** This is not a generic kanban on a phone. The screen is arranged around a ministry's question — *where is this person in the journey from a first hello to a church family?* — and each step explains itself in a sentence ("Following up — a coffee, a text, learning who they are."). The card carries a relationship: a face, *Connected today*, and the trainee's own last note. The mobile adaptation (one step at a time with a centred pill switcher) is the right call for 375px; a horizontally scrolling board of 320px columns would have been worse.

Where it drifts is the same place the phone People and contact pages drifted: **the rules were written for a 1040px board and the phone view was branched off before the rules were applied.** The active pill uses a tint the design system forbids; four interactive sizes sit under the 44px phone rule; the card was never made a control; the copy was never sent through `t()` even though the keys already existed; and the admin editor was left on the far side of an early `return` so its button became decorative.

**Deterministic scan.** `impeccable detect --json src/views/OutreachBoardMobile.tsx` → `[]` (clean). The detector cannot see a static switcher 1,160px off-screen, a 3.75:1 wash, or a button whose handler sets state that no rendered branch consumes. Every finding below is from the live DOM.

**Visual overlays.** One live render at 375×812 (device scale 1), light and Spanish. Dark mode was computed from the tokens, not observed: the local theme switch left `html.light`, so the dark numbers are marked unverified below.

## Overall Impression

The concept is right and the reading experience is calm; the interaction model was unfinished on the phone. This pass fixed the six P1s (scope, active-state inversion, sticky steps, keyboard access, localization, dead admin control) and four cheap P2s (swipe direction lock, dialog semantics, tap targets, duplicate empty copy). On the same seed the Trainee now sees the same two people the desktop Journey shows, can switch steps from anywhere in a long list, open a person with Enter, and read the whole screen in Spanish.

## What's Working

1. **One step at a time on a phone.** The pill switcher plus a single list is the correct adaptation of a wide kanban; the counts on the pills preserve the overview the desktop columns give.
2. **Pastoral captions per step.** "We've only just met — a name, a face, a first hello." does more to explain the journey than any legend could, and it survives translation.
3. **The card is a relationship, not a row.** *Connected today* and the trainee's own note are the two facts a campus worker needs, in that order, with the overdue marker only when it matters.
4. **Adding is always one tap away.** The full-width "Add to {stage}" sits at the end of every list, and it passes the stage through to the new-person modal.

## Priority Issues

### [P1] The phone board showed people outside the viewer's journey
- **What**: `OutreachBoard` handed `contacts={boardContacts}` to the phone view while the desktop used `journeyContacts(...)`. On the seeded Trainee, the phone listed **3** people including *Jordan Visible* (created by another staff member, not in the Trainee's care circle) while the desktop listed **2**. The header also counted the raw set.
- **Why it matters**: the Journey is a care list, not a directory. Showing someone outside it (and inflating "N students") breaks the one scoping rule the screen exists to express. `journeyContacts` also drops Local saints (ADR 0030) and other-season contacts — none of which the phone applied.
- **Fix**: pass the same `filteredContacts` the desktop renders. Verified after: phone and desktop both show *Around Touch* and *Lila Chen*; *Jordan Visible* is absent.

### [P1] The selected step violated the Inversion Rule and failed WCAG AA
- **What**: active pill `bg-[var(--tone-soft)] text-[var(--tone)]` resolves to `oklch(0.55 0.15 258)` on a 14% wash of itself. Computed contrast **3.75:1** at 14px/600 — below 4.5:1 for normal text. DESIGN.md: *"Selection and activation are expressed as solid ink inversion … never as a faint 6% tint."*
- **Why it matters**: the selected step is the primary orientation cue, and it was the least legible pill in the row under campus light.
- **Fix**: selected state is now solid ink (`bg-on-surface` + `text-background`, with the count badge at 15% of the background). Measured on the live page: `#0A0A0B` with `#FFFFFF` (≈19:1), still full inversion in dark mode.

### [P1] Scrolling past a few cards lost the step switcher entirely
- **What**: `.jrnm-switch` was `position: static`. With 15 cards, scrolling to the bottom put it at `top: -1160px`; the screen was 15 cards with no step label and no switch. Switching then required a 1,244px scroll back.
- **Why it matters**: the phone board's whole navigation model is that strip. Losing it turns a long step into a dead end.
- **Fix**: the strip is now `sticky top-0` in the scrolling `<main>` (the app bar sits above it), so it is visible at `top: 57px` at every scroll position; switching also returns the new step to its heading instead of inheriting the old scroll offset.

### [P1] A person could not be opened without a pointer
- **What**: the card was `<article onClick>` with no role and `tabIndex=-1`. Measured tab order: header buttons → three step pills → the three 38px **Move** buttons → add → bottom nav. The card body never received focus, so Enter/Space could not open anyone.
- **Why it matters**: keyboard and switch-control users could move a person between steps but could not open one to read or edit them — the more important action was the inaccessible one.
- **Fix**: the card is now `role="button"`, `tabIndex=0`, labelled by the person's name, with Enter/Space handlers (and a target guard so Enter on the inner Move button does not also open the card). Focus is drawn as a 2px ink ring with a tone-soft offset.

### [P1] Most of the screen ignored Spanish
- **What**: with `cisa_language=es`, the live page read **"the journey / Etapas / 3 students, moving from a first hello … / 3 people / Last: …"**; the empty state, step captions, Move sheet ("Where is … now?", "Move them to the step that fits today."), Move aria-label and the pseudo-step "Unassigned" were English too. The keys for almost all of these already existed.
- **Why it matters**: bilingual access is a product commitment; a Trainee reading Spanish got an English board with a Spanish title. Screen-reader users got English control names inside a Spanish page.
- **Fix**: every string on the phone board now resolves through `t()` — reusing `outreachBoard.stage_captions.*`, `no_one_here`, `last`, `one_person`, `n_people`, `outreach.here_now`, and six new en/es keys. Verified live: *la jornada / Etapas / 16 estudiantes … / 6 personas / Sin asignar / Dar forma a la jornada*.

### [P1] "Shape the journey" was a dead button for Full-timers on a phone
- **What**: the phone button called `onShapeJourney`, which set `showAddStage`, but `OutreachBoard` returned `OutreachBoardMobile` **before** the `<AnimatePresence>` that renders the editor. Measured as a Full-timer at 375: click → 0 dialogs, 0 inputs, no overlay. The button is admin-only, which is why the Trainee critique did not surface it.
- **Why it matters**: a named primary control that does nothing is worse than an absent one; an admin cannot rename or add a step from the device they carry.
- **Fix**: the add/edit and delete-reassign dialogs were lifted out of the desktop return and render in both branches. Verified: the 328px-wide editor opens with the step field and eight colour swatches.

### [P2] A vertical scroll with thumb drift changed step
- **What**: `onTouchEnd` compared only `clientX` against a 60px threshold, ignoring `clientY`. Reproduced with a mostly-vertical gesture (dy −160, dx −70): the page scrolled 201px **and** jumped from First Contact to Second Contact.
- **Why it matters**: scrolling is the dominant gesture on this screen; an occasional silent step change reads as data jumping under the thumb.
- **Fix**: direction lock — a step change now needs `|dx| > 60` **and** `|dx| > 1.5·|dy|`. The same gesture leaves the step unchanged; a horizontal swipe still moves one step.

### [P2] The Move sheet was not a dialog
- **What**: no `role`, no `aria-modal`, no accessible name; focus stayed on the Move trigger behind the scrim; Escape did nothing; the page behind could still scroll; close was 28×28. (Options were fine at 57px.)
- **Why it matters**: for a screen-reader or keyboard user the sheet was invisible as a layer — they kept tabbing through the board underneath it.
- **Fix**: `role="dialog" aria-modal="true"` with `aria-labelledby`/`aria-describedby`, focus moved into the sheet, Tab cycling, Escape to close, background scroll locked, focus returned to the trigger (or the list if the person moved away), and a 44×44 close.

### [P2] Four tap targets under the 44px phone rule
- **What**: step pills **43×169**, Move **38×38**, sheet close **28×28**, admin chip **30px** high. DESIGN.md sets 44px buttons.
- **Why it matters**: one-handed use while walking is this screen's actual context; the Move button sits in the thumb's busiest corner.
- **Fix**: steps `min-h-11`, Move `44×44`, close `44×44`, Shape `min-h-11` — all measured at 44 after the pass.

### [P2] Two empty messages and broken singular
- **What**: an empty step rendered "no one here yet" as its count and "No one at this step just now." in the box; the summary hardcoded "students" (the unit test had enshrined "1 students"). The stage editor's "1 person" was already correct elsewhere.
- **Why it matters**: duplicated emptiness reads as two different states; "1 students" undermines the care tone.
- **Fix**: the count line is hidden when the list is empty, the box uses the existing `no_one_here` string, and the summary has `_one`/`_many` keys.

### [P3] The active pill hides its neighbours
- **What**: centring the active pill scrolls the strip to `scrollLeft=118.5` of 205, clipping *First Contact* to "act 14" and *Regular* to "Regul" when the middle step is selected.
- **Why it matters**: it signals horizontal scroll correctly, but a user who wants the first step must infer that half a pill is still a target.
- **Fix**: none in this pass; the clipping is an acceptable scroll affordance. Consider a fade mask at the strip edges.

### [P3] "the journey" and "Stages" say the same thing
- **What**: eyebrow + 32px title occupy 100px before the summary, while the app bar and rail already say *The Journey*.
- **Why it matters**: 47% of the first viewport is chrome before the first person.
- **Fix**: none in this pass; collapsing the eyebrow is a visual direction call, not a defect.

### [P3] The chat bubble covers the third card's Move button
- **What**: the shared `FeedbackFAB` (48px at `x296–344, y684–732`) overlaps the Move button of the third card (`x270–308, y700–738`) by 12×32px at first paint.
- **Why it matters**: a tap in the overlap goes to the note composer instead of the Move sheet.
- **Fix**: out of scope here — the FAB is global chrome shared by every phone page. Already tracked in **#1785**.

## Persona Red Flags

- **Alex (Trainee / field worker)**:
  - *Mid-list dead end*: 15 cards into First Contact, Alex cannot see which step they are in or switch to Regular without a 1,244px scroll (fixed: sticky strip).
  - *Walking thumb*: a scroll with drift silently changes step (fixed: direction lock).
  - *Spanish*: Alex switches the app to Spanish and half the board stays English (fixed).
- **Jordan (Student / first-timer helping at a table)**:
  - *"What does the arrow do?"*: the only visible per-person action is an unlabeled arrow; the card body opens the person, but nothing says so.
  - *Empty step*: Jordan taps a step with nobody in it and sees the same emptiness twice, with the add action 120px below the message.
- **Sam (Keyboard / screen-reader user)**:
  - *Cannot open a person*: Sam can reach Move but not the card (fixed).
  - *Sheet without a layer*: focus stays on the board behind the Move sheet and Escape does not close it (fixed).
  - *Selected step*: 3.75:1 active text was the hardest label to read (fixed).

## Minor Observations

- The stage-tinted panel (`--tone-soft`) changes the reading surface per step; cards sit on it at white/slate and separate well, but the tint is the largest colour field on the page and competes with the stage dot's meaning.
- `Contact.year · major` is truncated on one line; long majors lose the distinguishing half.
- The overdue line is 12px `text-stage-amber` on white (5.18:1) — passes, but the amber dot plus amber text plus "N days" is three signals for one fact.
- The strip's `no-scrollbar` removes the only native hint that it scrolls.
- Switching steps remounts the panel (`key={stage.id}`), which is good for state but means no cross-fade; with reduced motion unhandled, the 300ms sheet slide is the only motion on the screen.
- The stage editor, now reachable on a phone, is still a desktop-shaped centred dialog (no `role="dialog"`, 40px colour swatches, 36px close). Tracked in **#1788**.

## Questions to Consider

- **Should the journey have a search?** The desktop board has one; the phone relies on the global search button. A Trainee looking for "Lila" on the board has to know that the magnifier in the chrome is the board's search too. A stage-local field that also reports matches in other steps would close the gap without adding a screen. Tracked in **#1787**.
- **Is "students" the right noun?** The desktop says *people in our care*, the phone says *students*. Campus ministry includes non-students; the noun should match the care model, not the campus.
- **Should a swipe change steps at all?** With a sticky, tappable strip and arrow keys, the swipe is a bonus gesture that competes with vertical scrolling. If kept, it needs a visible queued transition and an announcement; if not, the strip is enough.
- **What belongs in the app bar for this screen?** The global search/notifications/profile row is identical on every page, so the board's own primary action (add someone, or find someone) lives below the fold. A phone Journey might earn one contextual action in the bar.

## What this pass changed (same PR)

- Scope parity with the desktop Journey (`filteredContacts`).
- Solid-ink selected step (Inversion Rule) and 44px targets.
- Sticky step strip + scroll reset on step change.
- Tabs pattern (`tablist`/`tab`/`tabpanel`, `aria-selected`, roving tabindex, Arrow/Home/End), keyboard-openable cards, live step announcement.
- Full en/es chrome, including the Move sheet and its aria-label.
- Swipe direction lock.
- Move sheet as a modal dialog with focus management.
- Single empty message; singular/plural summary.
- The stage editor is reachable from the phone (shared dialogs).

**Unverified**: iOS VoiceOver/Safari announcement order (no iOS runtime); dark-mode appearance of the new solid pill (local theme switch did not apply; tokens predict ≈16:1 inversion); real-device overlay scrollbars (measurements at 345px content width because desktop Chrome reserves 15px); whether excluding *Jordan Visible* from the seeded Trainee's Journey is the intended data rule (inferred from the desktop branch and the seed name); behaviour with more than three real stages (only three existed; extra cards were temporary emulator fixtures, since deleted).
