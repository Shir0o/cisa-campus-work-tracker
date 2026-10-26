---
target: /attendance (src/views/Attendance.tsx → src/views/AttendanceMobile.tsx at 375x812)
total_score: 16
max_score: 40
na_heuristics:
p0_count: 1
p1_count: 8
target_identity: "file:/Users/twang/cisa-campus-work-tracker/.worktrees/issue-1769/src/views/Attendance.tsx"
timestamp: 2026-10-24T18-11-19Z
slug: src-views-attendance-at-375x812
---
⚠️ DEGRADED: single-context (no sub-agent tool in this session; one assessor read the source and then measured the live render). Every number below is measured at 375×812 against the seeded emulator, not on a mock.

# Critique: Gatherings — the team's attendance record at 375×812

Target: `/attendance`, signed in as **`student.e2e@example.com` (Student / operator)** at 375×812, against the seeded emulator through the dev server.

**The brief says “sign in as Trainee”; a Trainee cannot open this route.** `/attendance` has a floor of `operator` in `ROUTE_MIN_ROLE`, but `canAccessRoute` short-circuits every `manager` (Trainee) onto a hard allowlist that does not contain it (`src/lib/permissions.ts:167`). Verified live: signed in as `trainee.e2e@example.com`, `/attendance` redirects to `/`, and “Gatherings” is absent from that Trainee's navigation (the role matrix in `e2e/journeys/student-community.spec.ts` lists Trainee as `present: ['Home','The Journey','People','Messages']`). So this pass measured the page as the **lowest role that owns it — the Student**, the role whose job description in the same file is literally “mark attendance”, and noted the role question as **#1834** rather than changing a permission the role matrix asserts.

