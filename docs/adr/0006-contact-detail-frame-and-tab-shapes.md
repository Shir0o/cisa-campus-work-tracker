# 0006: The contact detail page gives its chrome back to the content

## Status
Accepted

## Context
[#762](https://github.com/Shir0o/cisa-campus-work-tracker/issues/762) reported
that contact detail is hard to work in: "the window is very small, for example
discussion, I have to scroll up and down." The report came from a 1107×662
laptop in the rail shell.

Measured at that viewport, the page gives the user **220 × 435 px**:

- The 320px aside takes 41% of the usable width. The main column is left with
  435px, and because the edit form's two-column breakpoint is a *viewport*
  breakpoint (`md:`), it goes two-up inside 435px — about 200px per field.
- 274px of the main column's 494px is permanently pinned: a ~166px `.cd-head`
  (the Call / Text / Email / Log interaction pills sit *inside* `cd-head-main`,
  not beside it), a 48px `.cd-tabs-bar`, and a ~60px `.cd-page-foot` whose job
  is a "Done" button on a page that has been a route since `/people/:contactId`
  shipped.
- A `min-h-[400px]` wrapper around the tab panels forces a scrollbar even when
  a tab is empty.
- `.cd-page` is `height: 100%` inside a `main` carrying `pb-8`. The percentage
  resolves against the content box and the padding is added below it, so the
  page scrolls ~32px *outside* the inner scroller — two scrollbars, one of
  which does nothing.
- `Thread` renders its message list in document flow and puts the composer
  after it, with no internal scroller. In a 220px window with a real
  Discussion, "add a comment" sits below every message. That is the reported
  symptom, exactly.

The squeeze is the frame's, not any one tab's. Discussion is where it bites
hardest because the composer is at the bottom of a growing list.

The design was worked out on the canvas at
[`docs/design/contact-detail/`](../design/contact-detail/) — four artboards at
1107×662 with every value lifted from `src/index.css`, `App.tsx`,
`permissions.ts` and the component source. Per [ADR 0003](./0003-nav-rail-floating-shell.md)
the canvas is normative for shell chrome.

## Decision

1. **The aside is deleted outright.** Its five sections — how to reach, where
   they are, cared for by, who else can see, tags — move into the Overview tab.
   The main column goes to 779px at every width, and the rail's 232/76px
   collapse stops changing the answer.

2. **The head compresses to a single 56px row**, unconditionally: avatar, name,
   stage, a combined "Last connected … · Cared for by …" line, and a compact
   icon cluster on the right (Call / Text / Email, plus an overflow carrying Log
   interaction and Move step). Promoting **Cared for by** into the head is what
   keeps the aside's one glance-level fact on screen from every tab. The
   actions stay in the head rather than moving to the tab bar's right edge —
   `.cd-tabs-bar` is `overflow-x: auto`, so anything placed there can scroll out
   of reach.

3. **The footer is deleted in read mode.** "Done" goes entirely. **Delete
   contact** moves to the end of Overview as a bordered danger block, where a
   destructive action gets the friction of a scroll and stops being adjacent to
   "Call". Save and Cancel become a 52px footer that renders *only* while
   editing.

4. **Tabs declare a shape.** The content region becomes a flex column so a tab
   can opt into **fill** — owning the pane's height, scrolling its own list,
   pinning its own footer, opening on the newest message — while the default
   stays **flow** through the single content scroller. Discussion and Follow up
   are fill; Overview, Interactions, Prayer and History are flow. Interactions
   and Prayer open their forms from a button rather than carrying a persistent
   composer, so pinning would waste height nearly all the time.

5. **`Thread` gains a pane variant** alongside its existing `compact` prop. A
   variant is structurally required regardless: `Thread` has three call sites,
   and one renders nested inside an interaction row where filling the height
   would be wrong. Only the desktop Follow up and Discussion call sites opt in.

6. **Overview keeps "Prayers we're holding" and drops "Lately".** "Lately" is
   `visibleInteractions.slice(0, 3)` — a true preview of the tab sitting next to
   it. "Prayers we're holding" is `openPrayers`: *every* prayer that is neither
   answered nor closed. That is a filter, not a digest — the Prayer tab shows
   answered and closed ones too, so Overview is the only place open prayers are
   visible without scanning. Dropping it would have made them harder to find
   than they are today.

7. **Column breakpoints become container queries.** Tailwind v4 is already in
   use. The edit form and Overview's field groups size against the column's real
   width, because the rail's collapse changes the available width without the
   viewport moving at all — a viewport threshold gets that wrong in both
   directions.

8. **Mobile is out of scope, deliberately.** `.cdm-page` is
   `position: fixed; inset: 0` with no `dvh` and no `visualViewport` handling
   anywhere in the repository. Today the mobile composer works *because* it is
   in flow — the browser scrolls it into view on focus. Pinning it to the bottom
   of a fixed pane puts it under the iOS soft keyboard, and
   [ADR 0004](./0004-mobile-and-pwa-contact-editing-flow.md) tuned that sheet for
   single-scroll keyboard-avoidance ergonomics precisely on that assumption.
   Mobile still inherits the shared fixes.

Result at the reported viewport: **220 × 435 → 422 × 779**. Height +92%, width
+79%, with nothing added to the page to achieve it.

## Consequences

- **The contact's details are one click away instead of always on screen.**
  On Interactions, Prayer, Discussion or History you can no longer glance right
  for a phone number. This is the change's real cost and it was taken knowingly:
  320px of permanent width is a steep price for glance-ability, and the fact
  people actually graze on — who owns this person — is promoted into the head.

- **Overview changes job.** It was "catch me up on this person" (notes, last
  three conversations, open prayers). It becomes the record — notes, open
  prayers, the profile fields, delete. Anyone looking for a conversation
  history now goes to Interactions, which is where it always was.

- **A tab can now be laid out two ways**, and a new tab has to pick one. Getting
  it wrong is not a crash — a fill tab that should have flowed just wastes
  height, and a flow tab that should have filled reproduces #762 in miniature.
  The rule is the presence of a *persistent* composer, not of any input.

- **`Thread` has three call sites and three behaviours.** Adding a fourth call
  site means choosing among them. The nested-in-interaction site must stay
  `compact`, and both mobile sites must stay default until the keyboard work in
  point 8 is done — a future change that opts mobile in without that work will
  reintroduce a composer hidden under the keyboard, which no test in this repo
  would catch.

- **The phantom scroll can come back silently.** It was created by
  `height: 100%` meeting a padded `main`, which is invisible to every
  behavioural test because jsdom has no layout engine. A guardrail in the style
  of `src/test/accentToken.test.ts` — which exists for exactly this class of
  regression — asserts the invariant.

- **`ContactDetailsModal` keeps its name and is now definitively wrong.** It has
  not been a modal since `/people/:contactId` became a route; it renders
  `.cd-page`, and ADR 0004 still describes it as the desktop modal. Renaming a
  2,700-line file in the same commit as a layout change would bury the diff, so
  the rename is deliberately deferred to its own commit.

- Chosen over **keeping the aside behind a width threshold with a conditional
  "Details" tab** (rejected: a tab set that changes shape while you drag a
  window edge is disorienting, and it leaves the narrow case still narrow); over
  **keeping both an aside and a Details tab** (rejected: two render paths for
  the same content); and over **letting the whole page scroll as one document**
  (rejected: it trades a short window for a comment box that runs away down the
  page, and the pinned tab bar goes with it). All three are recorded on the
  canvas.

- **ADR 0003's shell gutter is untouched.** The vertical budget is recovered
  from the page's own chrome, not from the 16px track that makes the rail slab
  read as an object.
