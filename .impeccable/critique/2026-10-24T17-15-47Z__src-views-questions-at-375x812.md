---
target: /questions (src/views/Questions.tsx at 375x812)
total_score: 24
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 8
target_identity: "file:/Users/twang/cisa-campus-work-tracker/.worktrees/issue-1767/src/views/Questions.tsx"
timestamp: 2026-10-24T17-15-47Z
slug: src-views-questions-at-375x812
---
⚠️ DEGRADED: single-context (no sub-agent tool in this session; one assessor read the source and then measured the live render). Every number below is measured on the seeded emulator at 375×812 in a touch context (`pointer: coarse`), not on a mock.

# Critique: Questions for the team — the asking side at 375×812

Target: `/questions`, signed in as `trainee.e2e@example.com` (Zion Adeyemi) at 375×812, against the seeded emulator through the dev server (`VITE_E2E_MODE=true`, Firestore `qa-db`).

**The named role owns this route.** `canAccessRoute('manager', '/questions')` is true (the trainee allowlist in `src/lib/permissions.ts`), and the phone nav carries it. A Trainee is exactly who this page is for: they ask, a full-timer answers. No permission question to file.

The emulator ships no `asks` documents, so the pass wrote a board through the page itself (Trainee, Trainee 2 and the Full-timer each asked, one in person, one answered) and then added two edge cases as documents — a 200-character unbroken URL, and a question with five answers. Nobody has to seed this to read the report: the board and the empty board were both measured.

