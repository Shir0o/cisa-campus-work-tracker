---
target: /, /around, /visits, /bible-study, /bible-study/:meetingId, /suggestions (Full-timer, 375x812)
total_score: 23
max_score: 40
na_heuristics:
p0_count: 1
p1_count: 10
target_identity: "file:/Users/twang/cisa-campus-work-tracker/.worktrees/issue-1776/src/views/MyDayMobile.tsx"
timestamp: 2026-10-24T21-18-51Z
slug: src-views-landings-fulltimer-at-375x812
score_map:
  /: 21
  /around: 25
  /visits: 20
  /bible-study: 24
  "/bible-study/:meetingId": 16
  /suggestions: 27
---

⚠️ DEGRADED: single-context (no sub-agent tool in this session; one assessor read all six sources, then measured the live renders at 375×812). Every number below is measured, not estimated; computed values are labelled.

> **Editor's note — scope corrected (#1862).** `/suggestions` is not a Full-timer surface and should not have been included in this pass. Only the app owner reads or settles the **Suggestion queue**: `SuggestionsQueue` redirects every other account to `/`, and `firestore.rules` gates `interactionSuggestions` on `isSuperAdmin() && isOwner(userId)`, because the suggestions name people from that one person's private life (ADR 0037 decision 3; `CONTEXT.md` "Suggestion queue"). The sixth row is left below **as measured, for the record**, but it is out of scope for this critique and for the Full-timer design overhaul. The owner gate is deliberate, not a defect, and there is no page-level work on it. Decision on #1862: it stays owner-only.

# Critique: the Five Full-timer Screens at 375×812

