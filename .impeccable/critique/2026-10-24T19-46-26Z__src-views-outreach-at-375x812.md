---
target: /outreach (src/views/Outreach.tsx at 375x812)
total_score: 22
max_score: 40
na_heuristics:
p0_count: 1
p1_count: 9
target_identity: "file:/Users/twang/cisa-campus-work-tracker/.worktrees/issue-1771/src/views/Outreach.tsx"
timestamp: 2026-10-24T19-46-26Z
slug: src-views-outreach-at-375x812
---
⚠️ DEGRADED: single-context (no sub-agent tool in this session; one assessor read the source and then measured the live render). Every number below is measured on the seeded emulator at 375×812, not on a mock. The seeded emulator ships no outreach records, so three representative outings were written to the emulator for this pass (a this-month outing with three names, an earlier one, and an empty one); the production-shaped empty state was also captured before they existed.

# Critique: Gospel — the monthly outing at 375×812

Target: `/outreach`, signed in as `fulltimer.e2e@example.com` (and cross-checked read-only as `community.e2e@example.com`) at 375×812, on the seeded emulator through the dev server (`VITE_E2E_MODE=true`).

**The brief says “sign in as Trainee”; a Trainee cannot open this route, and that is deliberate.** `src/lib/permissions.ts` (`/outreach` → viewer, `canAccessRoute` returns true only for `admin` and `viewer`) and the page's own header comment say outreach is full-timer + community *by design* — the ladder does not apply. Trainees and students are redirected to `/`, and `src/test/Outreach.test.tsx` asserts that. So this pass measured the two roles that own the page — the Full-timer, who logs, takes and edits; the Community member, who reads and can still log — and **filed no permission issue**. No permission was changed.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | The header stated a fact the list contradicted: **“3 people left us a number”** while one of those three rows read **“no number written down”**. The open/closed state of an outing was told only by a rotating chevron (`aria-expanded` absent). |
| 2 | Match System / Real World | 3 | The vocabulary is the ministry's own — *“A number given is a door held open”*, *“Counted only so nobody waits by a phone that never rings”*, *“Nobody, this time. It still counted.”* — and the record is ordered the way a memory is: where, who went, what was handed out, and the names. But the page's headline number was wrong about the numbers. |
| 3 | User Control and Freedom | 2 | The log sheet ignored Escape (verified: still open after the keypress) and dropped focus on `BODY`, so the keyboard path back out was invisible. Deleting an outing asks twice and has no undo. |
| 4 | Consistency and Standards | 2 | Cards are `rounded-3xl` = **40px** where DESIGN.md says Card = 24px, with 24px nested rows inside; the input constant is `rounded-xl` (24px) on an `h-11` field, which the No-Stadium rule forbids; buttons are pills where DESIGN says 14px; the selected “who went” chip was a **14% tone wash** against the Inversion Rule; and one page printed two date formats (**“19 Oct”** in the gutter, **“Sep 16”** in the meta) with the months English in Spanish. |
| 5 | Error Prevention | 2 | Submit is correctly disabled until “Where” is filled, and delete is a two-tap confirm. But the destructive pair lives in a **90×16** and **64×16** text link inside the open card, and the log form accepts any string as a phone number. |
| 6 | Recognition Rather Than Recall | 2 | Dates, names, counts and captions are all visible — then every queue face rendered **`??`** instead of the person's initials, replacing the one cue that says “this is a person, not a record”. |
| 7 | Flexibility and Efficiency | 2 | One tap takes a name and drops a tomorrow-to-do (`I'll take this`), which is the right fast path. But there is no search or filter, no keyboard path through the queue, and the ⋯ menu is a **28×28** target. |
| 8 | Aesthetic and Minimalist Design | 1 | **The list was unreadable.** At 375px the card header gave the title a **22px-wide** column: “Cedar Park — the north lawn” stacked one word per line to **157px** tall and the card to **548px**, so a three-word title read as a ransom note and one outing filled a screen. **1,006px** of header, queue and section heads sat above the first record. |
| 9 | Error Recovery | 2 | A failed load gets `DataLoadError`, and take/remind toast. A failed save leaves the sheet open with no message beyond the global handler; delete cannot be undone. |
| 10 | Help and Documentation | 3 | The inline guidance is real help and the best thing on the page: *“Tap to read it back”*, *“The names become real contacts tonight”*, *“Say where you went”*. It is task-focused and in place. |
| **Total** | | **22/40** | **Acceptable (55%) — a page with a voice and a broken phone layout** |

## Design Specificity Verdict

