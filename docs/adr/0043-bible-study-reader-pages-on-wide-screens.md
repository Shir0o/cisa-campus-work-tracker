# 0043: The reader pages one Section at a time on wide screens; phones keep scrolling

## Status
Accepted. Amends [ADR 0014](0014-bible-study-reading-deck-and-editor-document-index.md) §1–§3 for wide reader boxes only.

## Context
Issue [#1590](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1590): people sometimes read the week's study on a laptop or tablet — at a table during the gathering, or at home. The reader was designed only for a phone (`docs/design/bible-study/README.md`: "No desktop reader"), so on a wide screen it was one narrow column of stacked snap panels with empty bands either side, type sized for 390 px, and a Passage that never used the room the screen had.

Four directions were compared on the design canvas (reading column with an outline, Passage beside notes, a paged deck, and dark focus reading). The paged deck was chosen.

## Decision

1. **A reader box at least 768 px wide and at least 600 px tall is a paged deck; anything smaller keeps ADR 0014's scrolling deck, unchanged.** The height floor keeps a phone held sideways on the scrolling deck.

2. **The box measured is the reader's own, through a ResizeObserver — never the window or a media query.** The editor preview renders a 390-wide phone inside a wide desktop window; measuring the window would flip the preview to the paged deck and the preview would stop showing the phone most of the room uses. Measuring the reader keeps ADR 0014 §11's one rendering path with no special case.

3. **On the paged deck the reducer's `sectionIndex` owns the position.** Section tabs, Previous / Next and Left/Right/Page Up/Page Down all dispatch the existing `jump`; no new actions, and `advance`/`back` stay deleted. On the scrolling deck scroll position stays the owner (ADR 0014 §2). Crossing the floor keeps the Section on screen and every revealed Blank.

4. **One Section per screen, landscape.** The Passage is set large on the left; the heading, outline points and Prompts sit on the right, in the author's order. A Section with no Passage, or only a Passage, takes the card's full width. The columns stack, Passage first, when the card is too narrow for both.

5. **The tabs and a Next button that names the next Section replace the phone's edge index and dimmed peek.** The last Section ends the Meeting in place of Next. A page change is announced to screen readers and does not move focus.

## Alternatives rejected

- **Paged everywhere, phones included.** Re-litigates ADR 0014 for the surface it was decided on: on a phone a Section often outgrows the screen, and scroll-snap's overshoot recovery is exactly what paging loses. On a wide card one Section usually fits side by side, so paging costs nothing there.
- **The scrolling deck, widened.** Keeps one model, but a wide panel holding a phone-shaped column is the empty-space problem this issue reported.
- **A swipe deck.** Rejected again for ADR 0014's reason: a swipe competes with a Blank's tap and is a gesture a reader must learn. Tabs and Next are visible.
- **Choosing the layout with a media query.** Simpler, but wrong for the editor preview (§2).

## Consequences
- The reader has two navigation models, chosen by its own size. Each is tested at the shared reader view's component seam with the box size faked.
- Arrow keys page only on the paged deck, and never while focus is in a field or a modifier is held.
- The native app's in-app browser gets the paged deck on an iPad with no native work, since it opens `/s/:slug` (ADR 0021).
- The README's "Reader surfaces" and "Motion" rows are edited in place to match.
- ResizeObserver, rotation and Safari on iPad only tell the truth on a device; the milestone playtest covers a real iPad and a laptop.
