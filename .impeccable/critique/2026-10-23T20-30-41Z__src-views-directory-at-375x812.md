---
target: /directory (src/views/Directory.tsx at 375x812)
total_score: 19
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 7
target_identity: "file:/Users/twang/cisa-campus-work-tracker/.worktrees/issue-1762/src/views/Directory.tsx"
timestamp: 2026-10-23T20-30-41Z
slug: src-views-directory-at-375x812
---
⚠️ DEGRADED: single-context (no sub-agent tool exposed in this session; Assessment A read the source first, Assessment B measured the live render after; no second independent assessor).

# Critique: `/directory` — People at 375×812

Target: the People directory as a Trainee meets it on a phone — `src/views/Directory.tsx` (1,785 lines) rendered live on the seeded emulator, signed in as `trainee.e2e@example.com`, at 375×812, with the header, kind segments, search, filters, tag chips, selection bar and person cards. Not a mock: every number below was read out of the running page.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Selection survives a filter that hides every selected row, so the bar says **"1 selected"** over an empty list while the screen also says nobody matches. A filter is signalled by a 6px dot, not a count. |
| 2 | Match System / Real World | 3 | The vocabulary is the ministry's, not a CRM's: *in your care*, *Lately:*, *Not reached yet*, *Local saints*, *Our own*. Nothing on this screen needs translating for a trainee. |
| 3 | User Control and Freedom | 2 | Before this pass a no-result screen had **no exit** — the copy said "clear your filters" and there was nothing to press. The filter panel is a page-anchored popover: scrolling to reach its last fields takes its own heading off the screen. |
| 4 | Consistency and Standards | 2 | Against this repo's own 44px phone rule: kind segments **36px**, tag chips **26px**, the card's select box **20×20**, the row's ⋯ **28×28**. Three different action sizes inside one card. |
| 5 | Error Prevention | 1 | Bulk **Remove** stays aimed at rows a filter hid (reproduced: 1 selected, 0 cards). A 20px select box sits inside a card whose whole body opens the person, so a near-miss on "select" opens someone instead. |
| 6 | Recognition Rather Than Recall | 2 | The tag chips are five bare pills with no label and no pressed state — nothing says they filter, or which are on. The search placeholder is clipped to "Find someone by r". |
| 7 | Flexibility and Efficiency | 2 | No keyboard path into a person at all (the card is a `div` with `onClick`), no way to clear the search from the field, no sort control, no explanation of list order. |
| 8 | Aesthetic and Minimalist Design | 2 | **480px of a 755px viewport — 64% — is chrome** before the first person: title, prose summary, two buttons, four segments, search, filters, tag chips, and a count that repeats the summary above. |
| 9 | Error Recovery | 1 | The no-results heading sat at y=745 with the bottom bar starting at 748: on the arrival screen the reader saw a grey magnifier and nothing else. The copy named "search or filters" when the cause was often the segment above. |
| 10 | Help and Documentation | 2 | The one piece of help — "Numbers show who's not reached yet among people added in the last 30 days" — appears only when some tag has an unreached count, and says nothing about the rest of the card. |
| **Total** | | **19/40** | **Poor (47.5%)** |

## Design Specificity Verdict

**LLM assessment.** This is not a generic CRM list. The card carries a relationship, not a lead: *Lately:* the trainee's own note, *Not reached yet*, *Connected today*, stage tones named after the Journey. The kind segments ("Our own", "Local saints") encode a ministry's actual question — who is inside the church family and who is on campus. None of that is category-interchangeable.

Where it drifts, it drifts the way the contact page did: **every rule was written for a 1040px column and never given a phone case.** The search row is a flex row whose search field has `min-w-[200px]`; the filter panel is an absolute popover sized `max-w-[calc(100vw-2rem)]`; the selection bar is a nowrap strip of four actions; the card is a flex row with three controls before the name. Each is fine at 1040 and each collapses at 360.

**Deterministic scan.** `impeccable detect --json src/views/Directory.tsx` → `[]` (clean). The detector cannot see layout: it did not catch a panel that renders at `x=-14`, a 20px tap target, or a heading behind the bottom bar. Every finding below is from the live DOM.

**Browser overlays.** No overlay detector was available in this session; all geometry and contrast numbers are measured from `getBoundingClientRect` and `getComputedStyle` in the live page at 375×812, not estimated.

