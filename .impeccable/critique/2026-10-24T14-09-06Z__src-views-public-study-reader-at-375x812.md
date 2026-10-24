---
target: /s/:slug (src/views/PublicStudyReader.tsx → src/components/bibleStudy/StudyReaderView.tsx at 375x812)
total_score: 24
max_score: 40
na_heuristics:
p0_count: 3
p1_count: 7
target_identity: "file:/Users/twang/cisa-campus-work-tracker/.worktrees/issue-1777/src/views/PublicStudyReader.tsx"
timestamp: 2026-10-24T14-09-06Z
slug: src-views-public-study-reader-at-375x812
---
⚠️ DEGRADED: single-context (no sub-agent tool in this session; one assessor read the source and then measured the live render). Every number below is measured on the seeded emulator at 375×812, not on a mock.

# Critique: The QR page — a Bible study a student scans at 375×812

Target: `/s/cisa-wednesday`, **signed out**, at 375×812, on the seeded emulator through the dev server (`VITE_E2E_MODE=true`). No app shell is rendered on this route, so nothing here is a shell defect: this page is its own surface and is judged as a *Read* surface (big type, a scrolling deck of Sections, a fill-in-the-blank study, prompts).

Fixtures seeded into the **local emulator** for the pass (dev data only, nothing committed — the three entry points stay in the local emulator so the states are still reachable): `/s/cisa-wednesday` (Romans, Fall 2026 — four Sections: passage + prose with two Blanks, bullets, keyline, verse, two prompts, current week), `/s/quiet-week` (the same study two weeks old, so the "Most recent" chip renders), `/s/never-published` (an active Study with no published Meeting), and `/s/unknown-slug` (no entry point). Measurements were taken with the browser's own layout (`playwright-core` + Chromium at 375×812, device scale 1), not from tokens.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | The counter (`01 / 04`) and the rail do move with reading position, but the page never says **which week or which study** this is, the "next Section" peek is painted at **2.79:1** (effectively invisible), and the deck's own scroll position is unstable (see #3), so the counter jumps a Section at a time. |
| 2 | Match System / Real World | 3 | This genuinely reads like a printed study sheet: a 37px serif title, scripture set apart at **23px Literata**, `Discuss` / `Apply` / `Activity` prompts in tinted panels, an underline you fill in. Two placeholders for the same idea (`Blank, tap to reveal` vs. the passage's bare underline) are the drift. |
| 3 | User Control and Freedom | 1 | **The deck traps the reader.** With Section 1 at 924px in a 744px deck, eight wheel gestures of 120px left `scrollTop` at **180** — the deepest position inside the panel — and programmatic positions **680–900 all settle at 924** (the next Section's top). The tail of every Section taller than the deck is unreachable. The Section index exists but is a `<div>` with `tabIndex=-1`, its rows are `<div>`s, and nothing closes it with Escape. |
| 4 | Consistency and Standards | 3 | Within its own language the surface is coherent (24px card, 20px prompt panels, one ground/card pair, Literata for scripture only). It drifts on the small type — an **11px** week title and a **10px** date chip under DESIGN.md's 11px caption floor — and on control size: the one control this page exists to offer (text size) is **28×28**. |
| 5 | Error Prevention | 2 | Nothing here is destructive, but the page's only interaction cannot be hit: the Blank's clickable box is **64×2 CSS px** inside a 34px line box, so a tap in the middle of the blank does nothing (measured: 4 blanks before, 4 after) while a tap on the 2px underline reveals (3 after). |
| 6 | Recognition Rather Than Recall | 2 | Names and numbers are there (Section titles, counter, peek), but the peek is at 2.79:1 and the index hides behind a **20×2px dash** — the other three marks are `#E4E4E7` on `#F4F4F5` (**1.16:1**). A reader has to remember which Section they were on; nothing on screen tells them. |
| 7 | Flexibility and Efficiency | 2 | Type size persists per browser — that is the good part. But there is no working jump-to-Section (see #3), keyboard paging only exists on the *paged* deck which never renders at 375px, and no search. Getting to Section 4 is a 4.5-screen-scroll (**3406px**) with the index hidden. |
| 8 | Aesthetic and Minimalist Design | 3 | The composition is strong: ground, a raised card, the title hugging the top, 18px of air, a settled card vertically centred (measured at y=269 in a 744 deck for the short Section), an end-of-meeting rule. It loses a point for the shattered prose (#P0-2) and the doubled inset (**24 + 22px of the 375**), which leaves a 270px measure. |
| 9 | Error Recovery | 1 | With Firestore blocked, the page says **"Between terms — Nothing running right now. The study picks up again when the next one starts."** The SDK hands back an empty **cached** snapshot (`exists(): false, fromCache: true`), the hook cannot tell it from an empty term, and the error callbacks resolve to "nothing" too. A student on campus wifi is told the term is over. No retry, no alert. |
| 10 | Help and Documentation | 2 | The empty state's "Keep this code — it will be the same one." is the right sentence in the right place. But nothing on a live week says what this page is, who runs it, or that an underline can be tapped — and in Spanish half the chrome stays English (#P1-5). |
| **Total** | | **24/40** | **A beautiful reading page with three functional holes** |

## Design Specificity Verdict

**LLM assessment.** This is not a generic "document viewer". It is built around one hour of a campus ministry's week: a Section is a *movement* of a study (passage, notes, a keyline set apart in scripture type, a verse proof-text, then a `Discuss`/`Apply`/`Activity` prompt), and the reader is invited to fill blanks in the text — a mechanic borrowed from a printed study booklet, not from a CMS. Setting the scripture in Literata at 23px against 20px notes, with the keyline centred under an oversized opening quote, is an authored decision, and ADR 0014's "one rendering path" makes the editor preview and the QR page the same surface. The page's own vocabulary is quiet and right (`End of Peace that holds`, `Most appropriate`, the stale-week chip introduced by "Most recent").

Where it drifts is not the design but the seams between three layers: Tailwind utilities, a `.reader-card-surface` token block, and browser scroll snapping. The prose container's `flex flex-col` is a Tailwind utility that silently redefines *every inline child* as a block (#P0-2); the deck's `snap-y snap-proximity` is a utility that contradicts the guardrail test that asserts it can never trap (it does); the Blank's `inline-block` with no content is a utility combination that collapses the page's only tap target to its 2px border. Three different-looking bugs, one root cause: **markup that was never measured in a browser**.

**Deterministic scan.** `impeccable detect` is not installed in this worktree (no `impeccable` binary, no local package), so **no CLI scan was run**. Every finding below comes from the live DOM. A static scan would not have found any of the three P0s: a flex container that turns inline spans into blocks, a 2px hit box, and a browser snap behaviour are all invisible in source.

**Visual overlays.** One live render at 375×812 (device scale 1), light, in English and Spanish, plus the seeded stale-week and both empty states; a second render at 1440 wide confirmed the paged deck. **Dark mode was not observed** — the app forces `html.light` in this environment even with `vite-ui-theme=dark`, so every dark number here is computed from tokens and marked unverified.

## Overall Impression

The page is one good idea — a study that reads like paper — undermined by three browser facts it never checked. A student scanning the QR gets a handsome card, taps the first blank in the sentence, and nothing happens; if they do hit the 2px line, the sentence they were reading has already fallen into four stacked lines; and if they try to scroll through it, the deck holds them at the top and then jumps a Section.

None of the fixes needs a redesign. Two are layout-property changes (one class each), one is a hit-area, and the seven P1s are a keyboard handler, two token swaps, four locale keys and one header wrap.

## What's Working

1. **The card on the ground.** A 316×806 card, `24px` radius, `24px 22px` inset, on a `#F4F4F5` ground, with a shadow that reads as paper, not as a floating app panel. Measured: card at x24, panel padding 18px above it.
2. **Scripture is set like scripture.** The passage renders at **23px Literata / 36.8px** (1.6) against 20px/31 notes, 19.79:1 on white — visibly a different register from the notes, which is the whole point of the reading.
3. **The prompt panel.** A 20px-radius tinted block (`--t-sage-soft`, 14% sage → `#DBEADD`) with an 11px uppercase kind label at **5.78:1** and body text at 15.82:1. It looks like a workbook box and is legible at arm's length.
4. **The settle.** When a Section fits, its card settles to the optical centre of the panel (measured y=269 in a 744px deck) and the peek sits at the bottom; when it does not fit, the card simply grows. Nothing jumps at the threshold.
5. **Type size is the reader's, and it remembers.** Four sizes (16/18/20/22) written to `cisa.reader.type-size.v1`; the title and passage scale with the body (`37px` title at 20px body, `29.6px` at 16px). The person who cannot read the text can fix it without the author.
6. **The end of the meeting reads as an ending.** A 48px rule and "End of Peace that holds" at 12px — a closing mark, not a button pretending to be one.
7. **Three honest empty states.** "Between terms / Nothing running right now", "The study has never published a week", "Week not found" are distinct sentences for distinct causes, and the between-terms one tells the student to keep the code.
8. **No page scroll.** `document.scrollHeight` is exactly 812 on an 812 viewport; the deck owns the scroll, so the header and the rail never move and nothing chains to the browser.

## Priority Issues

### [P0] The deck traps the reader inside any Section taller than the screen
- **What**: the deck is `snap-y snap-proximity` and every panel is `min-h-full snap-start snap-always`. Section 1 measures **924px** in a **744px** deck. Measured, programmatic: `scrollTop` 200→**180**, 300→**180**, 400→**180**, 500→500, 640→640, 660→660, **680→924**, 760→924, 900→924. Measured with a real wheel at 120px per gesture, eight gestures: **120 → 180 → 180 → 180 → 180 → 180 → 180 → 180** — the reader never advances past the first 180px of the Section. The 180 is `panelHeight − deckHeight`: the deepest position at which the panel still fills the deck, which is the only position the snap engine will rest at inside the panel.
- **Why it matters**: this is the reading surface. On a phone the *normal* Section is taller than the screen (all four seeded Sections measured 924, 993, 744, 744), so the prose, the bullets and the prompt at the bottom of a Section are content the reader cannot scroll to. It also means the header counter advances a whole Section at a time, which is why it read `02 / 04` while the visible card was still Section 1.
- **Fix**: the two classes go. §ADR 0014 asked for proximity "so a Section taller than the deck can never be skipped or trapped" — the browser says otherwise, so the mechanism is removed rather than retuned: the deck becomes a plain scroller, panels keep `min-h-full` (so short Sections still fill and settle), and the peek + rail + counter continue to carry position. Guarded by rewriting the existing source guardrail (`studyReaderPanelSizing.test.ts`) to assert **no** snapping on the deck, with the measurement in the comment.

### [P0] A prose sentence shatters into separate lines at every Blank and every bold word
- **What**: `[data-block-kind="prose"]` is `display:flex; flex-direction:column`. In a column flex container each **contiguous inline run becomes an anonymous flex item and therefore a block**, so the paragraph "This is not a feeling that arrives when the week is calm. It is a **standing** — a position we hold because of [[someone else's work]], not because we have earned a quiet heart." rendered as **10 line boxes** (widths 233, 238, 113, 270, 88, 199, 106, 270, 215, 205) for 149 characters: `It is a` / `standing` / `— a position we hold` / `because of` / `——` / `, not because we have earned a quiet heart.` The revealed word sits alone on a line and the next line begins with a comma.
- **Why it matters**: the fill-in-the-blank *is* the study. Breaking the sentence at the blank removes the grammar the reader is supposed to complete, and it makes every authored paragraph with emphasis look like broken markup.
- **Fix**: the container is a block again (`flex flex-col gap-2` removed). The inline parts sit in one flow, the blank's underline stays in the sentence where the author put it, and the gap class goes with the flex. Guarded by a component test asserting the prose container is not a column flex layout, plus the existing "inline markdown renders as formatting" test.

### [P0] The Blank — the page's only interaction — is a 64×2 tap target
- **What**: the Blank is an `inline-block` with no content, a `min-w-[64px]` and a 2px bottom border, so its box is **64×2** (measured at four Blanks: y=290, 625, 1423, 1491; height 2 each) inside a **72×34 / 72×25** line box. A tap at the visual centre of the blank (mid line box) does nothing — 4 Blanks before, **4** after; a tap on the 2px underline reveals — **3** after. WCAG 2.5.8 asks for 24×24.
- **Why it matters**: the one thing the page asks the reader to do requires hitting a two-pixel line inside running text, one-handed, in a room. Most taps land on the word next to it and appear to be ignored.
- **Fix**: the underline keeps its 2px look, and a `::after` layer extends the hit area to the whole line box (`-inset-y-[0.45em]`, full width) without changing layout or the baseline — a 34px target at 20px body, 38px at 22px. Verified by re-running the same dead-zone probe (see the PR evidence).

### [P1] Blanks are focusable but not operable, and show no focus ring
- **What**: each Blank is `role="button" tabIndex={0}` with an `onClick` and no key handler. Measured: focus the first Blank, dispatch Enter and Space — the word is **not** revealed (`revealedByKeyboard: false`). Its computed outline is `none 3px`, so a keyboard user cannot see where they are either.
- **Why it matters**: the study is unusable without a pointer, on a page that is otherwise tab-reachable.
- **Fix**: `onKeyDown` for Enter and Space (preventDefault on Space so the page never scrolls), and a visible `focus-visible` ring on the blank. Tested by dispatching Enter in a component test.

### [P1] The Section index cannot be reached or left with a keyboard, and is nearly invisible
- **What**: the edge grip is a `<div role="button">` at x343, **32×120**, with `tabIndex=-1`; the index itself is a `role="dialog"` whose four rows are `<div>`s (316×52) with `onClick` and no role or tabIndex; there is no Escape handler, and the only way out is a 12px "Tap anywhere to close". Visually the grip is one 20×2 active mark plus three 10×2 marks in `#E4E4E7` on `#F4F4F5` — **1.16:1**, i.e. invisible.
- **Why it matters**: the only jump-to-Section affordance on a 4.5-screen document is both undiscoverable and unusable for anyone not using a finger.
- **Fix**: the grip becomes a real `<button>` (still the same 32×120 strip, named "Open section index"), the rows become buttons, Escape closes, and the marks use the dim ink token so the affordance is visible.

### [P1] "Next Section" — the only "more below" cue — is at 2.79:1
- **What**: the peek under each card is 14px `text-on-surface-variant/60` on `#F4F4F5`: measured **2.79:1**. Same treatment on the stale-week peek and every panel.
- **Why it matters**: on a phone the peek is how a reader learns the Section ended and the next one starts. At 2.79:1 it reads as a rendering artefact.
- **Fix**: `--on-surface-variant` at full strength — **7.03:1**, the same token the counter and the end-of-meeting line already use.

### [P1] A stale week squeezes the week's title into a 38px column
- **What**: on `/s/quiet-week` the date chip renders at **10px** and **206px** wide, `shrink-0`. With the 95px control cluster and 40px of padding, the meeting title is left **38px** wide and **45px** tall — "PEACE / THAT / HOLDS" stacked one word per line in the header, which grows to **64px**. The title is also painted at 80% of `--on-surface-variant`: **4.32:1** at 11px.
- **Why it matters**: this is the one state that tells a reader the week is old (ADR 0011 §3 — falling back is correct, falling back *silently* is not), and it is the state where the page's own name becomes unreadable.
- **Fix**: the header wraps instead of squeezing — the chip takes its own row (`basis-full`), the title keeps the full width on one line — and both the chip and the title move to the caption floor and full ink. Verified on `/s/quiet-week`.

### [P1] A failed load tells the student the term is over
- **What**: with every Firestore request blocked, `/s/cisa-wednesday` renders **"BETWEEN TERMS / Nothing running right now / The study picks up again when the next one starts. Keep this code — it will be the same one."** Instrumented: the SDK resolves the listen with `exists(): false, metadata.fromCache: true` — the answer never reached the server — and `useResolvedStudy` cannot tell that apart from a code with nothing behind it. When the SDK does report an error (permissions, a rejected query), all three subscriptions swallow it into "loaded, nothing" as well.
- **Why it matters**: a dropped connection, a blocked request and a genuinely empty term are indistinguishable, and the wrong one tells a student who scanned a code on Wednesday night that there is no study. There is no way out of the screen.
- **Fix**: the three studio subscriptions now hand the SDK's `fromCache` flag to the hook; an empty answer that never reached the server is a failure, not an empty term. The route renders a distinct state — "Couldn't load this week." with a **Try again** action that reloads (a re-subscribe keeps answering from the failed cache while the Firestore channel holds its reconnect backoff — measured). The signed-in caller ignores the new field.

### [P1] The reader's own chrome is English inside a Spanish session
- **What**: with `cisa_language=es` the page's `<html lang="es">`, the text-size control reads **"Tamaño del texto"**, and then the visible end-of-meeting line still says **"End of Peace that holds"**; the index dialog, its rows' container, the grip and every Blank announce **"Section index"**, **"Open section index"**, **"Tap anywhere to close"** and **"Blank, tap to reveal"** in English. Six strings in `StudyReaderView.tsx` are hard-coded.
- **Why it matters**: bilingual access is a product commitment, and this is the page a *student* sees with no language control of its own — they inherit whatever the app last stored.
- **Fix**: six `reader.*` keys added next to the existing ones in both locales; the end-of-meeting line, the grip and dialog labels, the close hint, the blank's label and the no-Sections placeholder all resolve through `t()`.

### [P1] The text-size control — the accessibility control — is 28×28
- **What**: the header "A" trigger measures **28×28**, and each of its four options is **28×28** in a 128×38 popover.
- **Why it matters**: this is the control a reader who cannot read the page reaches for first; it is the smallest target on the screen (half the 44px the app uses for header controls).
- **Fix**: 44×44 for the trigger and for each option, with the header's vertical padding reduced so the bar stays under 50px on a device without a notch.

## Persona Red Flags

- **Marisol (student, scanned the QR at the end of Wednesday)**:
  - *Taps the blank and nothing happens* — the target is 64×2 px (fixed: the line box is the target).
  - *Reads a sentence that has fallen apart* — "It is a / standing / — a position we hold / , not because…" (fixed: one flow).
  - *Cannot get past the first screenful* — eight wheel gestures and the deck is still at 180px (fixed: no snapping).
  - *Cannot tell which study this is* — no study name, no date on the current week, no ministry name anywhere (noted, P2).
- **Devon (reads at 22px, one-handed)**:
  - *The type grows but the column does not* — the measure stays 270px, so 22px type gives ~24 characters a line (noted, P2: the inset is 24 + 22px of a 375 screen).
  - *The control they need is 28px* (fixed: 44px).
- **Sam (keyboard / screen reader)**:
  - *Blanks focus but do nothing* — Enter and Space are ignored, and there is no focus ring (fixed).
  - *The Section index is unreachable* — the grip is `tabIndex=-1` and the rows are divs; no Escape (fixed).
  - *No page heading and no landmarks* — headings begin at `h2`, `document.title` is "CISA Campus Work Tracker", and there is no `main` (noted, P2).
  - *Four identical "Blank, tap to reveal"* with no context — the label is fixed to the reader's language but carries no position (noted, P2).
- **Jorge (Spanish-first, whose phone stored `es` months ago)**:
  - *Half the page is Spanish and the half that isn't is the half he navigates with* — "End of …", "Open section index", "Tap anywhere to close" (fixed).
  - *The date chip on a stale week* is English-format ("Saturday, October 10") because `useResolvedStudy` formats with a hard-coded `en-US`-style pattern and no locale (noted, P2 — it would need the active language inside the hook).

## Minor Observations

- **No h1, no landmarks.** The four Section titles are `h2`; the meeting title is a `div`; `main`/`header`/`nav` counts are 0/0/0. The document title is the internal app name.
- **No study identity.** "Romans · Fall 2026" exists on the data and is never rendered; a reader has only "Peace that holds" and a Section counter.
- **No date on the current week.** The stale chip appears only when the week is old, so a link opened two days later claims no date at all.
- **The doubled inset** — 24px panel padding + 22px card padding — spends 92px of 375 (24.5%) on margins, leaving a 270px measure at 20px. The card reads beautifully; the line is a little short.
- **The blank is invisible until you know.** The only hint that the underline is interactive is the underline; the accessible label says "tap to reveal" but nothing on screen does.
- **The type-size options are bare numbers** ("16", "18", "20", "22") with no unit, in a `role="group"` named "Text size".
- **The loading state** is `animate-pulse` text ("Loading Bible Study...") with no `role="status"`; on a slow connection a screen reader hears nothing at all.
- **The empty state for an unknown slug** says "Between terms", which is a claim about the calendar rather than "this code isn't recognised".
- **The rail** is four 3px segments (`#0A0A0B` filled, `#EAEAEC` empty) with no text equivalent; the counter carries the meaning.
- **The 10px chip** sits under the 11px caption floor; fixed in this pass along with the header wrap.
- **The grip's inactive marks are 1.16:1**; fixed in this pass, but the affordance is still a 20px dash rather than a labelled control.
- **`role="dialog"` without `aria-modal` or a focus trap** on the index; Escape now closes it, focus is still not moved into it (noted).
- Dark mode is unverified: `html` stayed `light` in this environment, so every dark figure here is computed, not seen.

## Questions to Consider

- **Should the deck snap at all?** The design says "scrolling IS the navigation". Snapping helps short Sections land, and breaks tall ones — which is most of them. A middle path (snap only when *every* panel fits the deck) is a measurement at runtime; the cheaper answer shipped here is no snapping plus the peek/rail/counter. Worth deciding deliberately in the ADR rather than by utility class.
- **Should the page name the study?** "Romans · Fall 2026" is the sentence a student would use to describe what they just read, and it is the one thing the page never says.
- **Does a public QR page need a language control of its own?** It inherits `cisa_language` from the device's last session with the app; a student who has never used the app gets English with no way to switch.
- **Should prose support more than one paragraph?** `p` is mapped to a fragment so a Section's prose collapses paragraph breaks even once it is no longer a flex column. That is a renderer question (a paragraph-aware split), not a phone one.
- **Is 20px the right default for a study a student reads standing up?** The four sizes are good; the card's fixed inset means the measure shrinks as the type grows.
- **Should a signed-out reader see a retry, or a "text your leader" line?** The error state is the only place this page ever needs to hand off to a human, and there is no person on it.

## What this pass changed (same PR)

- The deck no longer snaps, so a Section taller than the screen can be read to its end (guardrail rewritten with the measurement).
- A prose sentence flows as one paragraph again; blanks and bold stay in the sentence.
- A Blank's hit area is its whole line box, and Enter/Space reveal it with a visible focus ring.
- The Section index is reachable by keyboard (a real button grip, button rows, Escape to close) and its marks are visible.
- The peek is ink at 7.03:1.
- A stale week keeps the week's title on one full-width line; the chip and title meet the caption floor and AA.
- A failed load says so and offers **Try again** (a reload) instead of announcing the end of term — including the measured case where the SDK answers from cache.
- Six reader strings are in English **and** Spanish.
- The text-size trigger and its four options are 44×44.

**Unverified**: dark mode (the app forces `html.light` here — every dark number is computed); touch momentum snapping on iOS/Android (the trap was measured with wheel and programmatic scroll in Chromium); the 44px hit areas on a real coarse pointer (headless reports `pointer: fine`, so the media-independent sizes were measured but not tapped); screen-reader reading order through the new index buttons; whether the soft keyboard or a notched safe area changes the header measurements (env(safe-area-inset-top) is 0 in this environment); and the Firestore reconnect backoff on a real device — the in-app re-subscribe kept answering from the failed cache after the network returned, which is why **Try again** reloads; the reload was verified in a fresh headless load.