**LLM assessment.** This is not a generic “events” CRUD. It is a monthly field log whose cargo is names: the record asks where you stood, who went, what went into hands, what it was like, and *who left us their number* — and then hands those names to a queue that says how many days each one has been waiting. The copy is authored rather than generated (“A number given is a door held open. It doesn't stay open long.”), it refuses triumphalism (“Nobody, this time. It still counted.”), and it explains its own numbers (“Counted only so nobody waits by a phone that never rings.”). For an outward-facing ministry record that is exactly the right register: plain, unsentimental, and about people rather than totals.

Where it stops being specific is the *structure*. `/outreach` is the one People route with **no phone branch** — Attendance, History, My Day, Prayer, Visits and even the Journey board all have a `*Mobile.tsx` — so the desktop card was simply poured into 375px and its header collapsed. The resulting screen is not a mobile design with a flaw; it is a desktop design at the wrong width. That, plus a header sentence that flatters the data, is what separates this from the Prayer page's 22/40, which failed on details rather than on the read itself.

**Deterministic scan.** `impeccable detect` is not installed in this worktree (the launcher is absent from the repo), so no CLI scan was run; every finding below is from the live DOM. The detector would not have caught the P0 — a flex child crushed to 22px is a layout result, not a markup smell — nor a header claim that contradicts a row, nor an Escape key that does nothing.

**Visual overlays.** One live render at 375×812 (device scale 1) in English as the Full-timer, in Spanish as Community, and in dark mode as the Full-timer, plus the log sheet. Overlays were not injected (no live-server injector in this worktree); the console reported no app errors on the page. Dark mode was **observed** this time and reads correctly (no white-on-white, the primary pill inverts to `#FAFAFA` ink with `#0A0A0B` text).

## Overall Impression

The best writing on any screen in this sweep is on this one, wrapped around the worst list. “A number given is a door held open” is a sentence a design cannot generate; it is the page's whole ethic in nine words, and the pending queue underneath it is the right shape for the work. Then the outing card prints its own title one word per line, the queue calls all three people `??`, and the header rounds the truth up by one person.

Every fix below is local: one header layout, one fallback, one dialog wrapper, a set of hit heights, one sentence, one date formatter. None of it needs a redesign, and none of it needs a new feature. The page already knows what it is.

## What's Working

1. **The queue is the job, and it is first.** “People we met, not yet reached” sits above the record log, with days-waiting on every row and the cold ones ringed in warning amber. A full-timer opening this on a Monday sees the three people to ring before they see a single past outing.
2. **The copy carries the ministry's ethic, not a brand voice.** “Nobody, this time. It still counted.” and “Counted only so nobody waits by a phone that never rings.” tell the reader what the numbers are *for*, and refuse to make an empty outing a failure. On an invitational record that is the difference between a report and a ledger.
3. **The open card is a proper record.** Where it happened, how it went in two readable paragraphs at 15px/1.55, who went with faces, what was handed out in serif figures, and every name with its number, note and *reached / still waiting* state. Nothing is hidden behind a second tap.
4. **Two roles, one page, no clutter.** Community sees the same page without take/remind/edit/remove — verified live: `Abrir` only, no admin row — and can still log. No disabled controls, no “you can't do this” affordances.

## Priority Issues

### [P0] The outing card header crushed the title to one word per line
- **What**: the header is a single flex row of date (52px, `shrink-0`), content (`flex-1`), faces-and-counts cluster (`shrink-0`), chevron (16px). At 343px of card width the fixed pieces plus 16px gaps left the content column **22px** wide. Measured on the seeded this-month card: `<h3>` **22×157** (“Cedar Park — the north lawn” stacked one word per line), meta line one token per line, card **343×548** — and the earlier cards 343×377 and 343×163, each collapsing differently depending on how many faces it had. Every card in the list was affected; the whole scroll pane measured 2,602px for three outings.
- **Why it matters**: this is the page's whole archive. A reader cannot scan a date, a place and a count at a glance — they have to reassemble the title word by word, and one outing occupies a full phone screen. On a page whose sentence is *“Tap to read it back”*, the thing you tap cannot be read.
- **Fix**: give the faces-and-counts cluster its own row below the title on phones (`w-full` + `flex-row` under `sm`, and back to an end-aligned column at `sm`), park the chevron absolutely at the top-right under `sm` so it stops stealing a column, and reserve 32px of right padding for it. Verified: title **209×52**, card **343×245 / 225 / 151**, pane **2,157px**. Desktop is untouched (936×132, one-line title, static chevron).

### [P1] The queue's faces said `??`
- **What**: every pending row and every name row rendered **`??`** instead of initials — measured on all three queue rows and announced by the accessibility tree as `text: ?? Casey Untied`. The cause is a dead fallback: `initialsOf` was `getUserInitials(name) || fallback…`, but `getUserInitials` returns the string `'??'` for an empty name, which is truthy, so the fallback never ran.
- **Why it matters**: the page's first line of defence is that these are *people*. A pair of question marks is what the app shows when it does not know who someone is — so the queue reads as three unknowns, on the screen whose whole purpose is that their names are known.
- **Fix**: pass the fallback *into* the initials helper (`getUserInitials(name || fallback || '?')`). Measured after: `CU`, `HB`, `MW`. Unit test asserts the face is `CB`, not `??`.

### [P1] The log sheet was not a dialog, and Escape did nothing
- **What**: the sheet root was a bare `<div>`. An accessibility probe found `role: null`, `aria-modal: null`, no accessible name, `document.activeElement` still `BODY`, and the tab order after opening ran through the page **behind** it (`Open navigation`, `Search`, `Notifications`, `Profile`, the card's ⋯). `Escape` left it open (verified). The close control was a **32×32** button with no name.
- **Why it matters**: a screen-reader user was told nothing had happened when the log form opened, then tabbed through the page they had just covered. A keyboard user who opened the wrong sheet could not get out with the key everyone reaches for.
- **Fix**: `role="dialog"`, `aria-modal="true"`, an `aria-label` from the visible title, `tabIndex={-1}` on the sheet focused on mount, Escape closes, Tab/Shift-Tab cycle within the sheet (disabled controls skipped), and the close control is a named **44×44** (`Close`). Verified live: Tab from the sheet enters the form, 24 tabs stay inside, `Cancel → Close` wraps, Shift-Tab from the sheet lands on the last control; Escape closes. Tests assert the role, the modal flag, the name and the Escape exit.

### [P1] “Who spoke with them” was an unnamed select
- **What**: the per-name `<select>` in the log form had no `id`, no `aria-label` and no `aria-labelledby`; an accessibility dump listed it as `{tag: SELECT, id: null}` with no name, while every other field sat inside a `<label>`.
- **Why it matters**: this is the field that credits a conversation to a teammate — the one fact the follow-up queue depends on. An unnamed combobox is unusable to a screen-reader user, and it is the only control in the form without a name.
- **Fix**: `aria-label` from a new `outreach.spoke_with_who` key (“Who spoke with them” / “Quién habló con ellos”). Test resolves it with `getByLabelText`.

### [P1] Everything that changes the record was 16–36px tall
- **What**: measured on the live page at 375px — `I'll take this` **104×36**, `Remind Zion` **108×36**, `Ring them` **94×36**, `Open` **64×36**, the ⋯ menu **28×28**, `Edit this one` **90×16**, `Remove` **64×16**, the sheet's close **32×32**, “who went” chips **36** tall, `Another name` **116×20**.
- **Why it matters**: this page is used standing up, one-handed, usually on the way back from somewhere. Taking a name and opening a person are the two things it exists for, and the destructive `Remove` is the smallest target in the open card — one tap from a record that cannot be undone.
- **Fix**: `h-11 sm:h-9` on the shared small-button class (phone 44, desktop unchanged), `min-h-11 sm:min-h-0` on the inline Edit/Remove/Add-another-name controls, and a 44×44 named close. Re-measured: every row action **44** tall, Edit **90×44**, Remove **64×44**. Two targets are still small and are **not** fixed here: the shared `RowActions` ⋯ trigger (**28×28**, used on every row in the app — filed as a follow-up) and the top-bar logo (**32×32**, shell — #1785).

### [P1] “38 days waiting” was 3.87:1
- **What**: a cold name rendered `#BA5900` on the card's `#F4F4F5` at 12px — **3.87:1** measured, below the 4.5:1 AA floor. The same value at 5 days (`text-on-surface-variant`) was fine.
- **Why it matters**: the one label that says *this person has waited five weeks* was the least legible text on the row. The cold cards already carry an amber border, so the warning was being said twice and read zero times.
- **Fix**: the words go to ink (`text-on-surface font-medium`) and the card's warning border carries the signal — the same call Settings.tsx made for its warning badge. Re-measured: no failing text left on the page except the shared profile avatar and the 14%-wash chips (see below).

### [P1] The header counted people with no number as having “left us a number”
- **What**: the sentence read **“3 people left us a number and haven't heard back yet”**. The three rows underneath were Casey — *“no number written down”* — plus two with numbers. The pending list is every unreached name regardless of whether there is a number, so the count and the claim disagree on the same screen, in both languages (“3 personas nos dejaron su número”).
- **Why it matters**: this is a ministry's public-facing record. Saying a person left a number when the note beside them says they did not is the kind of small untruth that makes every other number on the page suspect — and it is the first sentence a full-timer reads.
- **Fix**: the sentence now states only what is true — “{n} people **still haven't heard back yet** — that's the whole job this week.” (es: “siguen sin recibir respuesta”). The row still says whether there is a number. Test asserts the new wording *and* the absence of the old claim, with a no-number person in the fixture.

### [P1] Spanish dates printed in English
- **What**: month names came from a hard-coded `['Jan','Feb',…]` array, so the Spanish page rendered **“19 Oct”**, **“Sep 16”**, **“Aug 14”** while every other word on the page was Spanish. The same page also printed two orders — “19 Oct” in the date gutter, “Sep 16” in the meta line — in English.
- **Why it matters**: the app ships a Spanish UI and a Spanish-first audience; a date in the wrong language is the clearest sign that a page was not built for the reader, and this is the page that records who was met.
- **Fix**: months and short dates go through `toLocaleDateString(language, …)`; measured after: **“19 oct”**, **“16 sept”**, **“14 ago”**, and the Spanish meta line reads **“16 sept”** — day-first, as Spanish does. Test pins the helper to ICU's own Spanish output rather than a guessed string.

### [P1] The form's only instruction was squeezed into a 41px column
- **What**: the sheet footer was a single non-wrapping row — message (`flex-1`), Cancel (95px), Log (132px), 24px of gaps. On 375px the message got **41px** and wrapped to **five lines** (“Say / where / you / went.”), stacked between the form and the buttons.
- **Why it matters**: that line is the only thing telling the reader *why* the primary button is disabled; at 41px it reads as a printing error, and it pushes the buttons into the corner.
- **Fix**: the footer wraps — the message gets a full row on phones and the buttons sit right-aligned beneath it. Measured width after: **303px, one line**.

### [P1] The selected “who went” chips were a wash with no state for anyone who cannot see it
- **What**: a selected person was `bg-stage-accent-soft` + tone text — a **14% tone wash** — where DESIGN.md's Inversion Rule says selection is a solid ink inversion, and the chip announced no state at all (`aria-pressed` absent).
- **Why it matters**: on a list of seven teammates, “who went” is read at a glance, and a 14% wash beside a 0% chip is a difference of one shade. For a screen reader the chip is just a name, pressed or not.
- **Fix**: selected chips invert to `bg-primary text-on-primary` (carbon ink), matching the design system's chip selected state, and carry `aria-pressed={true|false}`. Test asserts pressed and unpressed states.

### [P2] The card never said whether it was open
- **What**: the toggle button had no `aria-expanded` and no `aria-controls`, and its accessible name was the entire card — **324 characters**. The chevron showed the state visually only.
- **Why it matters**: the card is the page's main interaction; “expanded” is a state a screen reader needs and a visual reader gets from a 16px rotation.
- **Fix**: `aria-expanded={open}` and `aria-controls` to the panel id, on the toggle. (The 324-character name is a bigger question — see Questions.)

## Persona Red Flags

- **Alex (Full-timer, back from the park, one thumb)**:
  - *“Can I scan last month?”* — the title column was 22px, so no (P0, fixed).
  - *“Who is this?”* — three rows of `??` at the top of the queue (fixed).
  - *“Take this one before I forget”* — the button was 36px, next to a 28px ⋯ (fixed to 44; the ⋯ is shared chrome, follow-up).
  - *“Can I get out of the log sheet?”* — Escape did nothing (fixed).
- **Jordan (new staff, Spanish-first)**:
  - *Dates in English* on an otherwise Spanish page (fixed).
  - *“Who spoke with them?”* — the select announced nothing; visually it reads “Zion Adeyemi habló con ellos”, so the meaning was there for sighted readers only (fixed).
  - *“Say where you went”* in a 41px column, five lines tall (fixed).
- **Sam (screen reader / keyboard)**:
  - Opening the log sheet announced nothing and left focus on the page (fixed: dialog semantics, focus, trap).
  - The card's open state was invisible to assistive tech (fixed: `aria-expanded`).
  - The queue's faces announced as “??” (fixed).
  - Still open: the card's toggle name is a 324-character run-on of the whole card; the ⋯ is 28×28; the “reached” chip is a tint the detector cannot score.

## Minor Observations

- **The empty state says everything twice.** With no records the page printed “Nothing written down yet. Log a month once you're home…” in the header *and* “Nothing here yet. A gospel outing gets written down after you're home…” in a panel, with a **“Log a gospel outing”** button in each (two identical primary actions, both above the fold), then a stats strip reading **0 months out / 0 names / 0 Bibles**. Captured before seeding; not changed here.
- **The radius ladder is inverted.** Cards are `rounded-3xl` (**40px**, the shell value) with nested name rows at **24px**; the modal is **28px**, which is not on the ladder at all; the input constant is `rounded-xl` (**24px**) on a 44px field, which the No-Stadium rule explicitly forbids, and the buttons are pills where DESIGN says 14px. It reads calm, but it is not the system.
- **Two date formats on one page** — “19 Oct” in the gutter and “Sep 16” in the meta — now both follow the reader's language, but they still disagree on order.
- **The meta separators dangle.** The `·` between facts is its own flex item, so at 209px a line can end on “·” (“5 days ago · 10 of us went ·”) with the next fact on the line below.
- **`Group` is declared inside the component body**, so every parent re-render gives it a new identity and React remounts the whole list. It cost this pass a stale test handle, and in the app it resets a card's two-tap `Remove` confirm whenever a snapshot arrives or another card is toggled.
- **The photos badge is dead.** `photoCount` renders as a “4” chip beside the names, but no record ever writes anything but `0` (`photoCount: 0` on every save, never editable) and there is no viewer anywhere on the page. Seeded data shows what it would look like; production never will.
- **The section head is squeezed.** “People we met, not yet reached” renders **131px** wide and **84px** tall (three lines) beside a two-line caption, on a screen with 343px available.
- **The first record starts 1,006px down** a 755px pane — header, CTA, section head and queue all come first. That is defensible (the queue is the job), but it means the record log is always at least one scroll away.
- **No undo on delete.** Two taps, then gone, on a shared record. `UndoSnackbar` already exists on this page for the queue.
- **The open card's border turns stage-slate** (`border-stage-accent`) — chroma used for chrome, against the Reserved Chroma Rule. Minor, and it is the one place the open state is visible at all.

## Questions to Consider

- **Should `/outreach` get its own phone layout?** Every sibling People route branched for 375px; this one did not, and the P0 is exactly what that costs. A queue + a one-line outing card (date, place, names, handed-out) would fit a phone without the faces cluster at all.
- **What is the card's toggle *for*?** Its accessible name is the whole card because the whole card is one button, with three more buttons inside it. If the summary were a heading and the expand a small “read it back” control, the title would be a heading, not a 324-character button label.
- **Should a person with no number sit in “People we met, not yet reached” at all?** They cannot be rung, so the queue's verb (“Ring them”/“I'll take this”) does not apply. A second line — “met, no way to reach” — might be more honest than a row that looks actionable.
- **Is the photos badge a promise?** Either the log form should accept photos or the badge should go; a “4” that opens nothing is the kind of detail that quietly teaches people the page is not finished.
- **Should the stats strip exist on a phone?** At 375 it is 206px of totals after the last card, and its caption (“Counted only so nobody waits…”) is the best sentence in it.

## What this pass changed (same PR)

- The outing card's header no longer collapses the title: the faces and counts move to their own row on phones, the chevron is parked out of the text column, and the title reads **209px** wide instead of **22px** (card 548px → 245px, list 2,602px → 2,157px). Desktop is unchanged.
- The queue shows a person's initials (`CU`, `HB`, `MW`) instead of `??`.
- The log sheet is a real dialog: named, `aria-modal`, focused on open, trapped for Tab, closed by Escape, with a named 44×44 close.
- The “who spoke with them” select has an accessible name.
- Every control that changes the record is 44px tall on a phone (row actions, Edit, Remove, Add another name, the close), while desktop keeps its 36px rhythm.
- “38 days waiting” is ink; the card's amber border still says the rest.
- The header sentence no longer claims people left numbers they did not.
- Months and short dates follow the reader's language, in both the gutter and the meta line.
- The form's footer hint gets a full row on phones instead of five lines in 41px.
- “Who went” inverts on selection and exposes `aria-pressed`.
- The outing toggle announces `aria-expanded` and points `aria-controls` at its panel.
- Two locale strings changed (`pending_left_singular` / `pending_left_plural`, en + es) and one added (`spoke_with_who`, en + es).

**Unverified**: the focus trap with a real screen reader (verified by keyboard traversal only); the 44px targets under a real touch pointer (headless Chrome reports `pointer: fine`, so the mobile heights were measured with the `sm:` breakpoint inactive, which is the mechanism that applies them); and whether iOS's date input renders “Where” and “When” in the reader's language (the native control follows the OS).