> **Decision (#1834) — the Student owns this route; the brief was wrong.** A Trainee stays off `/attendance`, and the reason is data scope rather than hierarchy. A Student is `operator`, so `seesAllPeople` is true and Firestore's `seesAllContacts()` lets them read every contact: they see the whole room. A Trainee is `manager`, so both layers scope them to the people they are tied to (`visibleTo`, `addedBy`, `founders`, `carers`). Allowlisting the route would therefore hand a Trainee Gatherings filtered down to their own contacts — a partial roster and a partial missed list, which in the room reads as “only these people came”. That is worse than no page. Recorded beside the Trainee allowlist (`src/lib/permissions.ts`) and pinned in the role matrix (`e2e/journeys/student-community.spec.ts`, `src/test/permissions.test.tsx`).

One data note: `npm run seed:emulator` seeds a `gatherings/e2e-sample-gathering` doc that nothing reads, so a freshly seeded `/attendance` is empty (measured: 0 events, 0 rhythms). The seven gatherings measured below were written into the emulator's real `events` collection with the app's own schema — four recorded Fridays, one never-recorded Tuesday, one cancelled Wednesday, one upcoming Worship Night — so the missed list, the roster sheet, the cancelled state and the unrecorded state all exist as real states.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 1 | The phone never says whether attendance was **recorded**. A week nobody touched opens with “We missed 2” as fact; a cancelled week opens with “**Everyone came!**”; the header counts a meeting that hasn't happened (“7 times this season” for 5 held + 1 cancelled + 1 upcoming). |
| 2 | Match System / Real World | 2 | The vocabulary is right — “Who we've missed”, “When we met”, “Came”, “We missed”, “Counting heads is just a way of noticing who's missing” — and a roster-first model is honest. But one screen printed the same gathering as **27 Oct** and **26 Oct**, and called a called-off night a full house. |
| 3 | User Control and Freedom | 1 | Every mark is a silent one-way cycle with no undo. The sheet cannot be dismissed with Escape. “Remove” is offered to a role that cannot remove. |
| 4 | Consistency and Standards | 2 | The sheet is a plain `div` where the rest of the app uses a dialog; “Remove” is a 16px red text-link whose own confirm is a red band; session rows are 16px-radius cards where DESIGN.md's Card step is 24px; the Spanish page keeps English dates and English “attended”. |
| 5 | Error Prevention | 1 | One tap on a name under **Came** records an **absence** — the destructive direction is the default, the target is 32px, its neighbours are 8px away, and nothing confirms or reports it. Delete is offered to a Student with no effect. Marks are still accepted on a cancelled week. |
| 6 | Recognition Rather Than Recall | 2 | “Tap a name to cycle.” asks the reader to hold a hidden three-state machine in their head. Chips never say their state or what a tap will do (accessible name: “LC Lila Chen”). The sheet carries no date; a roster of 7 identical “Friday Night Gathering” rows has no differentiator but the day number. |
| 7 | Flexibility and Efficiency | 2 | Tap-to-mark from an expanded sheet is genuinely fast, and the session rows are honest 320×99 targets. But the phone has **no walk-in check-in** (ADR 0005 §3), no “We met, nobody came”, no search, and every miss costs a trip through People. |
| 8 | Aesthetic and Minimalist Design | 2 | Calm, warm, serif-headed, no chrome noise — this does not look like a CRUD table. But 295px of header and heading sits above the first missed row, the page runs 1,820px inside a 755px scroller, and four of the seven rows carry the same name. |
| 9 | Error Recovery | 1 | No undo on any attendance change; a failed write surfaces only through the global handler; “Remove” closes the sheet and does nothing, which reads as success. |
| 10 | Help and Documentation | 2 | “Tap a name to cycle.” is the only instruction and it teaches the wrong mental model; nothing explains the “walk-in” tag, and nothing states the ADR's promise that a newcomer can be added from here. |
| **Total** | | **16/40** | **Good model, honest voice — and a tap surface that records the opposite of what it looks like it does** |

## Design Specificity Verdict

**LLM assessment.** This is not a generic attendance table. The page is organised the way the team actually thinks: *who we've missed* first (the pastoral consequence), *when we met* second (the record), *coming up* third (the invitation), and a closing line — “Counting heads is just a way of noticing who's missing” — that tells you what the numbers are *for*. The desktop branch goes further, with a This-week band, Rhythm rows carrying the term as a chip strip, one-offs, and a shared expansion that says “Attendance recorded” or “nobody has recorded this one yet”. ADR 0005's roster-first model is visible everywhere: you mark people, not percentages.

The phone branch is where that point of view stops being carried. It is a **read-only summary of the desktop state** with one interaction bolted on: open a gathering, tap names, hope. The two facts the desktop takes care to state — *was this recorded* and *is this week cancelled* — are missing, so the sheet asserts the opposite of both. And the branch is styled with 33 class hooks (`gthm-hero`, `gthm-scard`, `gthm-sdate`, …) that have **no rules anywhere in `src/index.css`** (measured: `grep -c "\.gthm-hero\b"` → 0; only `gthm-kinds`, which this view never renders, and the shared `mds-*`/`ibxs-*` hooks are alive). Every mobile decision therefore lives in an inline Tailwind string with no place to correct it — which is exactly how a card ends up at 16px radius beside another at 24px.

**Deterministic scan.** `impeccable detect` is not installed in this worktree (`no impeccable CLI`), so no CLI scan was run. Every finding below is from the live DOM, the resolved design tokens, or the source.

**Visual overlays.** Live renders at 375×812 in English **and** Spanish, light **and** dark, plus three sheet states (recorded / never-recorded / cancelled) and the delete confirm. Dark mode was verified this time: `html.dark` resolves `--surface #161618`, `--text #FAFAFA`, `--text-dim #A1A1AA`, `--danger #FF7B88`.

## Overall Impression

The record is good and the screen does not trust it. On the phone, Gatherings shows the four things a team needs — who's missing, what happened, what's coming, how the season is going — and then hides the two states that decide whether any of it is true. A Student standing in a room taps a name and the app silently records the opposite; opens last Tuesday and is told two named people were missed at a meeting nobody has taken attendance for; opens a cancelled Wednesday and is told **everyone came**.

None of that needs a redesign. The state exists (`isAttendanceTaken`, `event.cancelled`, `cycleAttendanceStatus`), the shared undo snackbar exists, the confirmation gate exists on desktop, and the copy exists in both locales. The work is to stop the phone branch from guessing: say what is recorded, refuse what is cancelled, make a mis-tap recoverable and visible, and stop offering a delete to a role that will silently not delete.

## What's Working

1. **The order of the page.** Missed faces first, the record second, the invitation third. That is a pastoral order, not a database order, and it survives the phone's narrower canvas.
2. **The closing line.** “Counting heads is just a way of noticing who's missing.” One sentence that reframes the whole screen, and it is translated (“Contar cabezas es solo una forma de notar quién falta.”).
3. **The session row.** A 320×99 target with the weekday, the day number, the month, the name, the place and the count — one tap, no nested controls, no hover-only affordances. Seven of them scan cleanly.
4. **The roster sheet's grouping.** “Came 4” then “We missed 2”, roster members ordered before walk-ins, walk-ins tagged “walk-in” / “espontáneo”. The ADR's distinction is visible at a glance.
5. **The bilingual sheet.** Legend, group heads, walk-in tag, actions and delete confirm all read naturally in Spanish — the phone's best-translated surface.
6. **Dark mode.** Tokens, cards, the scrim and the danger red all resolve cleanly; nothing goes invisible.

## Priority Issues

### [P0] A tap on a name under “Came” records an **absence**, silently and un-undoably
- **What**: tapping a present person's chip calls `cycleAttendanceStatus(current, onRoster)`, which for a roster member returns `'absent'`. Measured on the seeded **23 Oct** sheet: tap “Lila Chen” → `Came 4 / We missed 2` became `Came 3 / We missed 3`. No toast, no confirmation, no undo (`[role="alert"]` count 0, zero occurrences of “Undo” in the DOM). The chip is 32px tall (the wrapper 36px), sits 8px from its neighbours in a wrapped row, and its accessible name is the text “LC Lila Chen” — it says neither its state nor what a tap will do.
- **Why it matters**: this is the screen where attendance is kept. The chips under **Came** are the record — they read as labels, not as switches — so the only tap a reader is likely to make there is an accidental one, and its result is a demotion of a real person to “We missed”, which feeds the missed list and the follow-up queue. During a gathering, one thumb and a busy row is the whole context. The demo above is one tap; a second tap restores it, but nothing tells you that you need to.
- **Fix**: (a) every mark reports itself — the shared `useUndoSnack`/`UndoSnackbar` shows “**{name}** moved to **We missed**” with **Undo** (the reverse is a single cycle back, by construction, so no new write path), (b) the chip's `title`/`aria-label` now states both the current position and the tap's effect (“Lila Chen — came. Tap to mark missed.”), and (c) the target becomes 44px. Tests assert the snackbar message and that Undo calls the cycle again.

### [P1] The screen never says whether attendance was recorded — and an unrecorded week reads “We missed 2” as fact
- **What**: the phone branch has no equivalent of the desktop's `attendance.taken_label` / `attendance.not_taken_yet` line. Measured on **Tuesday Small Group (20 Oct)**, which has no `attendance` field at all: the session row says “**0 attended**” (identical to a recorded zero) and the sheet opens with “Came 0 / No one marked yet / **We missed 2** / Lila Chen · Signup Sam”. The same truth-obscuring runs the other way: the first tap writes `attendance` and instantly makes the rest of the roster recorded absent by omission, with no indication that the record just started.
- **Why it matters**: ADR 0005 makes “We missed” a *bounded, meaningful* list. The phone prints it for a meeting nobody has looked at, which turns the record's most pastoral sentence into noise. And the row's “0 attended” is the only signal an unrecorded week gets — on a page whose job is keeping the record straight.
- **Fix**: rows say **“Not recorded”** instead of “0 attended” when `isAttendanceTaken(gathering)` is false, and the sheet opens with a status line (“Attendance not recorded yet — tapping a name starts the record.” / “Attendance recorded.”). Tests cover both the row and the sheet.

### [P1] A **cancelled** week says “Everyone came!” and still accepts marks
- **What**: measured on **Wednesday Women (21 Oct)**, `cancelled: true`: the sheet header reads “Cancelled”, then “Came 0 / No one marked yet / We missed 0 / **Everyone came!**”, and the legend “Tap a name to cycle.” is still live — every chip still calls `cycleAttendance`, so a cancelled night can be marked present. Desktop renders the honest sentence instead (`attendance.week_cancelled`: “This week was called off — nobody's counted absent.”) and hides the lists entirely.
- **Why it matters**: “Everyone came!” on a night that was called off is a false statement about a meeting that did not happen, on the one screen that is supposed to be the record. ADR 0005 is explicit that a cancelled week counts nobody absent; the phone says the opposite in the strongest available wording.
- **Fix**: a cancelled gathering renders the desktop's sentence instead of the two lists, and no chip is tappable. Test: the sentence renders, “Everyone came!” never does, and no chip is a live control.

### [P1] “When we met” lists a meeting that hasn't happened — and “Coming up” puts it on the wrong day
- **What**: `sessions` is every event sorted newest-first, with no future filter, so **Worship Night (27 Oct)** appears under “When we met” as “Tue **27** Oct … 0 attended”. The same gathering appears under “Coming up” as “**26** Oct” — `new Date(ev.date)` parses `'2026-10-27'` as UTC midnight, so west of UTC it renders a day early (measured in `America/Los_Angeles`; the “When we met” row uses `new Date(s.date + 'T12:00:00')` and is right). The header inherits the same unfiltered count: “We've come together **7 times** this season, averaging **2 people** each time”, where 7 = five meetings actually held (four Fridays plus one nobody recorded), one cancelled week and one that has not happened; the average is dragged to 2 by the two zeros — over the four recorded weeks it is **4**.
- **Why it matters**: on a schedulers' page, a day-of-the-week and a date that disagree on the same screen is the kind of wrong that gets someone to the wrong room. And a season figure that counts future meetings makes the one number the page leads with untrue.
- **Fix**: “When we met” keeps cancelled weeks (they belong to the record) but drops anything dated after today; “Coming up” parses the date as a local day, matching the row above it; the count is over **gatherings that were held and not cancelled** (“5 times”), and the average is over the ones somebody **recorded** (“4 people”) — an unrecorded week is unknown, not zero. Both moved into pure `heldGatherings` / `averageAttendance` / `localDay` helpers in `src/lib/attendanceRoster.ts`, and desktop's header/FiguresCard read the same numbers.

### [P1] “Remove” and “Edit details” are offered to a Student — and Remove silently does nothing
- **What**: the sheet's manage row is rendered unconditionally, but `handleDeleteEvent` opens with `if (!isAdmin …) return` and `handleToggleRoster` with `if (!isAdmin) return`. Measured as a Student: tap **Remove** → inline confirm “Remove this gathering and its record?” → tap **Remove** → the sheet closes, nothing is deleted (the doc was still in `events` afterwards), and the row is still on the page with no message. Desktop renders those two controls only for Full-timers (`isAdmin &&`).
- **Why it matters**: this is the one destructive control on the screen, and for the role measured it is a placebo that *looks* like it succeeded because the sheet closes. A future Student who taps it to remove a duplicate gathering will believe the duplicate is gone.
- **Fix**: the manage row is gated on `isAdmin`, matching desktop. Test: a Student sees neither control; a Full-timer still gets the two-step confirm.

### [P1] The roster sheet is not a dialog, and a keyboard cannot leave it
- **What**: the sheet is a `div.fixed.inset-0` with no `role`, no `aria-modal`, no labelled heading relationship; opening it leaves focus on the session row **behind the scrim** (`document.activeElement` measured as the row), and Escape does nothing (sheet still open). The rest of the app's sheets (`PopupFrame`, the inbox sheet) provide dialog semantics — this one is the outlier.
- **Why it matters**: marking attendance is the page's one job, and the surface that does it is announced as “more page” with focus trapped behind an overlay. A screen-reader user opens the sheet and is still reading the gathering list; a keyboard user can tab into the page underneath and has no key to close.
- **Fix**: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` on the title, focus moved into the sheet on open, Escape closes, and the scrim keeps its tap-to-close. Tests: role/label, Escape, and focus.

### [P1] Every control that changes attendance is below the app's own 44px floor
- **What**: measured on the 23 Oct sheet — roster chips **32px** tall (wrapper 36), the make-a-to-do action **26×26**, Close **28×28**, “Edit details” **88×16**, “Remove” **68×16**, “Message {name}” on the missed card **36×36**, and the delete confirm's Cancel/Remove ≈30px. DESIGN.md's own button spec is 44px (small variant 32).
- **Why it matters**: this is one-handed, standing-up, in-a-room use. A 16px text link and a 26px icon are not targets; they are coincidences of pointer accuracy. The two 16px links are also the destructive and the edit path, in the same row.
- **Fix**: every interactive element in this branch gets a 44px minimum (chips, actions, close, the manage links, the message button, the confirm pair), with the compact visual preserved by padding rather than by shrinking the hit area.

### [P1] The Spanish page keeps English dates and English “attended”
- **What**: measured with `cisa_language=es`: the eyebrow reads “**Saturday, October 24**”, every session row reads “**Tue 27 Oct**”, “**Wed 21 Oct**”, “**Fri 23 Oct**”, and every count reads “**4 attended**” / “**0 attended**” — while the sheet one tap away is fully Spanish (“Vinieron 4”, “Faltaron 2”, “espontáneo”). The empty state also hard-codes “Nothing on the calendar this week.” (`attendance.attended` = “asistieron” already exists in `es.json`; the markup ignores it).
- **Why it matters**: a bilingual team reads the same record in two languages, and a date is the one field you cannot afford to leave in a language the reader may not use. It also means the page's most-scanned string — the count on every row — is the one that never translated.
- **Fix**: dates go through `Intl.DateTimeFormat` on the reader's language (matching the pattern the prayer list uses), the count uses `t('attendance.attended')`, and the empty state gets a key.

### [P1] The missed card is a `<div>`, so it is not a control
- **What**: the whole row is `<div onClick>` with `cursor: pointer`, no `role`, no `tabindex`, no key handler — measured `tabindex: null, role: null`. It is the page's door into a person's detail page, and the only way in from the phone.
- **Why it matters**: keyboard and screen-reader users meet a card that reads as two lines of text and cannot be opened. The sibling action (Message) is a real button; the row itself is not.
- **Fix**: the row becomes a real `<button>` with the person's name in its accessible name, keeping the message action as a sibling (not nested). Test: `getByRole('button', { name: /Casey Untied/ })` opens the contact.

## Persona Red Flags

- **Timothy (Student, marking attendance in the room)**:
  - *“Did that just mark her absent?”* — yes, silently, from a 32px chip under **Came** (fixed: it now says so and offers Undo).
  - *“Was this week recorded?”* — the row said “0 attended” and the sheet said “We missed 2” for a week nobody had touched (fixed: “Not recorded” on the row, a status line in the sheet).
  - *“Everyone came?”* — on a cancelled Wednesday (fixed).
  - *“Which Tuesday was this?”* — the sheet has no date (noted; the row's date is one tap back).
- **Jordan (new staff, Spanish-first)**:
  - *The page switches language around the sheet*: “Tue 27 Oct … 4 attended” above, “Vinieron 4” inside (fixed).
  - *“Saturday, October 24”* on an otherwise Spanish page (fixed).
- **Sam (screen reader / keyboard)**:
  - *The sheet is not a dialog*: focus stays on the row behind the scrim, Escape does nothing, and the chips announce “LC Lila Chen” with no state and no action (fixed).
  - *The missed list cannot be opened from the keyboard* (fixed).
- **Alex (Full-timer passing through)**:
  - *“Remove”* works — but for a Student it was theatre (fixed by hiding it).
  - The **season figures** read 7 gatherings and an average of 2, when four happened at an average of 4 (fixed).

## Minor Observations

- The missed card's **Message** button opens `https://messages.google.com/web/` when the contact has no phone number (`openMessage` falls back there) — measured on “Casey Untied”, who has no phone. The button now only renders when there is a number to reach.
- “Missed **4** gatherings since Friday Night Gathering” counts every session the person was rostered for *on any gathering*, not just the named one: Casey Untied was on the Friday roster for 3 of those 4; the fourth is a Tuesday group he is not part of. The number is defensible as “gatherings missed”, but the sentence implies the named gathering. Filed as **#1835** rather than reworded here.
- The attended count is painted `--accent`, which resolves to `#52525B` — the same grey as the location line, so the number that should lead each row is indistinguishable from meta.
- Footnote contrast: “Counting heads…” is `--text-dim` at 70% over `#F4F4F5` → **3.4:1** at 13px (AA needs 4.5). The eyebrow date is `--text-dim` at 80% → **4.3:1** at 12px/600. Both are computed from the resolved token and its alpha; everything else measured ≥5.5:1 (body 5.5, meta 7.0, danger 6.6).
- Session rows are `rounded-2xl` (16px) where DESIGN.md's Card step is 24px, and sit beside missed cards at 24px; both also carry a hairline border on a tonal fill, which the Fill-Over-Border rule reserves for edges, not cards.
- 33 `gthm-*` hooks on this branch have no CSS rules (the shared `mds-*` / `ibxs-*` hooks do), so the screen cannot be corrected in CSS — only in inline classes.
- The empty states (`When we met`, `Coming up`) keep the dashed-outline + `shadow-inner` + 30%-alpha treatment that reads as an invisible box on white; not observed live (the seeded data fills both), so this is a source observation, not a measured one.
- The page title and person names are set in Literata, which DESIGN.md's Scripture Exclusivity Rule reserves for scripture. It is the app's established voice across screens and is noted, not changed.

## Questions to Consider

- **Should a Trainee see Gatherings at all?** A Student (operator) can; a Trainee (manager) cannot, because Trainees are an allowlist and this route is not on it. Trainees are the people most likely to be *in the room* with a newcomer. Filed as **#1834** with the live evidence; nothing was changed.
- **Is “tap a name to cycle” the right model for a record?** A cycle has no direction; a record does. Two explicit marks per person (or a single “came” toggle plus a separate “mark missed”) would cost one more control and remove the class of error this pass had to paper over with Undo.
- **Who fixes a week nobody recorded?** The phone can start a record by tapping one person, and from that moment everyone else is absent by omission. The honest alternative is a “this week happened” action first — that exists on desktop (“We met, nobody came”) and is missing here.
- **Where does a walk-in get added on a phone?** ADR 0005 §3 promises zero-friction check-in of a newcomer from the search input; the phone has no input at all. Filed as **#1836**; it needs a design decision, not a patch.
- **Is “we missed” a per-gathering fact or a season fact?** The card's sentence mixes the two (see Minor Observations). Worth one decision, then whichever sentence wins.

## What this pass changed (same PR)

- A tap that moves someone now says so and can be undone — back to the exact state it replaced, including “no mark” on a week nobody had recorded; the chip states its position and its effect, and is 44px.
- Session rows say **Not recorded** when nobody has recorded the week, and the sheet states whether attendance was recorded.
- A cancelled gathering shows the called-off sentence instead of “Everyone came!”, and cannot be marked.
- “When we met” no longer lists meetings that have not happened; “Coming up” uses the same local-day parse, so the day matches the row above; the season count and average come from gatherings actually held and not cancelled.
- A Student no longer sees **Edit details** / **Remove**; a Full-timer still gets the two-step confirm.
- The sheet is a labelled dialog: focus moves in, Escape closes.
- Every control in the sheet and the missed card has a 44px minimum.
- Spanish: dates, “attended”, the cancelled label and the empty state follow the reader's language (“sábado, 24 de octubre”, “4 asistieron”, “Cancelada”, “Sin registrar”).
- The missed card is a real button, and its Message action only appears when there is a phone number to reach.

**Out of scope, stated**: the desktop expansion's chips have the same silent cycle; the Undo added here lives on the phone sheet, the surface this pass measured.

**Unverified**: the coarse-pointer hit areas (headless reports `pointer: fine`, so the 44px rules were verified as classes and by inert measurement, not by a real thumb); VoiceOver's reading order across the sheet's two groups; whether a long roster (40+) still scrolls comfortably in the 85vh sheet — the measured sheet was 465px tall for 6 people.