## Overall Impression

The screen knows what it is; it does not know what a phone is. On arrival the reader gets 480px of preamble before the first person, and the two controls that own the phone — search and filters — are the ones that break: the search field starts at 200px and shoves the filter pill onto a second row the moment you type, and the filter sheet is 658px tall with its left edge 14px off the screen. Then the two failures that matter most: a person cannot be opened from the keyboard at all, and a no-result search leaves you looking at a grey circle with the explanation under the bottom bar.

## What's Working

1. **The card states a relationship, not a record.** *Lately: Should we invite her to the small group dinner next Tuesday?* is the reason this list exists; the note is the product's differentiator and it is rendered as prose, not a field.
2. **The stage and kind chips are quiet and truthful.** A stage shows its own tone, an unassigned person says so, and "Our own / Local saints" is the ministry's own taxonomy rather than "Type: Other".
3. **The count line explains a Trainee's scope.** "2 people — everyone you added, or were named on" is exactly the sentence a trainee needs to know why their list is short; it earns its line even though it costs two.
4. **Escape closes the filter panel and returns focus to the trigger.** Already correct before this pass, and it is the reason the popover's size is a sizing bug rather than a trap.

## Priority Issues

### [P1] A person cannot be opened from the keyboard or a screen reader
- **What**: the row is `<div onClick>` with no `role`, no `tabIndex`, no name. The accessibility tree shows `generic [cursor=pointer]` where a row should be. The only focusable things in a card are the 20×20 *Select* box and the 28×28 *⋯*, and a keyboard user must go *⋯ → Open …'s page* to reach a person.
- **Why it matters**: the primary task of the screen — open a person — has no keyboard path. For Sam this is the whole screen.
- **Fix**: a full-card overlay `<button aria-label="Open X's page">` behind the content, so Tab lands on the row, Enter opens, and the card keeps its whole-area tap. Controls stay above it.

### [P1] The filter sheet leaves the phone
- **What**: the panel renders **343×658 at x=-14, bottom 1081** in an 812px viewport, `overflow: visible`. Its left 14px (and the left rounded corner) are clipped by `overflow-x-hidden` on the scroller, so its labels start 3px from the screen edge. To reach *Added* and *Custom range* the reader scrolls the page behind it, which takes "Narrow it down" and "Clear all" off the screen.
- **Why it matters**: filters are one of the two phone controls; half the sheet is reachable only by accident, and the panel reads as a broken overlay.
- **Fix**: below `sm` the panel is a bottom sheet — full width, `max-h-[80dvh]`, its own scroll and overscroll containment, sticky heading so *Clear all* stays put. Desktop keeps the popover.

### [P1] The no-results state is under the bottom bar and offers nothing to press
- **What**: heading at y=745 (bar starts 748), body under it, no action anywhere; the search field had no clear affordance and the only instruction was the words "clear your filters".
- **Why it matters**: typing a name that is not there is the most common dead end on a directory, and the screen answered with a grey circle and an instruction it did not let you follow.
- **Fix**: the empty block sits above the fold (icon hidden on phone), and carries one primary — *Clear search and filters* when anything is narrowing the list, *Add someone* when the list is genuinely empty. The search field also gains an ×.

### [P1] Typing in the search moves the list under the finger
- **What**: at rest the field is 200px with the filter pill beside it; the first character widens the pill (the active dot) so the row re-wraps: filter moves from y=363 to y=419 and every card moves down 56px.
- **Why it matters**: the reader types with one hand while looking at the result row; the row jumps away from the thumb on the first keystroke.
- **Fix**: a non-wrapping row with `min-w-0` on the field (`min-w-[200px]` only from `sm`). The pill keeps its place; measured stable at y=331 through "", "a", "ar".

### [P1] Bulk actions stay pointed at rows a filter hid
- **What**: select a person, then narrow the list until nothing matches — the bar still reads "1 selected" and offers Stage / Tag / Copy emails / **Remove** over an empty list. Reproduced: `1 selected` with `0` cards.
- **Why it matters**: this is a destructive action aimed at someone the reader cannot see, verify, or count. On a phone the bar is the only place Remove lives.
- **Fix**: selection is pruned to the visible list whenever the filtered set changes, so the bar disappears with the rows it described.

