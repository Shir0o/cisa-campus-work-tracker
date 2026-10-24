---
target: /answered (src/views/AnsweredList.tsx at 375x812)
total_score: 20
max_score: 40
na_heuristics:
p0_count: 1
p1_count: 6
target_identity: "file:/Users/twang/cisa-campus-work-tracker/.worktrees/issue-1766/src/views/AnsweredList.tsx"
timestamp: 2026-10-24T16-11-37Z
slug: src-views-answered-list-at-375x812
---
⚠️ DEGRADED: single-context (no sub-agent tool in this session; one assessor read the source and then measured the live render). Every number below is measured on the seeded emulator at 375×812, not on a mock. `impeccable detect` is not installed in this worktree, so no deterministic scan was run.

# Critique: Answered — the wall of answered prayer at 375×812

Target: `/answered`, at 375×812, against the seeded emulator through the dev server (`VITE_E2E_MODE=true`).

**The brief says “sign in as Trainee”; a Trainee cannot open this route.** `canAccessRoute('manager', '/answered')` is false: `canAccessRoute` hand-writes a Trainee allowlist (`src/lib/permissions.ts:167`) that names `/`, `/directory`, `/board`, `/messages`, `/questions`, `/feedback`, `/contact`, `/bible-study/read` and `/bible-study/present` — and nothing else. Verified live three times: signed in as `trainee.e2e@example.com`, `/answered` redirects to `/`. Measured instead as the role that owns it — the **Full-timer** — and confirmed that **Student and Community can open it** (both landed on `/answered` and rendered the wall). So the page is reachable by the two *lowest* roles and closed to the one middle role, which is the shape the prayer critique found for `/prayer` (**#1794**). Filed as **#1822** rather than changing a permission the role matrix asserts.

Six answered prayers were seeded into the emulator for the pass (three inside the 90-day window, three outside, one dated 2025 twice over, one with an answer photo that never uploaded, one contact deleted so the “Whole Team” fallback renders) and removed afterwards.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | The header read **“0 answered this year”** while a prayer answered **five days earlier** sat in the list under “Earlier this year”. The card's one date is a raw machine value — `answered 2026-10-18T09:15:00.000Z` — printed in the brightest colour on the card. |
| 2 | Match System / Real World | 2 | The vocabulary is right (testimony, the asked→answered arc, the burden under the answer, a person's name), but **“Earlier this year” held two 2025 answers**, and the answer date — the fact the page exists for — was rendered as a timestamp, not a day. |
| 3 | User Control and Freedom | 2 | The two-view toggle works, and a person's page closes with a visible Close. But the *selected* tab is a dead button, and opening a person leaves the URL at `/answered`, so the phone's Back leaves the page instead of closing the detail. |
| 4 | Consistency and Standards | 1 | The `<h1>` rendered at **16px** because `font-size: var(--page-h1)` names a token that is defined **nowhere** (`var()` falls back to `inherit`), so the page title sat at body size — DESIGN.md's Vocal Headline Rule fails outright. Cards were 20px with a hairline border where DESIGN.md says 24px borderless; the selected tab was a 6% tint against the Inversion Rule; the empty state was a 40px box. |
| 5 | Error Prevention | 3 | Nothing here can destroy data. But a card whose contact was deleted (“Whole Team”) looks identical to a tappable one and does nothing when tapped — only the cursor differs. |
| 6 | Recognition Rather Than Recall | 2 | Names, initials and the section counts are the right cues, but the largest object on the screen is a **326px square holding one letter**, and the testimony — the thing to recognise — began at y=835, below the fold. |
| 7 | Flexibility and Efficiency | 1 | No search, no year jump, no filter, no action per card. The only fast path is the two-view toggle. |
| 8 | Aesthetic and Minimalist Design | 2 | The Field Notebook voice is present — soft slate, a serif testimony, a quiet arc — but **310px of header (38% of the viewport)** plus a full-width letter tile meant the first screen of a wall of answered prayer showed **no answer at all**. |
| 9 | Error Recovery | 3 | A failed load gets `DataLoadError` with a retry. Nothing on the page can fail a write. |
| 10 | Help and Documentation | 2 | The subtitle explains the page in one sentence, which is more than most screens manage. Nothing says what the initial tile is, or that a card opens the person. |
| **Total** | | **20/40** | **A good page whose two headline facts were wrong and whose testimony was under the fold** |

## Design Specificity Verdict

**LLM assessment.** This is not a generic gallery. It is a *keepsake*: a portrait tile per person, the answer in Literata at 19px, the original burden in italics beneath it, and a single `asked Sep 2 · answered Oct 18` line that tells the story of the interval. The two-view toggle (“On our hearts” / “Answered”) makes the pair of prayer surfaces read as two halves of one record, and the group counts give the wall a ledger quality. On a desktop at 1440 it is genuinely handsome.

Where it drifts is the phone branch, and the cause is the usual one: **a second `.ans-` block appended to `src/index.css` overrides the first, and it references tokens that do not exist.** `--page-h1` and `--page-state` were never defined, so the h1 collapsed to 16px and the deck to body size. `.page-answered` — the scope every tone rule in the first block hangs off — is never emitted by `PageContainer`, so those rules are dead and the colours come from a global `.tone-*` instead. The component's own date handling then compounds it: `answeredAt` is written by the prayer controls as a **display string** (`Oct 18`), and `new Date('Oct 18')` is **2001** — so the wall's grouping and its count disagreed with the data.

**Deterministic scan.** `impeccable detect` is not installed here, so none was run. For the record, a detector would not have caught any of the three P0/P1 causes: an undefined CSS custom property, a date string parsed with the wrong grammar, and a `<div>` with an `onClick`.

**Visual overlays.** Live renders at 375×812 in English and Spanish, plus 1440×900 for regression. Dark mode was **not observed** — this app has no theme switch wired outside the Bible-study reader (`[data-theme]` is never set), so dark values are computed from tokens and marked unverified.

## Overall Impression

The page has a real idea — the answered prayer as an object you keep, not a row in a table — and the wall earns it on a wide screen. On a phone it opened with 310px of masthead, then a 326px square containing the letter “L”, and the first testimony began 23px *below* the bottom of the screen. The one date a reader comes for was a machine string. And the two numbers at the top — the year count and the section the answer sits in — were both computed with a date parser that misreads the app's own writes.

Every fix below is local: one date parser, one token ladder, one button, one media query. The wall itself is worth keeping.

## What's Working

1. **The arc.** `asked Sep 2 · answered Oct 18` on one hairline, the answer in the success tone, is the whole point of the page in eleven words. It survives a long testimony and it never wraps into a table.
2. **The keepsake card.** The answer is set in Literata at 19px/1.34 — the most readable prose on any list screen in the app — and the original burden sits under it in italic, so the reader sees *what was asked* without leaving the page.
3. **Names over handles.** The card leads with the person, an initial in the tone of the day, and falls back to “Whole Team” when the contact is gone rather than rendering an empty slot. The fallback worked on a deleted contact.
4. **Two views, one record.** “On our hearts / Answered” is a real pair: the same list, one page forward. The toggle is the fastest thing on the screen and it is in the first screenful.
5. **The group ledger.** “Recent answers 4” and a rule to the end of the line is a calm way to say *here is a year, cut in two*, and it is far better than a second heading level with no count.
6. **The empty state's copy, in both languages.** “As prayers are marked answered and testimonies are written, they will blossom here.” — the only place in this critique where the writing is better than the layout.

## Priority Issues

### [P0] The count and the grouping read the app's own dates as 2001
- **What**: the prayer controls write `answeredAt` as a **display string** — `new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })` → `"Oct 18"` (`src/components/landing/PrayerRows.tsx:32`, `:272`; `src/components/modals/ContactDetailsModal.tsx:604`). `AnsweredList` grouped with `new Date(p.answeredAt || p.updatedAt || p.date)`, and `new Date('Oct 18')` is **2001-10-18** in V8. So every answer recorded in the app fell into the `>90 days` bucket and out of the calendar-year count.
- **Measured**: seeded a prayer answered **two days earlier** in the app's own shape (`answeredAt: 'Oct 18'`, `date: '2026-10-20'`). The live page rendered the header as **“0 answered this year”**, the card under **“Earlier this year”**, and the card itself as `answered Oct 18`. With ISO-valued seeds the same page said “4 answered this year” and put them under “Recent answers” — so the page gave two different answers for the same kind of record depending on which client wrote it.
- **Why it matters**: these are the two facts the page exists to report — *how many this year* and *what is recent*. A ministry reading its own year of answered prayer was shown a number that was too low and a grouping that buried this week's answer with last year's.
- **Fix**: one parser, `parsePrayerDate()`, used for the group, the sort and the count so the three cannot disagree. It reads a stored `Mon D` display string in the current year (rolling back a year if that would put an answer in the future), reads a date-only ISO string as local midnight rather than UTC, and returns `null` for junk instead of `Invalid Date`. Verified live: the same seeded record now counts as **5 this year**, sits under “Recent answers”, and reads `answered Oct 18`. Seven unit tests, including the December-read-in-January rollover.

### [P1] The answer date was printed raw — and in English on a Spanish page
- **What**: the “answered” half of the arc was `{p.answeredAt || formatDate(p.answeredAt || p.updatedAt)}` — for a stored display string that prints whatever the writer stored; for a legacy ISO value it printed the whole machine string, measured live as **`answered 2026-10-18T09:15:00.000Z`**, 210px of green text. The “asked” half went through `formatDate`, which hard-coded `'en-US'`, so the Spanish page read **`preguntada Aug 19`** and **`preguntada Jun 30`**.
- **Why it matters**: the date is the heart of a testimony — “answered five days ago” is the good news. A timestamp is not a day, and an English month on a Spanish page breaks the one surface where a bilingual team reads together.
- **Fix**: both halves go through `Intl.DateTimeFormat(language, …)` — `Oct 18` in English, `18 oct` in Spanish — with the year shown only when it is not this year (`2 dic 2025`). Verified live in both locales. A `date`-only value no longer slips a day: `date: '2026-10-20'` used to print **“asked Oct 19”** west of Greenwich and now reads `asked Oct 20`.

### [P1] Every piece of orientation text was painted at 2.56:1
- **What**: `--text-mute` (`#A1A1AA`) carried the deck's count label, the group count, both dates, the inactive toggle option and the burden — and the count label applied a further `opacity: 0.7`. Measured on the card and the masthead: `.ans-dates` **2.56:1**, `.ans-group-count` **2.56:1**, inactive `.ans-toggle-opt` **2.56:1**, `.ans-count-l` **1.87:1** effective. WCAG AA needs 4.5:1; 1.87 is below even the 3:1 non-text floor.
- **Why it matters**: “when was this answered” and “which view am I on” are the two orientation facts on the page, and both were the least legible text on it.
- **Fix**: `--text-dim` (`#52525B`) throughout the answered block, and the extra opacity removed. Measured after: **7.03:1** on the card surface for every one of them. The `·` separator between the dates was `--border` on a `#F4F4F5` card (≈1.1:1, invisible); it is now `--text-dim` at half opacity.

### [P1] The page title rendered at 16px
- **What**: `.ans-h1 { font-size: var(--page-h1) }` and `.ans-sub { font-size: var(--page-state) }`, both tokens **undefined anywhere in the repo**. An invalid `var()` in `font-size` computes to `inherit`, so the `<h1>` measured **16px/16px** — exactly the body size — and the deck also measured 16px. DESIGN.md's Vocal Headline Rule: “a page where headings sit at the same weight as body copy fails the Ink standard”. The word “Answered” also appeared three times in the first 340px: as the eyebrow, as the title, and as the selected tab.
- **Why it matters**: the page had no visible title. On a phone the reader's first line was an 11.5px grey kicker, so the screen read as a section of something else rather than a destination.
- **Fix**: literal sizes (`clamp(24px, 6.4vw, 32px)` for the h1, 15px for the deck), and the eyebrow — which only repeated the title — is gone with its now-unused `.ans-eyebrow`/`.ans-lit` rules. Measured after: h1 **24px at 375**, **34px at 1440**, header down from **310px to 262px**.

### [P1] The first screen of the answered wall showed no answer
- **What**: `.ans-card .ans-photo { aspect-ratio: 1/1 }` made the portrait **326×326** at 375 — a full-width square containing one letter at 42% opacity — and the card body began at **y=795**, with the person's name at **811**. On an 812 viewport the first testimony started **23px below the fold**, and the name row was behind the bottom bar (`y=748`). The full card measured **584px**; six cards held **3,700px** in a 755px scroller.
- **Why it matters**: this is the wall of *answered* prayer. A reader opening it saw a heading, a number, a toggle, and a beige square. The photograph is a nice idea for a wall of real photographs; as an empty letter tile it is the largest object on the screen and it carries one character.
- **Fix**: below 560px the portrait is a **56×56** chip at the top-left of the card, the body follows at full measure, and the answer is 18px. Measured after: first card **289px**, first testimony at **y=536** — the whole first card, name, answer, burden and both dates, now sits above the bottom bar. The desktop wall is untouched (346×346 tiles, 3 columns, verified at 1440).

### [P1] The cards could not be opened by keyboard or screen reader
- **What**: `<article onClick={…}>` — no `role`, no `tabIndex`, no key handler. An accessibility snapshot reported the card as a plain `article` with `cursor=pointer`; a query for focusable elements inside the page returned **none**. The card's only job is to open the person, and that action did not exist for anyone not using a mouse.
- **Why it matters**: every testimony is a door to a person page — the place where a reader logs the follow-up or reads the story. On the screen where a keyboard user would most want to go deeper, nothing was reachable.
- **Fix**: the portrait is now a real `<button>` labelled with the person's name (56px on a phone), inside the same card, so a screen reader announces “Lila Chen, button” and Enter opens the same page the tap does. The whole card stays a pointer target. Measured: **6 focusable, named controls** in the content, one per card with a live contact.

### [P1] “Earlier this year” held answers from previous years
- **What**: the bucket is a rolling 90-day window, not a calendar year. The seeded wall put a **December 2025** answer and a **June 2025** answer under a heading that said “Earlier this year”, while the header counted a calendar year — two different time models, 40px apart, one of them mislabelled.
- **Why it matters**: a testimony's year is part of the testimony. Filing 2024's answer under “this year” makes the archive read as shorter than it is.
- **Fix**: the group is “Earlier answers” (`answered.earlier_answers`, `Respuestas anteriores`), which is true of a rolling window; the year is now printed on any date that is not this one (`2 dic 2025`), so the reader can see the boundary the heading no longer claims.

### [P2] The view toggle was a 31px target with a 6% tint
- **What**: the options measured **117×31** and **91×31**; the selected one was `background: var(--accent-soft)` (a 6% ink wash) with dim text, and the selected option was a `<button>` with no handler and no `aria-current` — a dead control that looked pressed.
- **Why it matters**: DESIGN.md's Inversion Rule is explicit — selection is solid ink inversion, “never a faint 6% tint” — and this is the only navigation on the screen.
- **Fix**: the selected option inverts (measured **#FFFFFF on #0A0A0B, 19.79:1**), both options grow to 35px with a 44px minimum on a coarse pointer, and the active one carries `aria-current="page"`.

### [P2] Card and empty state sat off the radius ladder
- **What**: cards were `border-radius: 20px` with a `1px solid #F0F0F2` border; DESIGN.md's Card is **24px, borderless** (“restful, borderless surfaces”, separation by fill). The empty state was a **40px** box with a 60%-alpha border, larger than the cards it stood in for.
- **Why it matters**: the ladder is the system's most visible rule (Shell 32 → Card 24 → Panel 14 → Control 10); a card that is 20px with a border reads as a sub-container, not a card.
- **Fix**: 24px borderless cards, 24px empty state, no border. Verified at 375 and 1440.

### [P2] Back from a person leaves the page instead of closing it
- **What**: tapping a card renders `<ContactDetailsModal>` from local state; the URL stays `/answered`. The phone's Back then pops to `/` (the previous route), and the person is gone with the page. Measured: Back from an open “Lila Chen” → `location.pathname === '/'`.
- **Why it matters**: the same trap the Messages pass fixed (#1764) for conversations — on iOS the Back swipe is the only way out of a detail, and here it costs the reader their place in the wall.
- **Fix**: **none in this pass.** The detail is a shared full-page modal owned by ContactDetailsModal and the shell; turning it into a route moves every list that opens a person. Filed as **#1823**.

### [P3] Dead CSS and a broken-photo glyph
- **What**: the tone rules in the first `.ans-` block are scoped to `.page-answered`, a class `PageContainer` never renders, so they have never applied; `.ans-featured*` styles a “most recent” hero the component does not render; `image-slot` selectors survive a control that is gone. An answer photo with no download URL renders a **16px broken-image glyph** inside a 64px bordered box.
- **Fix**: the glyph now has an accessible name (`Photo`) and the border follows the control radius. The dead selectors are left in place — they are another pass's cleanup, and the scoping bug is noted here so it is not rediscovered.

## Persona Red Flags

- **Alex (Full-timer, between meetings)**:
  - *“Did anything get answered this year?”* — the header said **0** and the newest answer was under “Earlier this year” (fixed).
  - *“When was this?”* — the date was a timestamp in the loudest colour on the card (fixed: `answered Oct 18`).
  - *“What am I even looking at?”* — 310px of header then a 326px empty square; the first testimony was below the fold (fixed: first card complete above the bar).
  - *“Which view am I in?”* — the selected tab was a 6% wash at 2.56:1 (fixed: inverted).
  - *“Back should close this person”* — Back leaves the page (filed).
- **Jordan (Student, Spanish-first)**:
  - *“Aug 19”* and *“Jun 30”* on an otherwise Spanish page (fixed: `18 oct`, `2 dic 2025`).
  - *The whole page in Spanish, the month names in English* — the same `'en-US'` formatter, one root cause (fixed).
- **Sam (screen reader / keyboard)**:
  - *No way in*: zero focusable elements in the content; every card was an `article` with a click handler (fixed: a named 56px button per card).
  - *“answeredthisyear”* — the count label's `<br/>` joined two words with no space (fixed).
  - *No headings to jump by*: the group labels were `<div>`s, so the page announced one `<h1>` for six cards (fixed: both groups are `<h2>`).
  - Still true: the portrait button duplicates the name that is printed immediately below it (“Lila Chen, button … Lila Chen”), so a screen reader hears the person twice per card. Fixing it properly means moving the name inside the button, which changes the card's visual order — a decision for a human.

## Minor Observations

- The group counts (`4`, `3`) are a nice ledger touch, but they duplicate the header's `answered this year` for the recent bucket and disagree with it for the other — the header counts the calendar year, the group counts a 90-day window. Two time frames on one screen, both now labelled honestly, still worth unifying.
- “Whole Team” cards are inert but look tappable (only the cursor differs). A non-interactive card with a *deleted* contact is honest — there is nowhere to go — but it should not carry the hover lift.
- The deck is three lines at 375 (72px) and says the same thing twice (“a record of the prayers … every one of them a small testimony”). One sentence would buy 24px back.
- `.ans-count-n` at 40px in success green is the loudest element in the masthead — louder than the title. On a page whose title is now 24px, the number reads as the page's subject, which may be exactly right, but it is the last hierarchy question here.
- Literata is used for the h1, the group labels, the testimony and the initials, against DESIGN.md's Scripture Exclusivity Rule. It is the app's established voice across every screen (noted in the prayer and messages reports), so it is recorded, not changed.
- The note FAB (`48×48` at `311,684`) overlaps the right end of the date row on any card that reaches the bottom bar — global chrome, tracked at #1785.
- The page renders a skeleton only on the very first snapshot; a slow re-subscribe shows the previous list with no indication. Same class of issue as the home page, not measured here.

## Questions to Consider

- **Should a Trainee be able to open this page?** Students and Community can; Trainees cannot, and `/answered` lives in the same `Prayer` nav group as `/prayer`. If the answer to #1794 is “yes, Trainees carry the team's burdens”, this route needs to move with it; if it is “no”, then a Trainee also cannot read the testimonies that came out of the team's shared list, which is a different and larger product statement. Filed as **#1822** rather than decided here.
- **Should “answered” be a stored date or a stored string?** `answeredAt` is currently a display string written by three call sites, which is why this page had to grow a parser with a rollover rule. Storing ISO (or a Firestore timestamp) and formatting at the edge would delete that class of bug for every future reader. That is a data decision for #1691's neighbourhood.
- **Does the wall want a filter or a year jump?** Six testimonies is a page; sixty is an archive. The group headings are the natural pivot, but there is no way to jump to 2025 today.
- **Is a portrait tile right for a person with no photo?** On desktop it is a beautiful placeholder inside a wall of real photographs. On a phone, a 56px chip is honest and cheap. A future pass could let a testimony's *answered photo* take the tile when there is one, which is what the seeded data wanted.

## What this pass changed (same PR)

- One date parser drives the group, the sort and the year count, so an answer recorded in the app counts as this year and lands under “Recent answers”.
- Both dates are formatted in the reader's language, with the year only when it differs; date-only values no longer slip a day.
- Every muted line in the answered block is at 7.03:1; the date separator is visible.
- The page title is 24px at 375 (34px at 1440), the duplicated eyebrow is gone, and the header is 262px instead of 310px.
- On phones the card leads with a 56px portrait and 18px prose: the first testimony is on the first screen, and the whole card fits above the bottom bar.
- Each card carries one named, focusable control that opens the person.
- The second group is “Earlier answers” (`Respuestas anteriores`) and shows the year on any out-of-year date.
- The view toggle inverts, is 35px (44px on a coarse pointer), and marks the active option with `aria-current`.
- Cards and the empty state follow the 24px borderless card ladder; the empty state is 292px and clear of the bottom bar.
- Three locale keys added next to the existing `answered.*` keys (`earlier_answers`, `recently`, `photo`) in both locales; one removed (`earlier_this_year`).

**Unverified**: dark mode (no theme switch is wired in this app — the fixed tokens `--text-dim` / `--panel` / `--bg` resolve per theme, and the inverted toggle is deliberately `--text` on `--bg`, but the rendered dark result was not seen); the coarse-pointer 44px toggle (headless Chrome reports `pointer: fine`, so the rule was inactive during measurement); VoiceOver's reading order over the new portrait buttons; and the iOS Back swipe from an open person (the headless Back already leaves the route, and the fix is filed, not shipped).
