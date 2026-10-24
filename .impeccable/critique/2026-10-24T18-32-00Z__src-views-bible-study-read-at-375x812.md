---
target: /bible-study/read (src/views/BibleStudyRead.tsx → src/components/bibleStudy/StudyReaderView.tsx at 375x812)
total_score: 22
max_score: 40
na_heuristics:
p0_count: 1
p1_count: 3
target_identity: "file:/Users/twang/cisa-campus-work-tracker/.worktrees/issue-1770/src/views/BibleStudyRead.tsx"
timestamp: 2026-10-24T18-32-00Z
slug: src-views-bible-study-read-at-375x812
---
⚠️ DEGRADED: single-context (no sub-agent tool in this session; one assessor read the source and then measured the live render). Every number below is measured on the seeded emulator at 375×812 in Chromium (device scale 1), not on a mock.

# Critique: This week's study — a Trainee opening the study in the room, at 375×812

Target: `/bible-study/read`, signed in as **Trainee** (`trainee.e2e@example.com`, role `manager`), at **375×812**, on the dev server against the local emulator. A Trainee *is* allowlisted (`src/lib/permissions.ts:82`, `allowedTraineeRoutes` line 172), and the route opened straight to the reader — no permission question needed. Shell defects are out of scope and were not re-reported (phone shell #1795, note FAB #1785, nav bell #1779); where they intrude on this page they are named once and dropped.

This is a **Read** surface, and this app has two of them: `/s/:slug` (a student scans a QR) and this one (a signed-in Trainee opens the same week). They share `StudyReaderView` by design (ADR 0014 §11 — "the preview cannot lie"), and the public side was critiqued four hours earlier. Findings below are this route's own; the sibling's scroll-snap trap, shattered prose and 2px Blanks are fixed in `main` and were re-measured as fixed here.

Fixture: a locally seeded published Meeting — four Sections, five content kinds (Passage, prose with a Blank and bold, Key line, Verse, bullet list, prompt), the 20px default type size, the current week. Spanish was measured with the session's stored preference set to `es`. A stale-week fixture (an 11-day-old Meeting as the newest published) was used for the date chip.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 1 | The reader's own scroll never happened, so its status read-outs were fiction: the counter said **`02 / 04` at first paint while Section 1 filled the screen**, still said `02 / 04` after **1,200px** of scrolling with Section 2 on screen, and the sticky header sat at **y = −1143** — 1,143px above the viewport. The progress rail was at **y = 3139**, 2,327px below the fold. The loading state is an unlabelled `animate-pulse` with no `role="status"`. |
| 2 | Match System / Real World | 3 | The vocabulary is a printed study sheet's — a Section is a movement (Passage, notes, a Key line set in scripture type, a Verse, `Discuss`), the end says **"End of Peace that holds"**, a stale week says **"Most recent · Tuesday, October 13"**. Drift is in the header's cluster: a bare **"A"**, a bare **`02 / 04`**, and three unlabelled icon marks. |
| 3 | User Control and Freedom | 2 | The only in-page way to move between Sections is the edge grip at **x = 343, 32×120**, which sat at **y = 1548** — 1,448px down the page, i.e. unreachable while reading the top. Once found it works (a real `<button>`, four 52px rows, Escape closes — #1777's fix holds). No deep link to a Section; "back" is the shell's own nav. |
| 4 | Consistency and Standards | 3 | One rendering path with the public reader is a genuine strength: same card, same 20px body, same ink. The drift is control size — the two controls a Trainee passes the study on with (**Copy link**, **Show QR**) are **28×28** while the text-size trigger beside them is **44×44**. |
| 5 | Error Prevention | 3 | Nothing here is destructive and the Blank cannot be mis-triggered (measured: a tap 10px above the underline hits the paragraph, a tap on or 8px above it reveals). A revealed Blank cannot be re-hidden — harmless, but it is a one-way state with no affordance. |
| 6 | Recognition Rather Than Recall | 2 | Position cues exist (rail, counter, peek, index) and three of the four were off-screen or lying: rail at y = 3139, grip at y = 1548, counter frozen at `02 / 04`. The peek ("What suffering is doing") is the one cue that worked, at **7.03:1**. |
| 7 | Flexibility and Efficiency | 2 | Type size persists per browser (16/18/20/22, `cisa.reader.type-size.v1`) — the good part. Keyboard paging exists only on the *paged* deck, which needs a **768×600** reader box and never renders at 375; there is no jump-to-Section on a phone and no search. |
| 8 | Aesthetic and Minimalist Design | 3 | The card on ground is handsome and unmistakably this product: **340px wide, 24px radius, on `#F4F4F5`**, the Section title hugging the top. It loses a point because the phone spent **92px of its 375 on margins** (24px panel + 22px card) and left a **270px** column — and because the type scale is set for a bigger box: the Key line is **26px** in that column. |
| 9 | Error Recovery | 1 | With the meetings listen aborted, the page read **"Loading Bible Study…" at 5s** and settled on **"Between terms · Nothing running right now"** at 15s — a Trainee on campus wifi told the study was over. `useResolvedStudy` already returned `loadError: true`; the route never read it. No retry, no alert. |
| 10 | Help and Documentation | 2 | The empty states are the right three sentences in the right three places. But nothing on a live week says what an underline is, that it can be tapped, or what "This week's study" is for — and in Spanish the four prompt kind labels stayed English. |
| **Total** | | **22/40** | **A beautifully made reading page whose own chrome was lying about where you were** |

## Design Specificity Verdict

**LLM assessment.** This is not a document viewer with a serif on it. It is one hour of a campus ministry's week: a Section is a movement of a study, the scripture is set in Literata a size larger than the notes, the Key line is centred under an oversized opening quote, and the study asks you to fill in a word you then say out loud. The card-on-ground, the `Most recent ·` chip and `End of Peace that holds` are authored, not borrowed from a category. A Trainee and a student who scanned the QR see byte-identical content because both routes resolve through `useResolvedStudy` and render `StudyReaderView` — that is a product decision you can feel.

Where it drifts is not the design language but the **box arithmetic around it**. The reader was composed for a 390-wide phone preview (`people` padding 24 + card inset 22 → a 270px measure), and then dropped inside an app shell whose `<main>` is a page scroller. Two numbers — 46px of side margin and an assumed flex parent — produced every P0/P1 in this report. Neither is visible in source; both are obvious in a browser.

**Deterministic scan.** `impeccable detect` is not installed in this worktree (no binary, no local package), so **no CLI scan was run**. Every finding comes from the live DOM. A static scan would have found one of the four: the hard-coded `Discuss` string. The deck-height trap, the 26-character measure and the "between terms" failure are all layout-and-runtime facts.

**Visual overlays.** No overlay is available (no injection path in this session). One live render at 375×812 (device scale 1), light, in English and Spanish, plus the stale-week state and two failure states; a 1440-wide render confirmed the paged deck still works there (root 774px, tabs + footer present). **Dark mode was not observed** — the app forces `html.light` in this environment, so any dark figure would be computed, not seen.

## Overall Impression

The page a Trainee opens in the room is the best-designed thing in this critique — and, before this pass, it was lying to them. The deck never scrolled, so the page scrolled instead; the header that says where you are scrolled away, the rail that says how far you have come was 2,327px below the fold, the grip that jumps between Sections was 1,448px down, and the counter claimed `02 / 04` over Section 1 and never moved again. A reader who scrolled to the bottom of the study had no idea which week it was, which Section they were in, or how much was left.

The single biggest opportunity is the one a Read surface lives or dies on: **the measure**. At the default 20px in a 270px column, the first line of the prose is 26 characters — `This is not a feeling that` — and the 23px Passage gets 24. That is not a paragraph; it is a column of phrases. Trimming 28px of margin bought 8 characters without touching the type size or the card's identity.

## What's Working

1. **The card on ground, at phone scale.** 340×681 at x = 12, `rounded-[24px]`, a layered shadow that reads as paper on `#F4F4F5`. The Section title at **37px / 39.96 (1.08)** in Plus Jakarta Sans, then 24px of air, then the Passage. It is the most confident thing on the screen and it is unmistakably not a generic reader.
2. **Scripture is set like scripture.** The Passage is **23px Literata / 36.8 (1.6)** against 20px/31 Lexend notes, at **18:1** on the card. You can see the register change before you read a word, which is the whole point of a study sheet.
3. **The prompt panel.** A 20px-radius tinted block per kind (sage / clay / ochre / slate) with an 11px uppercase label at **7.23:1** and body at 20px/32.5. It reads as a workbook box, and the four tones give the page a rhythm without colour noise.
4. **One rendering path, honoured.** This route and `/s/:slug` render the same `StudyReaderView` with the same Blanks, the same settle, the same end mark. A student beside the Trainee reading the same week sees the same thing, by construction.
5. **Type size is the reader's, and it remembers.** Four sizes written to `cisa.reader.type-size.v1`; title and Passage scale with the body. The person who cannot read the text can fix it, with no author involved (ADR 0012).
6. **The empty states are three different sentences for three different causes** ("No study set up yet" / "Between terms · Nothing running right now" / "The study has never published a week"), and the route now adds a fourth for "the device could not reach it" — see the P1 below.
7. **No page scroll after the fix.** `document.scrollHeight` is 812 on an 812 viewport; the deck is the only scroller, so nothing chains to the browser and the shell's pull-to-refresh stays out of the reading.

## Priority Issues

### [P0] The reader never owned its scroll — the page's `<main>` scrolled instead, and every piece of reader chrome was pinned to content coordinates

- **What**: the route wrapped the reader in `<div className="flex-1 min-h-0 flex">`, but the shell renders `<main className="…overflow-y-auto pb-36">` as a **`display:block`** box. `flex-1` and `min-h-0` are inert in a block parent, so the wrapper was content-height and the reader's `h-full` resolved against its content, not the pane. Measured at 375×812: the deck's `clientHeight` equalled its `scrollHeight` (**3,031px**) and it could not scroll at all (`scrollTop` max 0); the only scroller on the page was `main` (**3,247px** of content in a **755px** box).
  Every coordinate the reader publishes was therefore a content coordinate:
  - the counter read **`02 / 04` on first paint** while Section 1 ("Where peace starts") filled the screen, because `currentSectionIndex` compares panel tops to a 3,031px deck — and it stayed `02 / 04` after **1,200px** of scrolling with Section 2 on screen, because the scroll listener is on the deck, which never fires;
  - the progress rail sat at **y = 3139**, 2,327px below the fold;
  - the Section index grip sat at **y = 1548** — the jump affordance was 1,448px down the page;
  - the `sticky top-0` header was at **y = −1143** after one screen of scrolling;
  - the index dialog opened as a 375×3,103 overlay instead of a 375×611 one.
- **Why it matters**: this is the reading surface. A study is four Sections over ~3,000px; the rail, the counter, the sticky header and the index *are* the page's sense of place. All four were off-screen, lying, or both — and a reader who scrolled had no way to tell which Section they were in or how much was left.
- **Fix**: the wrapper claims the pane's height — `h-full min-h-0 flex` — so the reader owns the scroll it was designed for. Verified after: deck **539px** and scrollable (`scrollHeight` 2,968), header at **y = 57**, rail at **y = 647**, grip at **y = 303**, counter tracking **01 → 03 → 04**, index dialog **375×611**. Guarded by a source assertion in `studyReaderPanelSizing.test.ts` with the measurements in the comment.
- **Suggested command**: `/impeccable layout`

### [P1] A dropped connection told the room the study was over

- **What**: `useResolvedStudy` reports `loadError` when a listen fails — the fire-and-forget empty snapshot the public route fixed in #1777 — but `BibleStudyRead` destructured only `loading, entryPoint, resolution, meeting, staleDateLabel`, so the flag was never read. Measured with the `bible_study_meetings` listen aborted: **5s → "Loading Bible Study…"**; **15s → "ENTRE SEMESTRES / Nada en curso ahora mismo / Wednesday Bible Study vuelve cuando comience el próximo estudio"** (the same page in English: "Between terms · Nothing running right now"). The entry-point subscription had a second version of the same hole: `subscribeEntryPoints(db, cb)` was called with **no error callback**, so a rejected listen left `entryPointsLoaded` false and the page pulsed "Loading Bible Study…" forever.
- **Why it matters**: a Trainee standing in a room on campus wifi was told, with the app's own voice, that the study had ended and to keep the code for next term. There is no retry and no alert — the one state where the page needs to hand off to a person is the state where it claims there is nothing to hand off to.
- **Fix**: the failure is checked before every empty state and before the chooser, rendering the same words the public route uses (`study.load_failed` / `study.load_failed_body`) behind `role="alert"` with a **Try again** that reloads (a re-subscribe keeps answering from the failed cache — measured on the sibling route). `subscribeEntryPoints` gains an `onError` that marks the list loaded *and* failed. Guarded by two route tests (meetings error, entry-points error) that fail with the fix reverted.
- **Suggested command**: `/impeccable harden`

### [P1] The measure was 26 characters at the default type size

- **What**: at 375×812 the panel spent **24px** and the card **22px** per side — **92px of 375 (24.5%)** on margins — leaving a **270px** column. At the 20px default `Lexend`, the rendered first line of the prose was **26 characters** (`This is not a feeling that`), and the 23px Passage was **24** (`Therefore, since we have`). Computed against the em's advance the column was **22.2 ch**. The same 46px inset applies inside the editor's 390-wide phone preview, which is the standard a Full-timer approves against.
- **Why it matters**: the guidance band is ~45–75 characters, and phones sit at the bottom of it (~30–40). Twenty-six is below even that, so every sentence breaks mid-phrase — `we have / peace with God / through our Lord / Jesus Christ` — and a four-paragraph study becomes a stack of short lines that costs attention the content does not get back.
- **Fix**: on the scrolling (phone) deck the ground is **12px** and the card inset **16px**: a 340px card and a **306px** column, **34 characters** on the rendered first line (+31%). Passage goes 21.4 → 24.2 ch. The card still reads as an object on ground, the type scale and the four size options are unchanged, and the paged deck (≥768px) is untouched. Guarded by a source assertion with the measurement in the comment. **Residual, deliberately not changed here**: at a 20px default a 375px screen can never exceed ~31 characters, so a genuinely comfortable measure needs a decision about the default size (ADR 0012's "raised default") — filed as a follow-up rather than smuggled into a layout fix.
- **Suggested command**: `/impeccable layout`

### [P1] The four prompt labels were English inside a Spanish session

- **What**: `SectionBody` printed `Discuss / Activity / Apply / Question` as literals while the rest of the reader's chrome resolved through `t()` — its page name, its index, its close hint and every Blank were already translated by #1777. Measured with the session language set to `es`: `<html lang="es">`, the grip read **"Abrir el índice de secciones"**, the Blank read **"Espacio en blanco, toca para revelar"**, the end read **"Fin de Peace that holds"** — and every prompt still said **`DISCUSS`**.
- **Why it matters**: bilingual access is a product commitment, and these labels sit on the content itself, once per prompt, on every Section — the most visible untranslated thing on the page.
- **Fix**: four `reader.prompt_*` keys next to the existing `reader.*` block in both locales (**Conversar / Actividad / Aplicar / Pregunta**), resolved through `t()` in `SectionBody`. Guarded by a component test that renders under `defaultLanguage="es"` and asserts all four, and by `check:i18n`.
- **Suggested command**: `/impeccable harden`

### [P2] Copy link and Show QR — the two "pass it on" controls — are 28×28

- **What**: measured header controls: **Copy link 28×28** at x = 200, **Show QR 28×28** at x = 232, **Text size 44×44** at x = 264. Above the 24px WCAG floor, half the app's own 44px header standard, and inconsistent with the control immediately beside them.
- **Why it matters**: a Trainee is the person who shares the study when no Full-timer is in the room; the two controls that do it are the smallest targets on the page and sit 4px apart, one-handed, at the top of the screen.
- **Fix**: 44×44 for both, matching the text-size trigger; the header already wraps.

### [P2] The Blank's hit area is 64×21 — just under the 24px floor, with a dead band above the underline

- **What**: the Blank's own box is **64×2**; the `::after` layer extends it to **64×20.7** (`-inset-y-[0.45em]` at 20px). Probed with `elementFromPoint` at the underline's centre: BLANK from −10px to +6px, the surrounding paragraph at −12px and above. A real click at −8, 0 and +2 reveals; at −12 it does not.
- **Why it matters**: WCAG 2.5.8 asks for 24×24, and this is the page's only interaction, tapped by a thumb in a room. The current target works, but it misses the floor by 3px and the dead band is exactly where a thumb aiming at the *word* lands.
- **Fix**: `-inset-y-[0.6em]` (24px at 20px body, 26.4px at 22px) without changing the 2px underline or the line box.

### [P2] The stale-week chip is English inside a Spanish session

- **What**: on a week that is not current, the header chip reads **"Most recent · Tuesday, October 13"** at 11px regardless of language — `useResolvedStudy` composes the prefix as a literal and formats with `EEEE, MMMM d` and no locale. Measured in `es`: everything else in the header and the reader is Spanish.
- **Why it matters**: it is the one sentence that tells a reader the week is old (ADR 0011 §3), and it is the sentence a Spanish reader cannot read. Same defect on `/s/:slug`.
- **Fix**: move the prefix to `study.most_recent` and format with the active language (`format(parseISO(date), 'EEEE, d MMMM', { locale: es })`). Needs the language inside the hook — a shared change, so filed as a follow-up rather than taken in this PR.

### [P2] No page name: no `h1`, and the tab still says "CISA Campus Work Tracker"

- **What**: four `h2`s, **zero `h1`**; the Meeting title is a `<div>` in the sticky header; `document.title` is the app's internal name. Landmarks are fine (`main` 1, `header` 1, `nav` 2).
- **Why it matters**: a screen-reader user gets no page name and nothing to jump to; a browser tab with five tabs open is indistinguishable.
- **Fix**: the Meeting title becomes the route's `h1` (styled as it is), and the document title becomes `"{meeting.title} · Bible study"`.

### [P2] The loading state is silent, and it lasts fifteen seconds before the failure state appears

- **What**: `study.loading` renders as an `animate-pulse` `<div>` with **no `role="status"`** and no text alternative for AT. With the meetings listen aborted the page sat on it for **~15s** before resolving.
- **Why it matters**: on a slow connection the page says nothing to a screen reader and appears frozen to everyone else for a quarter of a minute, on a surface whose whole job is to appear instantly with a study in it.
- **Fix**: `role="status"` + `aria-live="polite"` on the loading text. The 15s window is the SDK's reconnect behaviour; a deadline (say 12s → the failure state) is worth deciding deliberately — it would also fix the public route.

### [P2] The reading area gives up 144px to a 64px nav bar

- **What**: with the deck now bounded, the rail's bottom is at y = 668 while the mobile nav starts at y = 748 — **80px** of dead ground between them, because `main` reserves `pb-36` (144px) for a 64px bar.
- **Why it matters**: on an 812px screen that is 10% of the reading height returned to nothing; the deck could be 619px instead of 539.
- **Fix**: route-aware bottom padding on the shell's `<main>` (the pattern `isMessagesPage` already uses). Shell territory (#1795) — noted, not touched here.

### [P3] Smaller things

- The type-size options are bare numbers (`16 18 20 22`) with no unit, in a `role="group"` named "Text size".
- The progress rail is four 3px segments with no text equivalent; the counter carries the meaning, but only after the fix above.
- The Key line is 26px in a 306px column — four lines for one sentence, the first only 12 characters. It is the most fragmented type on the page after the fix and is worth a look in `typeset`.
- `role="dialog"` on the Section index without `aria-modal` or focus moved into it; Escape closes (fixed in #1777), focus stays on the grip.
- A revealed Blank cannot be re-hidden and gives no feedback beyond the tint — fine for a study, but a reader who taps by accident has no undo.
- The note FAB (#1785) floats over the card's bottom-right at y≈700; a Blank in that corner would be unreachable. Out of scope here, named once.

## Persona Red Flags

- **Zion (Trainee, 20, opens the study on his phone at the start of the room)**:
  - *The page does not know where he is* — the counter said `02 / 04` over Section 1 and never moved as he scrolled (fixed).
  - *He cannot see how much is left* — the rail was 2,327px below the fold, the sticky header 1,143px above (fixed).
  - *He cannot jump* — the Section index grip was 1,448px down the page at the top (fixed: y = 303).
  - *He would have texted his leader* — a wifi drop told him the term was over (fixed: "Couldn't load this week · Try again").
  - *Passing the study on is a 28px target*, beside a 44px one (noted, P2).
- **Devon (reads at 22px, one-handed, in a dim room)**:
  - *The type grows, the column does not* — even after this pass, 22px in a 306px column is ~23 characters (noted: the residual, needs a default-size decision).
  - *Taps the word, not the underline* — 12px above the underline is dead space; the target is 21px tall against a 24px floor (noted, P2).
  - *Everything else is in the thumb's reach* — the peek at the bottom of each Section and the index at mid-height are the best-placed controls on the page.
- **Sam (screen reader, keyboard-only, 200% zoom)**:
  - *Blanks are fully operable now* — Enter and Space reveal, the focus ring is a real 2px sage ring on the `::after` layer (verified by tabbing to one).
  - *The index is reachable* — a real button labelled "Open section index", four 52px rows, Escape closes.
  - *No page name* — zero `h1`, `document.title` is the app's name (noted, P2).
  - *The loading state announces nothing* — no `role="status"` (noted, P2).
  - *At 200% zoom* the deck is 539 CSS px of an 812 viewport; the card reflows to 306px of a 187.5-CSS-px column — untested for this pass, flagged.
- **Jorge (Spanish-first, whose phone has stored `es` for months)**:
  - *Half the chrome was Spanish and the half that was not sat on every prompt* — `DISCUSS` over every prompt (fixed: "Conversar").
  - *The chip that says the week is old is English* — "Most recent · Tuesday, October 13" (noted, P2, shared with the public route).

## Minor Observations

- **The peek is the best-designed cue on the page**: 14px ink at **7.03:1**, a 48px-tall button at the bottom of each card, naming the next Section. It survived every regression because it never depended on the deck's scroll.
- **The end mark reads as an ending** — a 48px rule and "End of Peace that holds" at 12px, not a button.
- **The 24px card radius against a 24px ground margin was a happy pair**; at 12px ground it still reads, though the card now nearly touches the screen edge at the widest Sections — worth a look on a 320-wide device (untested).
- **`A` as the text-size trigger** is discoverable only by trying it; the popover is good (four 44×44 options, `aria-pressed`, `aria-expanded`), the trigger is a serif letter with no other cue.
- **The Section title is 37px** at the 20px default (1.85×) and 29.6px at 16px — an unusually wide ratio that gives the page its confidence, and pushes the Passage below the fold on the first screen.
- **The 11px uppercase header title** at 18:1 is the only place the week is named; there is no study name ("Romans · Fall 2026") and no date on a current week.
- **Dark mode is unverified** (`html` stayed `light` in this environment).
- **The paged deck at 1440** renders correctly (tabs, footer, 774px root) — this P0 is phone-only, which is why it survived.

## Questions to Consider

- **Is 20px the right default for a phone that is 375 wide?** The ADR's "raised default" was decided for legibility; at 375 it caps the measure at ~31 characters no matter how tight the margin. Eighteen would give 35–38 without touching the four-step control.
- **Should the route own its scroll, or should the shell know which routes are full-height?** `isMessagesPage` already bends `<main>` for one route. Two special cases is a pattern; three is a policy.
- **Does a reading page need its own back/exit at all**, or is the shell's nav the honest answer? Right now the page has no way to leave except the tab bar.
- **Should the failure state offer something better than a reload** — a "text your leader" line, or the last cached week with a "this may be two weeks old" chip?
- **What would the study look like if the Section title were smaller** and the Passage higher on the first screen? The current maths shows a title, one sentence and a prompt before the fold.

## What this pass changed (same PR)

- The route gives the reader a definite height, so the deck scrolls, the header stays, the rail is on screen, the counter tracks position and the index dialog is viewport-sized.
- A failed load says **"Couldn't load this week"** with **Try again** instead of "Between terms"; a failed entry-point list no longer pulses forever.
- On the phone deck, the ground is 12px and the card inset 16px: **26 → 34 characters** on the rendered first line.
- The four prompt labels follow the reader's language (EN/ES).

**Unverified**: dark mode (forced `light` here); a 320-wide device and a notched one (safe-area insets are 0 in this environment); real-thumb accuracy on the 21px Blank target (headless reports `pointer: fine`); screen-reader announcement order through the failure state; and whether the 15s reconnect window on a real device is shorter or longer than measured.