The shell changed under the brief (#1795 `h-[100dvh]` with one inner scroller, #1785 the note FAB tucking on scroll, #1779 the bell as a real sheet). None of that is re-reported: the document is **812** tall on an 812 viewport with no page scroll, which is the fixed behaviour.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | A card with **“5 answers”** also said **“A full-timer will answer this.”** on the same card. Three of the four empty filters described a different state than the reader was in. The wait chip is good and now in the reader's language, but the page does not always agree with itself. |
| 2 | Match System / Real World | 3 | The board metaphor is right — questions as cards, a wait said in words (“waiting 4 days”), an origin mark that tells an in-person question from one typed here. But the page's own subtitle says **“Nothing here resolves”**, while the Waiting tab it opens on hides a question the moment it is answered. |
| 3 | User Control and Freedom | 3 | Deleting is behind an inline confirm with an explicit **Keep it**, and the Trainee can only delete their own. There is no undo, and the confirm sits low enough that the note FAB covers its right edge at one scroll position (measured, shell #1785). |
| 4 | Consistency and Standards | 2 | Card was **40px** radius with a **1px** border where DESIGN.md says 24px and borderless; the ask textarea was **20px** where Input = 10px; the primary read **24px** radius at 40px tall (now 14/44). The unselected chip fill is `#F4F4F5` where DESIGN says pure white. |
| 5 | Error Prevention | 3 | The only destructive control is a trash icon beside the wait chip, and it now has a 44px target. An in-person question is filed under a person only after that person is picked (deliberately, #563), so a stray send cannot invent an author. |
| 6 | Recognition Rather Than Recall | 3 | Every filter carries its count; the origin mark names the pen; answers carry a name and a time. But the default tab is a mixed queue with no grouping, and there is no search on the phone. |
| 7 | Flexibility and Efficiency | 2 | No search, no sort, no answer-from-the-list: a full-timer must open the card to reply, while the desktop rail surface has the same one path. The `?focus=` deep link from My Day is the one fast lane and it works. |
| 8 | Aesthetic and Minimalist Design | 2 | **402px** (EN) and **514px** (ES) of title, subtitle, button and filters sat above the first card — 49.5% and 63% of the screen. The four filter chips need 400px of a 343px row, so **All** always drops to a second line. |
| 9 | Error Recovery | 2 | Writes go through `handleFirestoreError`, which is global: a failed ask leaves the panel open with no message near the composer. Delete has a confirm; there is no undo path. |
| 10 | Help and Documentation | 2 | The subtitle explains the model in four lines of phone text, and “A full-timer will answer this.” used to explain the roles on every read-only card. Nothing explains why the Waiting tab is shorter than “All”. |
| **Total** | | **24/40** | **A board with a point of view, wearing a phone header it did not earn** |

## Design Specificity Verdict

**LLM assessment.** This is not a generic CRUD list. It is a **board of questions, not a conversation** — a decision written into the file's own header comment (#646/#647), and visible on screen: no composer pinned to the bottom, no bubbles, no “resolve” button. The vocabulary is the ministry's (“Asked in person · Full-timer wrote it down for you”, “asked today”, “waiting 4 days”), the origin mark (#611) is a real design idea rather than a field, and the empty state knows what belongs here (“A question with no person attached”). The page earns its scores on identity; it loses them on the phone.

Where it drifts is the usual mobile drift: desktop-first utility classes rendered into 343px. The header is one `flex-wrap` row, so at phone width the title and the button fight over the same line and the **title loses** (179px). The card header is one unwrapping row of avatar + name + role + wait chip + trash, so at phone width the **chip wins and the name wraps**. Both are the same defect as the prayer pass: a row that was designed for 900px.

**Deterministic scan.** `impeccable detect` is not installed in this worktree, so no CLI scan was run; every finding is from the live DOM. A detector would not see a hard-coded role chip, a `<textarea>` named only by its placeholder, or a false empty-state sentence.

**Visual overlays.** One live render at 375×812 at device scale 2 in a touch context, in English and Spanish, plus the ask panel, the answered tab, the delete confirm, the five-answer card and a long-URL card. Dark mode was **not** observed in this pass. The 44px targets were measured with `pointer: coarse` **active** (`matchMedia('(pointer: coarse)')` → true), unlike the earlier passes that could only compute them.

## Overall Impression

The board is the best idea on the page, and it is buried under its own introduction. A Trainee opens `/questions` and gets: a title, a four-line explanation of the information model, a full-width button, and four filter chips that need two rows — **370px** even after this pass, before the first question. The first question should be the subject of the screen, not the fifth thing on it.

Underneath, the cards are calm and legible: 16px/26px body at a 301px measure, a 28px header row, a wait chip that says how long in words, and an origin line that tells you whether someone said it out loud. The two real content bugs were small and local — a role chip the page could not know, and a footer that contradicted the pill above it — and both are gone.

Every fix in this pass is one row of classes or one condition. Nothing here needed a redesign, a new query, or a feature.

## What's Working

1. **The card, once the header row behaves.** 16px body, 26px leading, 301px measure, `text-pretty`: a two-line question reads as prose, not a snippet. The 44px targets added this pass do not cost a pixel of layout thanks to negative margins on the icon buttons.
2. **The wait, said in words.** “asked today” / “waiting 4 days” / “waiting 23 days” is more honest than a relative timestamp, and it now arrives through `t()` so a Spanish card says “preguntado hoy”.
3. **The origin mark.** “Asked in person · Full-timer wrote it down for you” is the single most useful sentence on the card, and it is the one thing a chat surface could not have said.
4. **The separation of asking and answering.** No ambient composer. You answer on a question; asking is a panel you open on purpose (#646). The trap that made answers into new questions is gone and pinned by tests.
5. **The empty board's own words.** “Nothing asked yet — a question with no person attached belongs here.” explains the category rather than apologising for the emptiness.

## Priority Issues

### [P1] 402px of introduction before the first question (514px in Spanish)
- **What**: the page header was `flex flex-wrap items-end gap-4` with a `flex-1` title block and a `shrink-0` button on the same line. At 375px the row never wrapped, so the title block was squeezed to **179px**: the `h1` took **2 lines (64px)** and the 218-character subtitle took **7 lines (140px)**, with the 148×40 button stranded beside the subtitle's last line. The first card sat at **y402** — 49.5% of an 812px screen. In Spanish the same block rendered the title at **137px / 4 lines (96px)** and the subtitle at **11 lines (220px)**, pushing the first card to **y514** (63%).
- **Why it matters**: this is the whole page's first impression, repeated every time a Trainee opens it from the bell. Four lines of explanation outrank eight open questions, and in Spanish the explanation owns three quarters of the screen.
- **Fix**: the header stacks on phone (`flex-col` → `sm:flex-row`), the action is full-width, and both type blocks get the full 343px. Measured after: `h1` **1 line (32px)**, subtitle **4 lines (80px)**, first card **y370** in English and **y390** in Spanish (a 124px saving in Spanish). The button also became a real 44px primary with the DESIGN 14px radius instead of a 40px capsule.

### [P1] Spanish cards printed their status and their provenance in English
- **What**: `askWaitedWords()` returns `"asked today"` / `"waiting 4 days"` as string literals, and `askOrigin().text` returns four English sentences. Both were rendered raw, so the Spanish page showed **“asked today”** inside the amber chip and **“Asked in person · Full-timer wrote it down for you”** under the question, on a card whose label, button and empty state were all Spanish. The home surfaces already had a local `waitedWords(m, t)` helper; this page was the one that called the library literal.
- **Why it matters**: the wait and the origin are the two facts the card exists to carry. A Spanish-first reader gets both in a language they did not choose, on the page whose whole purpose is being understood.
- **Fix**: a local `waitedWords(m, t)` (same as `AskTheTeam`/`AskStack`) and an `OriginMark` that composes its sentence from `t()` with the pen's name interpolated. Verified live: **“preguntado hoy”** and **“La preguntaste aquí, con tus propias palabras”** on an otherwise-Spanish card. `askWaitedWords` is now unused by any view; it is left in place for the two home surfaces (which still render `askOrigin().text` raw — see follow-up).

### [P1] Every question was stamped “Trainee”, including the full-timer's
- **What**: the card header rendered `t('ask.role_trainee', 'Trainee')` unconditionally, in a 10px uppercase chip. The seeded board included a question written by the Full-timer, and it rendered **“Full-timer Test User · TRAINEE”**. The data model has no author role (`AskMessage` carries `from`, `fromName`, `takenBy`), so the chip could never have been right for anyone but a trainee, and it was wrong even then half the time (a full-timer can record a question *for* a trainee).
- **Why it matters**: it is a role claim on a page where roles decide who may answer. It also cost the header row ~58px, which is why the asker's name wrapped onto two lines.
- **Fix**: the chip is gone. The origin mark already says the one thing that is true about authorship (“written down by …”), and the header row now holds avatar + name + wait chip + trash on one line at 343px. Verified: no card contains the string “Trainee”.

### [P1] The ask composer had no accessible name
- **What**: the panel's `<textarea>` had no `id`, no `aria-label`, no `aria-labelledby`; its only name was the placeholder (“What do you want to ask? Say it how you'd say it out loud.”). An accessibility snapshot showed a `textbox` with an empty name. The answer composers inside cards were labelled properly, so this was the one unnamed field on the page.
- **Why it matters**: this is the only way a Trainee can ask. A screen-reader user met an unnamed multi-line field and a placeholder that disappears on the first keystroke.
- **Fix**: `id="ask-composer"` plus `aria-label` from the existing `ask.composer_label` key (“Your question for the team”). Test: `getByLabelText('Your question for the team')` resolves to the textarea.

### [P1] A pasted link ran off the card and off the screen
- **What**: a question whose body ended in a 200-character URL measured `scrollWidth` **417** against a `clientWidth` of **301** — 116px of the link sat outside the card and was clipped by the viewport, with no horizontal scroll to reach it. `text-pretty` balances lines; it does not break an unbroken word.
- **Why it matters**: pasting a link is normal here (“someone sent me this, is it real?”). The end of the URL — the part that identifies the page — was unreachable.
- **Fix**: `[overflow-wrap:anywhere]` on the question body and on answer bodies. Re-measured on the same document: `scrollWidth` **301** = `clientWidth` **301**, nothing clipped.

### [P1] The empty states described a state the reader was not in
- **What**: the empty state chose its sentence from the *filter* alone. On a board where nothing had ever been asked, the default (Waiting) tab said **“Nothing waiting / Every question has an answer on it.”** — a claim about answers that did not exist. The Answered tab on a board with six open questions said **“Nothing asked yet”**, which is a different false statement. Only All told the truth.
- **Why it matters**: the first-run screen is the one every new Trainee sees, and it congratulated them on a job nobody had done. It is the kind of sentence that makes a reader distrust the counts above it.
- **Fix**: a three-way `emptyCopy`: an empty board says “Nothing asked yet” on every tab; an empty Waiting says “Nothing waiting / Every question has an answer on it.” (only reachable when something has been answered); an empty Answered says “Nothing answered yet / A question lands here once someone answers it.”; an empty Asked-by-me says “You haven't asked anything yet”. New keys in `en.json`/`es.json` beside the existing `ask.empty_*` keys, with Spanish values.

### [P1] “A full-timer will answer this.” under a card with five answers
- **What**: the footer's branch tested `!canAnswer` before anything else, so any question a Trainee did not write showed the line — including one that already carried **“5 answers”** in its own pill, and one whose answers were printed directly above it. Measured on a five-answer card: pill “5 answers”, footer “A full-timer will answer this.”, five replies between them.
- **Why it matters**: it is the page's own status control contradicting itself inside one card, on the tab (“All”) a Trainee uses to catch up.
- **Fix**: the line renders only when the question is genuinely unanswered; an answered card needs no footer because the answers are the footer. Test: a trainee viewing an answered question does not see the line; a trainee viewing an open one still does.

### [P1] The controls that change a question were 24–40px tall
- **What**: measured at `pointer: coarse`: card delete **28×28**, answer delete **24×24**, “Add to your question” **193×32**, “Delete question” **153×32**, “Keep it” **75×32**, ask submit **144×36**, header “Ask the team” **148×40**. The trash sat 10px from the wait chip with no gap to absorb a mis-tap.
- **Why it matters**: one thumb, walking, is this page's real context — and one of these controls deletes a question for the whole team. The commit that introduced them sized them for a mouse.
- **Fix**: every one of them is **44px** on a phone (`max-sm:h-11`, and `max-sm:w-11 max-sm:h-11` with negative margins for the icon-only trash so the visual stays 28px), and the primary is 44px everywhere. Re-measured with coarse pointer active: delete **44×44**, add **44**, submit **44**, confirm **44**. The chips stay at DESIGN's 33px spec — see P2.

## Persona Red Flags

- **Zion (Trainee, asking, one thumb)**:
  - *“What am I looking at?”* — 370px of title, explanation, button and filters before the first question; in Spanish 390, after the fix (was 514).
  - *“Did anyone answer me?”* — the answered card's footer said no while the pill said 5 answers (fixed).
  - *“Can I ask this?”* — the only field for asking announced nothing to a screen reader (fixed).
  - *“My link is cut off”* — the URL ran past the card edge (fixed).
  - *“Does the team see this?”* — the subtitle says “Nothing here resolves”, then the Waiting tab it opens on drops the question as soon as someone answers (not fixed; a copy decision).
- **Jordan (new staff, Spanish-first)**:
  - *The status of their own question was in English* on an otherwise-Spanish card (fixed).
  - *“Who wrote this down?”* was in English too (fixed).
  - *The title took four lines* and pushed the first card to 63% of the screen (fixed: one line from 137px→343px).
- **Alex (Full-timer, answering between meetings)**:
  - *“A full-timer will answer this”* appeared on questions a full-timer had already answered (fixed).
  - *No way to answer from the list* — every answer is a card open, a textarea, a send. Not fixed; there is no cheap version of this that is not a new design.
  - *The chips wrap*, so “All” sits alone on a second row and the queue starts 42px lower than it should (P2).

## Minor Observations

- **The filter row does not fit.** Measured: `Waiting 8` 90 + `Answered 2` 102 + `Asked by me 6` 121 + `All 10` 63 + three 8px gaps = **400px** in a **343px** row. `All` always drops to a second line, which costs 42px and reads as a mistake. Shortening “Asked by me” to “Mine” on the phone would fit (≈341px); that is a copy decision, so it is a follow-up rather than a change here.
- **The radius ladder is inverted.** Card **40px** (`rounded-3xl`) with a **1px** `#F0F0F2` border on a `#F4F4F5` fill: DESIGN.md says Card 24px, borderless, fill-separated — and the border measures **1.04:1** against its own fill, so it is doing no work at all. The inline confirm panel is 24px inside it (should be 20 or less), and the ask textarea is **20px** where Input is 10px.
- **The wait chip misses AA by a hair.** `#BA5900` on `#FFF2D2` = **4.18:1** computed; 12px text needs 4.5. The answered pill (6.23:1) and the origin line (7.03:1) are fine.
- **The toast is positioned under the nav.** The container is `fixed bottom-6` → 24px from the viewport bottom, while the phone nav occupies the bottom **64px** (y748–812). It was not observed rendering after a successful post in this session, so the overlap is computed from its classes, not seen.
- **Reply times mix formats** down one card: “Oct 16”, “Oct 17”, “6d ago”, “5d ago” — the same `relTime` that switches at a day boundary, read in a list.
- **The delete icon and the wait chip are neighbours.** They now have 44px hit areas, but a 44px trash 10px from a 125px status pill is still the tightest pair on the card.
- **The Trainee's default tab is other people's questions.** Waiting showed 8 cards, 6 of which a Trainee can only read (“A full-timer will answer this.”). “Asked by me” is their actual asking surface. Opening on theirs would be a product decision, not a bug.
- **`askWaitedWords` has no view callers left** (only `asksLib.test.ts`). Left in place: the home surfaces still use `askWaitedDays` themselves, and one of them should absorb the helper.
- **The note FAB (48×48 at 311,684) covers the right edge of the delete confirm** at one scroll position — including the “Keep it” escape on a destructive panel. Shell chrome (#1785), measured here, not filed here.
- **The page says “full-timer” three times** in its subtitle and footer and never defines it. Inside the ministry that is the right word; it is listed so the copy review sees it.

## Questions to Consider

- **Should the phone default to “Asked by me”?** A Trainee opens this to see whether their question landed, and lands instead on a list of other people's questions they cannot answer. The archive (#645) is right to exist; making it the default is a different decision.
- **Does “Nothing here resolves” survive the Waiting tab?** The subtitle promises nothing is closed; the default filter closes a question off-screen as soon as it is answered. Either the copy changes or the tab does.
- **Should the six-line explanation live behind a “?”** The subtitle is the best-written thing on the page and the most expensive: 80px in English, 100px in Spanish, on every visit.
- **Would a full-timer answer from the list?** Eight cards, each needing open → textarea → send. One “Answer” field on the focused card would halve the work, but it is a new interaction and does not belong in a critique fix.

## What this pass changed (same PR)

- The header stacks on a phone: title 179px→343px (one line), subtitle 140px→80px, first card 402→370 in English and 514→390 in Spanish.
- The wait chip and the origin mark speak the reader's language on Spanish cards.
- No card claims its author is a “Trainee”; the header row now fits its name.
- The ask composer is named for assistive tech.
- A pasted link wraps inside the card instead of running off it.
- Every empty filter says what is actually true, including an empty board.
- An answered question no longer says a full-timer will answer it; an unanswered one still does.
- Every control that changes a question is 44px on a phone, with the visual size unchanged.
- Five new component tests (red before, green after): the two empty-state lies, the answered-question footer, the missing composer name, and the role stamp.

**Unverified**: dark mode (not observed in this pass); the 44px targets on a real device (measured with `pointer: coarse` emulated in Chromium, not on an iPhone); VoiceOver's reading order over the card header; whether the iOS overscroll chain still nudges the page (no device here).