### [P1] Tap targets of 20–36px on the controls a thumb uses
- **What**: kind segments 36px tall, tag chips 26px, the card's select box 20×20, the row's ⋯ 28×28, filter selects 40px. The repo's phone rule is 44.
- **Why it matters**: one-handed, walking. The worst pairing is a 20px *Select* next to a card that opens on tap — a miss doesn't do nothing, it navigates.
- **Fix**: 44px for the segments and filter controls; the chips and the select box keep their drawn size and gain a 44px pseudo-element hit area. Measured after: chips hit 6px above and below; the select box hits 8px around.

### [P1] The selection bar hides its own destructive action
- **What**: four actions total 387px in a 345px nowrap strip with `overflow-x-auto`; **Remove** rendered from x=314 to x=415, clipped at the page edge, with a horizontal scrollbar under the bar.
- **Why it matters**: a scroll-inside-a-scroll on a phone, and the hidden action is the destructive one.
- **Fix**: the actions wrap to a second row inside the pinned bar; measured: Stage / Tag / Copy emails on row 1, Remove in danger ink on row 2, no horizontal overflow (`scrollWidth 360 = clientWidth`).

### [P2] The identity column is 111–131px
- **What**: 20px padding + 20px select + 16 gap + 48 avatar + 16 gap + 28 actions leaves 127px for the name at 375. Before this pass the name and its two chips shared that row, so a 44-character name wrapped to **4 lines** and grew the card 302 → 369.
- **Why it matters**: the name is the row's identity; two lines for "Around Touch" makes every card taller than it needs to be.
- **Fix**: the name owns its line and the chips sit beneath it from the phone up (`sm` keeps one row), the avatar and gaps tighten on phone with `sm` restoring 48/16. Measured after: name 131px, one line, note 3 lines instead of 4.

### [P2] 480px of chrome before the first person
- **What**: title 81, summary 116, actions 185, segments 250–346 (two rows), search 363, tag chips 423, count 481–521, first card 537.
- **Why it matters**: with two contacts, one card is visible and the second is a scroll away; with twenty the preamble still costs two thirds of the first screen.
- **Fix (partial)**: the segments now hold one row of 44px (`px-2` on phone), which moves the first person to y=505. The rest is a layout question, not a defect — see *Questions to Consider*.

### [P2] "Lately:" and the italic lines are 3.62:1
- **What**: `text-on-surface-variant/70` on white — the *Lately:* label and the italic *Not reached yet* / *No contact logged yet* lines — measures **3.62:1** at 14px.
- **Why it matters**: "when did I last reach this person" is the signal the list is sorted by, and its label is decoration.
- **Fix**: full `--on-surface-variant` (7.73:1).

### [P2] Tag chips state neither name nor state
- **What**: a bare row of pills with no group label; selection lives only in a background colour, with no `aria-pressed`, unlike the kind segments above them which do it correctly.
- **Fix**: a labelled group and `aria-pressed` per chip.

### [P2] The 11px stage and tag chips are ≈3.5–3.8:1
- **What**: tone ink on its own 14% wash — *First Contact* `oklch(0.55 0.15 258)` on the same hue at 14% over white ≈ **3.80:1**; the teal tag chip ≈ **3.48:1**; both at 11px.
- **Why it matters**: these are the Journey's semantics on the row; at 3.5:1 in sunlight they are coloured smudges.
- **Not fixed here**: the pair is a design token (`--t-*` / `--t-*-soft`) used by the Journey board and the dashboard too. Darkening it is a token change across the app, so it is filed as a follow-up rather than smuggled into a phone fix.

### [P3] Filter state is a 6px dot, and it counts the visible segment
- **What**: choosing "Local saints" — a control that is already on screen and already selected — makes the Filters button claim hidden filters.
- **Fix**: the dot should count filters the panel owns; the segment already says what it is.

### [P3] The support FAB floats over the last card
- **What**: *Leave a note for the team* (48×48, fixed `right-4`) sits at 296,684 — inside the first card's box — so the card's bottom-right corner belongs to the FAB, not to the person.
- **Fix**: shell-level (`BottomNav`/FAB placement), out of this surface's scope.

## Persona Red Flags