Target: `/` (`src/views/landings/Landing.tsx` → `MyDay.tsx` → `MyDayMobile.tsx` for the `admin` role), `/around` (`src/views/AroundTheTeam.tsx`), `/visits` (`src/views/Visits.tsx` → `VisitsMobile.tsx`), `/bible-study` (`BibleStudyIndex.tsx`), `/bible-study/:meetingId` (`BibleStudyEditor.tsx`), `/suggestions` (`SuggestionsQueue.tsx` — **out of scope: owner-only surface**, see the editor's note). Signed in as `fulltimer.e2e@example.com` at 375×812 against the seeded emulator, on the branch that is this pass's PR.

## Per-screen scores

The set's `total_score: 23` is the **Health Score table below**, not the mean of these six. They are different surfaces with different jobs; averaging one number across them hides which one is broken.

| # | Screen | Route | Score | Headline defect |
|---|--------|-------|-------|-----------------|
| 1 | Full-timer home (`MyDayMobile`) | `/` | **21/40** | 4,793px of page in a 755px window — 6.3 screens. "On you" starts at y=2166, 2.9 screens down, behind five trainee questions (1,691px). The greeting said **"Good morning"** at 14:00 and the first sentence read **"1 prayers"**, both fixed here. |
| 2 | Around the team | `/around` | **25/40** | A 2025 row was dated **"Wednesday, December 31"** with no year, on a phone in October 2026; the teammate filter was a **22px** `<select>` sitting inside a 40px pill. Both fixed here. |
| 3 | Visits | `/visits` | **20/40** | The reading is a **640px** twelve-month grid inside a **320px** scroll window: the "since" column and every dot sit off-screen, and Dec–Oct are the only months you can see. The page also printed the same sentence twice, fixed here. |
| 4 | Bible study weeks | `/bible-study` | **24/40** | **No page title at all** — zero `<h1>` in the DOM, and the screen opens on an admin "ENTRY POINT" card rather than the week you came to open. Title added here. |
| 5 | Bible study editor | `/bible-study/m-romans-wk1` | **16/40** | **The header collapsed.** The meeting-title input measured **16px wide**, and the date, Save and Unpublish were painted over the breadcrumb on one line. Fixed here; it now measures 343px on its own row. |
| 6 | Suggestion queue | `/suggestions` | **27/40** | **Out of scope — owner-only surface, see the editor's note.** The cleanest of the set, and the one the brief's Full-timer **cannot open**: the route redirects to `/` unless `user.email === yilongwang05@gmail.com`. Measured empty; the populated card is unreachable in the emulator (see Method). |

## Design Health Score

Scored for the set, each cell naming the screen that drives it.

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | **Editor**: the title input was 16px and the actions sat on top of the "Published" breadcrumb, so the header told you nothing about what you were editing. **Home**: it greeted a 14:00 reader "Good morning" (fixed). **Around**: the header pill read "8 to work through" while eight cards each carried a "Reviewed" button — consistent only if you know ADR 0022 made the button an action, not a state. |
| 2 | Match System / Real World | 3 | The vocabulary is genuinely this ministry's — "Your sheep", "Who we haven't seen", "Questions for the team", "One code, every week". Set against: **"1 prayers"** (fixed), **"Wednesday, December 31"** for a ten-month-old date (fixed), and "No Email" / "No Owner" as people's names in the seeded data. |
| 3 | User Control and Freedom | 2 | **Editor**: you could not edit the week's title at all on a phone — the field was 16px of a 343px row. **Visits**: the 12-month reading is a horizontal scroll with no affordance, visible scrollbar or hint, inside a shell whose `main` is `overflow-x-hidden`. |
| 4 | Consistency and Standards | 2 | The same kind of control has five different heights across the set: AskStack's "Answer" 30px, "Mark scanned" 24px, WorklistCard's actions 44px, /around's teammate select 22px, and SectionHead links 16px. Page titles are 32px on Visits, 30px on Suggestions, 24px on Around and Weeks — and absent on the weeks page. |
| 5 | Error Prevention | 3 | Deleting a week is two deliberate steps with "This can't be undone"; the editor autosaves at 800ms and shows "Saving…/Saved · just now/Couldn't save"; /visits' delete is in a menu behind a row. Nothing destructive is one accidental tap away on any of the six. |
| 6 | Recognition Rather Than Recall | 2 | **Weeks**: the study code is on screen but the page never names itself. **Visits**: the column that answers "how long since we sat with them" is the one scrolled off-screen. **Home**: the "On you" question is clamped to two lines at 12px, so you must open the person to read the thing you are being asked (fixed on phone). |
| 7 | Flexibility and Efficiency | 2 | One path per task on every screen. The phone's only accelerators are /around's URL-backed filters and the home's two hero buttons; there is no bulk select, no keyboard shortcut surfaced, and no "mark all" on /visits. |
| 8 | Aesthetic and Minimalist Design | 2 | **Home** is the offender: 4,793px, with the reader's own work (On you, On the horizon, Your sheep) all below 2,100px. **Visits** repeated its header sentence verbatim (fixed) and **Weeks** repeats the current week in two stacked cards ("WHAT A SCAN OPENS RIGHT NOW" then the week row). |
| 9 | Error Recovery | 3 | `DataLoadError` on load, `UndoSnackbar` on /around's Reviewed and on the queue's dismiss, and a visible save failure in the editor. A failed /visits write only reaches the global handler. |
| 10 | Help and Documentation | 2 | The empty states are honest ("No homes yet — a home is a household we go round to…", "Nothing waiting."), and ADR 0031's reading explains itself in one sentence. Nothing explains what BNPB is on /suggestions, and nothing says "Reviewed" is a state *you* set. |
| **Total** | | **23/40** | **Acceptable — two screens are actively broken at this width; the rest are good bones with unfinished phone layouts** |

## Design Specificity Verdict

**LLM assessment.** Four of these six could not be another product. The home is built around a named season and a circle ("You're caring for 8 people this season"), and its units are the ministry's own — sheep, prayers, gatherings, the board. `Visits` is a household reading, per person, under a home's name, which is a model only ADR 0031 could produce. `Around the team` is the team's activity, filtered by YP/Campus/whole-team and dated by when the team touched someone. The editor is a markdown week with an entry-point code that "never changes". That is a point of view, and it is why the set reads as one product even where it breaks.

The phone layouts, though, are the desktop pages with the same components allowed to wrap. That is specific to *when* this was built, not to the product: the editor header is `flex … flex-wrap` and wraps into an overlap; Visits' table is `overflow-x-auto` and pretends a 12-column year fits a 320px window; the home stacks every section the desktop shows side by side and becomes 6.3 screens. The design has a voice; the phone has not been given its own composition.

**Deterministic scan.** `impeccable detect` is not installed in this worktree (`scripts/impeccable` absent), so no CLI scan was run. Every finding below comes from the live DOM at 375×812 and from the six sources.

**Visual overlays.** None. One live render per screen on the seeded emulator at device scale 1, English; dark mode was not observed (unverified), and Spanish was checked only where a fixed string could be wrong (locale keys exist for both).

## Overall Impression

The home is the one every full-timer opens first, and on a phone it is the weakest thing in the set: the wrong time of day, a false plural, and 2.9 screens of other people's questions before the reader's own work begins. None of those is hard to fix — one is a one-line key lookup — but together they make the first screen feel unattended.

The genuine breakage is the Bible-study editor, where a header that wraps on a laptop silently collapses on a phone: the title field is 16px wide and the controls land on top of the breadcrumb. That is the kind of defect a screenshot catches in one second and a test suite never will.

The good news is that the *systems* are sound. ADR 0022's one Reviewed state agrees with the page's own count (both read 8 in this run), ADR 0031's reading is the right model, and the empty states tell the truth. This pass fixed one P0 and nine P1s without touching a single permission or model.

## What's Working

1. **Around the team's card.** Name, kind chip, Talked chip, team, relative time, the phrase line, then two words ("Reviewed", "Comment") and two icons on a 44px row. It is the only screen in the set where every action is already thumb-sized, and the New/All + team + teammate filter row is URL state, so a teammate can send you `?team=yp` and it holds.
2. **The pointer card's promise.** ADR 0015 decision 4 says the pointer can never disagree with the page; measured, the card on `/` said "8 to work through" and `/around`'s pill said "8 to work through". It holds.
3. **Visits' model, and its empty state.** "No homes yet. A home is a household we go round to — add the first one, and this page becomes the roster that replaces the spreadsheet." One sentence, one button, and it tells a new full-timer exactly what the page is for.
4. **The editor's body.** A 341×457 textarea with 44px Insert/Prompts targets region, autosave that says what it is doing, and the published state visible. Once the header stacks, the working half is fine.
5. **#1799's "Needs you today" link.** Checked: `apps/mobile/src/components/ft/NeedsYouToday.tsx` passes a plain string, never `onLink`, and `Widget`'s `Sech` renders a link with no handler as plain text (`Widget.tsx`, "A link with nowhere to go reads as a plain line"). It points nowhere by construction — no dead route.

## Priority Issues

### [P0] The Bible-study editor's header collapsed at phone width
- **Screen**: `/bible-study/:meetingId` (`src/views/BibleStudyEditor.tsx:452`)
- **What**: the header was `flex items-center justify-between gap-4 flex-wrap` holding a `min-w-0 flex-1` title block and a second row of date (138px) + Save (63px) + Unpublish (94px) — 311px of controls plus a 16px gap in a 343px container. `flex-1` therefore shrank the title block to **16.1px**, and because the actions row did not wrap it drew over the breadcrumb. Measured: title input **16×21** with value "Peace that holds"; the visible result was a stray "Pe" at the left edge and "All we… / Open the study / …ed" behind the date picker.
- **Why it matters**: the week's title is the one field that names the record. On a phone it could not be read, let alone edited, and the header — the only place that says which study and whether it is published — was illegible.
- **Fix**: stack the header below `lg` (`flex-col lg:flex-row lg:items-center`). Measured after: the title input is **343×21** on its own row, the breadcrumb truncates to "Study: romans…", and date/Save/Unpublish share the row underneath.
- **Suggested command**: `/impeccable adapt`

### [P1] The home greeted a 2pm reader with "Good morning" — and did it in English in Spanish
- **Screen**: `/` (`src/views/MyDayMobile.tsx`), shared helper `src/components/landing/helpers.ts`
- **What**: `MyDayMobile` rendered `t('myDay.good_morning')` unconditionally. The desktop (`MyDay.tsx`) and the trainee landing call `getGreeting()`, which is time-aware but English-only; only the phone had the hard-coded key. Measured at 14:00 PDT: "Good morning, Full-timer."
- **Why it matters**: the first line on the first screen of the day, and it was wrong for two thirds of it. In Spanish the same key is the only localized greeting, so an evening reader would get "Buenos días".
- **Fix**: a pure `greetingKey(now)` (`myDay.good_morning|good_afternoon|good_evening`) next to the existing `getGreeting()`, used by the phone; `good_afternoon` / `good_evening` added to `en.json` and `es.json` beside `good_morning`. Measured after: "Good afternoon, Full-timer."
- **Suggested command**: `/impeccable clarify`

### [P1] "You're caring for 8 people … 1 prayers to pray for"
- **Screen**: `/`
- **What**: the sentence interpolated three counts into fixed plurals (`myDay.caring_for`: "{people} people … {tasks} things … {prayers} prayers"). A full-timer with exactly one held prayer read **"1 prayers"** — measured on the seeded account, which holds one.
- **Why it matters**: it is the summary sentence of the page; a false plural in it reads as a machine talking, on a page whose whole voice is personal.
- **Fix**: three unit placeholders chosen by count — `{peopleUnit}`, `{tasksUnit}`, `{prayersUnit}` — with `unit_person/unit_people`, `unit_task/unit_tasks`, `unit_prayer/unit_prayers` in both locales. Measured after: "You're caring for 8 people this season — 0 things to follow up on, 1 prayer to pray for."
- **Suggested command**: `/impeccable clarify`

### [P1] "On you" clamped its body to two lines on a phone
- **Screen**: `/`, `/around` (shared `src/components/landing/WorklistCard.tsx:423`)
- **What**: the interaction body always carried `line-clamp-2`. That clamp exists so collapsed cards tile evenly in the desktop three-up grid; a phone stacks one card per row, so it only hid text. Measured on the seeded card: "Should we invite her to the small group dinner next Tuesday?" rendered two lines in a 48px box and cut the question off.
- **Why it matters**: the card's body is the question you are being asked to answer. Truncating it makes the action a guess.
- **Fix**: `!mobile && !stripOpen && !noteExpanded`. Desktop still clamps and still unclamps on tap (existing tests pin both).
- **Suggested command**: `/impeccable adapt`

### [P1] The home's question controls were 16–30px tall
- **Screen**: `/` (`src/components/landing/AskStack.tsx`)
- **What**: measured "Mark all scanned" **101×16**, "Answer Zion" **119×30**, "Answer Caleb" **126×30**, "Mark scanned" **107×24** — 5 answers plus 6 mark controls on the seeded page, all below the 44px floor. The same component renders on desktop, where compact is correct.
- **Why it matters**: these are the reader's main actions on the trainee questions, used one-handed. The sibling WorklistCard already used `min-h-11` on mobile; AskStack did not.
- **Fix**: `min-h-11` on all three controls when `mobile` (the prop AskStack already receives), measured after: 44px each.
- **Suggested command**: `/impeccable adapt`

### [P1] The home's date eyebrow was 2.33:1
- **Screen**: `/` (`src/index.css:978`, `.mdm-eyebrow`)
- **What**: "Saturday, October 24" rendered at **12.5px in `--text-mute` (#A1A1AA) on `#F4F4F5` — 2.33:1** (computed). AA needs 4.5:1.
- **Why it matters**: it is the only thing that dates the page, and it is the least legible text on it — the same failure the prayer list had in its byline.
- **Fix**: `--text-dim` (**7.03:1**, the token the body line already uses).
- **Suggested command**: `/impeccable colorize`

### [P1] Visits printed the same sentence twice and named the section twice
- **Screen**: `/visits` (`src/components/visits/WhoWeHaventSeen.tsx:144`)
- **What**: the page header said "Going to where someone lives says something a coffee can't."; 140px later the reading repeated the sentence beside an `<h2>Who we haven't seen</h2>` — under a tab that already said "Who we haven't seen". Measured: the sentence appeared twice on one screen.
- **Why it matters**: the reading is the page's job, and it opened with two lines of déjà vu before the first home.
- **Fix**: on `compact`, drop the h2 and the repeated sentence; keep the one explanatory blurb. Measured after: one occurrence, and the tab is the section's name.
- **Suggested command**: `/impeccable distill`

### [P1] A 2025 row was dated as if it were next Wednesday
- **Screen**: `/around` (`dayLabel`)
- **What**: the day headings used `toLocaleDateString` with weekday/month/day and no year. Measured on 2026-10-24: a row from **2025-12-31** was headed **"Wednesday, December 31"** — a date that reads as upcoming. A September 2025 row read "Friday, September 19".
- **Why it matters**: Around is paged by *when the team touched someone*; the date is the ordering. Without a year, old activity looks new.
- **Fix**: append the year when the row is not from the current year. Measured after: "Wednesday, December 31, 2025".
- **Suggested command**: `/impeccable clarify`

### [P1] The teammate filter was a 22px control inside a 40px pill
- **Screen**: `/around`
- **What**: the `<select>` measured **174×22** inside a `h-10` label. The label focuses the select; it does not open it, so the real target was the 22px strip. The team chips beside it were 32px.
- **Why it matters**: this is the filter a full-timer uses to find one teammate's activity; `pointer: fine` in headless under-reports the problem, a thumb does not.
- **Fix**: `h-full` on the select (38px inside the 40px shell) and `min-h-11` on the New/All segment and the team chips. Measured after: select 38px, every chip 44px.
- **Suggested command**: `/impeccable adapt`

### [P1] The Bible-study weeks page had no title
- **Screen**: `/bible-study`
- **What**: the DOM contained **zero `<h1>`**. The first element on a phone was the "ENTRY POINT" admin card; the week list began at y=437 under a 12px "WEEKS · 1".
- **Why it matters**: a screen with no name is a screen assistive tech cannot announce and a reader cannot place; it is also the only page in the six with no visible title (Visits 32px, Suggestions 30px, Around 24px).
- **Fix**: an `<h1>Bible study</h1>` above the grid. Measured after: h1 at y=73, above the entry-point card. (No study subtitle: the entry card 20px below already reads "Romans · Fall 2026", and repeating it was noise.)
- **Suggested command**: `/impeccable typeset`

### [P1] The Visits reading is a 640px table in a 320px window (filed, not fixed)
- **Screen**: `/visits` (`WhoWeHaventSeen` → `HomeBlock`)
- **What**: each home renders `min-w-[640px]` — a 140px person column plus twelve 28px month columns plus "since" — inside an `overflow-x-auto` wrapper that is **320px** wide. Measured: **95 elements** past the right edge of the 375px viewport. What you see is Nov→Oct; the "since" column, the visit dots and September–October's context are off-screen.
- **Why it matters**: the reading's entire question is "how long since we sat with this person", and that column is the one that does not fit. ADR 0031 decision 4 forbids reordering to compensate, so the fix is a phone composition (a shorter window, or a per-person row), not a scrollbar.
- **Fix**: **none in this pass** — changing the window to six months changes what "never" means under ADR 0031 decision 2/3, which is a design decision. Filed as **#1857** with the measurements.
- **Suggested command**: `/impeccable layout`

### [P2] The home puts other people's work before the reader's own
- **Screen**: `/` — five trainee questions occupy y=475→2166 (1,691px); "On you" starts at 2166. ADR 0015 calls My Day "a skim dashboard of *your own* work". Filed as **#1859**; options are in the issue (a one-line count, a one-card cap, or a collapsed section).
- **Suggested command**: `/impeccable layout`

### [P2] The home's section links and prayer pills are still sub-44px
- **Screen**: `/` — "Your contacts" 99×16 (×2), "Full calendar" 78×16, prayer status pills 25px, "for {name}" 20px, "Prayer Log" 17px. The prayer page already solved this with a coarse-pointer rule; the home rows never got it. Filed as **#1858**.
- **Suggested command**: `/impeccable adapt`

### [P2] Around reads "8 to work through" over "Nothing here is waiting on you"
- **Screen**: `/around` — both are true (the team's work is not yours) but they sit 60px apart and read as a contradiction. One of the two lines should carry the distinction, not both.
- **Suggested command**: `/impeccable clarify`

### [P2] Weeks says the current week twice
- **Screen**: `/bible-study` — "WHAT A SCAN OPENS RIGHT NOW → Peace that holds, Sat, Oct 24" sits directly above the week row "01 Peace that holds · Sat, Oct 24 · 4 sections · publ…", and the row's meta is truncated by the "Live now" pill. Filed as **#1860**.
- **Suggested command**: `/impeccable distill`

### [P2] The editor's toolbar and breadcrumb are 16–26px
- **Screen**: `/bible-study/:meetingId` — "All weeks" 16px, Insert 26px, Prompts 26px, Bold/Italic 24×24, Save/Unpublish 34px; and the title input has no accessible name (placeholder only). Filed as **#1861**.
- **Suggested command**: `/impeccable adapt`

### [P2] The suggestion queue is owner-only
- **Screen**: `/suggestions` — `isAppOwner` matches one email; the brief says Full-timer. Filed as **#1862** as a decision, not a defect.
- **Suggested command**: `/impeccable clarify`

### [P3] Small type below the caption floor
- **Screens**: `/` (11px "No answer yet…", "EVERYTHING ELSE"), `/visits` (10px month labels and "person"), `/bible-study` (10px week number, 10.5px eyebrow). 10px is below DESIGN's caption floor and is the same token weight as the labels above it.
- **Suggested command**: `/impeccable typeset`

### [P3] Data-quality names read as names
- **Screens**: `/around`, `/` — "No Email", "No Owner", "Old Caregiver" are seeded contact names from the legacy fixtures. Not a layout defect, but they make every screenshot of the page look broken; the fixtures should read as people.
- **Suggested command**: `/impeccable harden`

## Persona Red Flags

- **Casey (distracted mobile user, one thumb, walking between meetings)**:
	- *Home*: 6.3 screens, and the reader's own work starts 2.9 screens down; the two hero buttons ("The board", "Pray together") are the only things above the fold that do anything for *them*.
	- *Home*: "Mark all scanned" 16px, "Answer" 30px, section links 16px — 22 controls under 44px after this pass's fixes (was 28).
	- *Editor*: opened with a 16px title and controls drawn over the breadcrumb (fixed).
	- *Visits*: the column that matters is off-screen, and nothing says the table scrolls.
- **Sam (VoiceOver / keyboard, 200% zoom)**:
	- *Weeks*: no `<h1>` — the page announces nothing when it loads (fixed).
	- *Editor*: the title input had no `<label>` and no `aria-label`, only a placeholder; the breadcrumb links are 16px tall; B/I are 24×24.
	- *Home*: the WorklistCard's header button announces the whole card as one string (person, chips, phrases, question) — verbose, but it reaches the right place.
	- *Visits*: the month grid is a visual table with no `role="table"`, so 12 month columns read as a run of bare words.
- **Jordan (new staff, Spanish-first)**:
	- *Home*: the greeting was English at any hour in Spanish until this pass; the summary sentence now pluralises per count in both locales.
	- *Around*: "Reviewed" is an action, but reads as a state — a Spanish-first reader has no way to know the difference and ADR 0022 chose the word deliberately.
	- *Visits*: "never been round" / "person / Nov…Oct / since" is dense domain language with no glossary.
- **Alex (power user)**:
	- *Around*: the filter row is the one fast path and it is good — URL state, team chips, teammate select.
	- *Weeks*: the row you want ("Peace that holds") sits below two admin cards; the ⋯ menu is 32px and the row's own tap target is 44px.
	- *Suggestions*: **unreachable** for a Full-timer — it redirects to `/` unless the account is the app owner's.

## Minor Observations

- **Home order.** Five trainee questions occupy y=475–2166 in 1,691px. ADR 0015 makes My Day "a skim dashboard of *your own* work"; on the phone the first 2.9 screens are other people's. Not changed — it is a hierarchy decision, not a bug (follow-up filed).
- **Home density.** 4,793px in a 755px scroller. Four full-width sections (horizon, sheep, week, prayers) each carry a 44–64px header row above a card.
- **Home section links** ("Your contacts" ×2, "Full calendar") are 16px, and the prayer status pills are 25px — the same class of defect as the AskStack fix, in a different component (`PrayerRows`/`SectionHead`). Follow-up.
- **Weeks repeats the current week**: "WHAT A SCAN OPENS RIGHT NOW → Peace that holds, Sat, Oct 24" sits directly above the week row "01 Peace that holds · Sat, Oct 24 · 4 sections · published".
- **Weeks clips its meta**: "Sat, Oct 24 · 4 sections · publ…" — the publish word is truncated by the "Live now" pill, so the row says it twice and finishes neither.
- **The editor's toolbar** is untouched: Insert 76×26, Prompts 90×26, B and I 24×24, "All weeks"/"Open the study" 16px.
- **Around's copy tension**: "8 to work through" in the header and "Nothing here is waiting on you" in the sub-line, 60px apart. Both are true (it is the team's work, not yours), but they read as a contradiction.
- **Around's "Reviewed"** is an action label chosen by ADR 0022; it reads as a status. Not changed.
- **Suggestions' empty state** is a title, a one-line sub and "Nothing waiting." — no explanation of what BNPB is or how suggestions arrive.
- **Visits' tabs** are 32px and "Manage homes" 36px; "Add a home" 40px.
- **Visits seeded empty.** A fresh `npm run seed:emulator` has no `homes`, so the page opens on "No homes yet". This pass added two homes directly to the emulator to measure the populated reading; that is a seed gap, not a design defect.
- The **"Leave a note" FAB** overlaps the last card's action row on /around and /visits — global chrome, tracked as #1785.

## Questions to Consider

- **Should the home lead with the reader's own work?** On the phone the five trainee questions come before "On you", "On the horizon" and "Your sheep". ADR 0015 says My Day is a skim dashboard of your own work, and it is not, on the screen where skimming matters most.
- **Is a 12-month grid the right phone reading for Visits?** ADR 0031 chose twelve rolling months and no filters so that gaps read by visual weight. On a 320px window the weight is off-screen. A six-month window with an explicit "since" column is still a weight reading — but it changes what "never" means, so it needs the same mockup treatment ADR 0031 got.
- **Should "Reviewed" become "Mark reviewed"?** ADR 0022 deliberately chose the past-tense label on the card's button. It costs one moment of doubt on every card, on the page whose whole job is working through cards.
- **Who is the suggestion queue for?** The brief says Full-timer; the route says the owner's email. Either the nav should not show it to the team (it does not), or the brief is wrong.

## Method and limits

- One dev server, one seeded emulator, one browser tab, English, device scale 1, `innerWidth 375 / innerHeight 812`. Data changed under the browser during the pass (the parallel agent seeded contacts); counts quoted here are the ones measured at the timestamp above.
- `/visits` had no homes in the seed. Two homes (`the Adeyemis`, `the Owusu house`) were written to the Firestore emulator to render the populated reading; they are emulator-only and die with it.
- `/suggestions` is owner-gated. An owner account was created in the emulator Auth + `users` doc to open the page, but its `interactionSuggestions` list is denied by the security rules (`false for 'list'`), so only the **empty** queue was measured. The populated card is unverified — the one finding there is the gate itself.
- Dark mode unverified; Spanish verified only at the locale-key level. The editor has no h1 at all *by design* (it is a document editor), so its heading gap is not counted twice.