- **Zion (Trainee, the seeded account, one hand on a walk)**: types "li" into the search and the whole list jumps 56px down as the filter pill changes row; opens Filters and gets a sheet whose left edge is cut off and whose bottom half is below the screen; selects two people, filters to a segment with none, and the Remove he is offered now points at people he cannot see.
- **Sam (screen reader / keyboard)**: Tab reaches the 20px Select box and the 28px ⋯, then the next card — never a person. A 44-character name wraps to four lines, pushing the note out of a card whose text column is 131px. The chips announce their colour as state; the tag filters announce nothing.
- **Casey (notched phone, thumb only)**: the primary *Add someone* is at the top of the screen, 185px down, out of the thumb zone; the search field is 200px and the filter pill beside it is a 44px target that moves; the row's ⋯ is 28px in the same corner as the FAB.

## Minor Observations

- The search placeholder is clipped at rest ("Find someone by r"). With the row no longer wrapping, the field gains 15px but still truncates the final ellipsis.
- The count line repeats the header's number in two lines ("2 people — everyone you added, or were named on") on arrival. It earns its keep for a Trainee, but it is the third mention of "2 people" on one screen.
- The list has no sort control and no stated order; a trainee looking for "who have I not seen" has to read the whole list.
- The `Filters` panel's checkbox rows are 40px and its selects 40px on desktop; on a phone they are now 44.
- React logs "Encountered two children with the same key" **9×** on this route and AppCheck exchanges 400 in emulator mode. Both pre-exist this pass and neither was introduced here; the duplicate-key owner was not identified (same noise seen on `/people/:id` in #1761).
- The bottom nav's centre Search button overlaps the last card when the list is short; the FAB covers the corner above it.

## Questions to Consider

- **Should the preamble collapse below the fold on a phone?** Title + prose + two buttons + four segments + search + tags + count is 480px. If the summary line became the caption under a sticky search row, the first person would land around y=300 and a trainee would see two people instead of one.
- **Is a per-row select box the right phone gesture at all?** On a phone, selection is a modal mode that hijacks the card's whole body and turns the pinned bar into a second header. Long-press to select would buy back 36px of identity width on every row.
- **Should the kind segments be a filter at all?** They are the only control that changes what "the directory" means without saying so in the count line; "Our own" and "Local saints" read as tabs and behave as filters that also raise the Filters dot.
- **Where should "not reached" live?** It is the most operationally useful signal on this screen (it is why the tag chips carry counts), yet it is a 14px grey line inside each card. A count in the header, a sort, or a filter chip would be worth more than the line.

---

**Fixed in this pass**: all seven P1s — a full-card overlay button that puts every person in the tab order, the filter panel as a phone bottom sheet with its own scroll and a sticky heading, an empty/no-results state above the fold carrying *Clear search and filters* (or *Add someone* when the list is truly empty), a search row that no longer re-wraps on the first keystroke, selection pruned to the visible list, 44px targets on the segments, chips, select box and row menu, and a selection bar that wraps instead of hiding *Remove*. Of the P2s: the name owns its line (one line for "Around Touch" instead of two), the first person rises 32px, *Lately:* and the italic lines move to 7.73:1, and the tag chips gain a labelled group and `aria-pressed`. Plus a clear (×) inside the search field, which is what makes the no-results copy honest.

**Measured after** (same seeded emulator, Trainee, 375×812): first card 537 → 505; search row stable at y=331 while typing; filter panel `fixed`, 360 wide, `max-h` 650 with `overflow: auto` (scrollHeight 696); empty state heading 745 → 545 and *Clear search and filters* at 613–657 (bottom bar starts 748); selection bar 133 tall with *Remove* fully visible at 16–117 on row 2; name 111 → 131px, one line; ⋯ 28 → 44×44; tag chips hit 44px tall; card click and checkbox click still do their own thing (`/people/e2e-contact-around` vs "1 selected").

**Filed as follow-up**: the tone-chip contrast pair (`--t-*` on `--t-*-soft`, ≈3.5–3.8:1 at 11px, app-wide), the missing sort/order affordance, the FAB overlapping the last card, and the duplicate-key console noise.

**Not fixed, on purpose**: the 480px preamble (a layout redesign — sticky search, folded summary), the selection mode itself, and the desktop filter popover's own overflow (no viewport-anchored max-height; pre-existing, unchanged on desktop by this pass).
