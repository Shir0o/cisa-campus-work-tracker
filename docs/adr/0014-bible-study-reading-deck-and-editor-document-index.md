# 0014: The reader is a scrolling deck; the editor is a document with a navigating index

## Status
Accepted

## Context
Issue [#890](https://github.com/Shir0o/cisa-campus-work-tracker/issues/890) reported two failures that share a cause: neither the reader nor the editor had a model of the whole document, so both invented per-panel or per-selection behaviour on top of it.

The reader (`PublicStudyReader`) was a tap-deck: one Section filled the screen, content floated in vertical centring (`my-auto`) so a short Section sat in a band of dead space, and tapping anywhere advanced — which made a Blank's tap and the navigation tap compete (`stopPropagation` was load-bearing). Going back meant finding a 36px chevron. Scrolling did nothing: a reader who overshoots or wants to re-read is stuck, and a Section taller than the screen could not be read in full. The card was sized in `vh`, so on iOS Safari the bottom chrome hid under the browser toolbar.

The editor (`BibleStudyEditor`) was one markdown textarea with an inert left-pane outline and two Section buttons. "+ Add section" called an insert-at-cursor helper, and a textarea that has never been focused reports `selectionStart` 0, so the new heading landed silently at the *top* of the document while the author watched the bottom — the author clicked a button and the document looked unchanged. The toolbar's "Section" button did the same from a second place. The live preview was a hand-built 320×520 frame with `overflow-hidden` while `SectionBody` sets type in fixed pixels sized for a 390-wide phone: the same type in a smaller box with no scroll showed *less* than the real phone, the opposite of a preview's job, and its Blanks were stubbed inert.

This work originated in a grilling session on 2026-09-07 covering thirty decisions across the reader, the editor and the preview; the rejected branches are recorded below.

## Decision

**Reader — scrolling is the navigation model.**

1. **Sections render as a vertical stack of scroll-snap panels.** Each panel is `min-height: 100%` of the reader's scroll container — the deck, not the browser viewport — with `scroll-snap-align: start`; the scroll container is `snap-y snap-proximity`. **Proximity, not mandatory** — mandatory snapping can skip or trap on a Section taller than the viewport, which is the exact failure this fixes. Forward, back, and overshoot-recovery all come free from the browser.

   **Amended by [#913](https://github.com/Shir0o/cisa-campus-work-tracker/issues/913):** the panel height was originally stated as `min-height: 100dvh` (on desktop preview, `844px`). That measurement was wrong: the box a panel snaps inside is the scroll container, which is shorter than the viewport by the sticky header and the sticky progress rail, so no `start` snap position was reachable and the deck parked wherever the finger left it. Panels are now `min-height: 100%` of the scroll container, keeping `min-height` semantics so a Section longer than the deck still overflows and scrolls normally. The decision itself — scroll-snap panels, proximity snapping, one Section per screen — is unchanged.

2. **Scroll position is the single owner of "which Section am I on."** The reducer's `sectionIndex` survives only as a **read model** mirrored from an IntersectionObserver over the panels (threshold 0.55), consumed by the progress rail, the counter and the index highlight. `readerReducer`'s `advance` and `back` actions are **deleted** in both mirrors (`src/lib/bibleStudy.ts`, `packages/core/src/bibleStudy.ts`); `jump` remains as the one navigation action — dispatched by the Section index and the peek — and its effect is a `scrollIntoView`, never a state-owned position. `setTotalSections`, `revealBlank`, `openIndex`, `closeIndex` are unchanged.

3. **Whole-surface tap-to-advance is removed.** The back chevron goes with it; `SectionBody`'s Blank handlers no longer need `stopPropagation` to survive a navigation tap, and the "Tap anywhere to go on" hint is deleted. The parallax washes retired too: they animated on a section index nothing owns anymore.

4. **`Section.long`, `unadorned`, `toggleUnadorned` and the distraction-free toggle are deleted.** Under proximity snapping a long Section needs no special handling (the flag had no consumers), and the chrome they hid is no longer busy enough to warrant them.

5. **The Section's content sits on a raised card; the panel around it becomes ground.** The previous `my-auto` vertical centring was removed so the title lands at the same height on every panel, and the trailing space carries the next Section's title, dimmed, as both the "more below" affordance and a preview of what is coming; the last panel shows an end-of-Meeting treatment instead.

   **Amended by [#922](https://github.com/Shir0o/cisa-campus-work-tracker/issues/922):** the dead space was the problem, and centring was not the cause — top-aligning only relocated the emptiness from above-and-below to entirely below, so a short Section still read as a small thing marooned on a large screen. **Top-align is recorded as the rejected branch.** The shipped treatment puts the Section's content on a card with radius, internal padding and elevation and lets the panel around it become ground, so the same emptiness reads as margin around an object rather than a void. While the content fits, the card settles optically in the panel — the settle margin is `mt-auto`, so the offset shrinks continuously to zero as content grows and nothing jumps at the threshold — and the peek stays outside the card at the bottom of the panel, bounding the trailing space at both ends. A Section that overflows keeps its card, which grows and closes below its last block; dropping the card on overflow was considered and rejected as discontinuous (a Section a line either side of the threshold would look entirely different and could flip on a rotation, and combined with the reader-side type control it would hand the plainest treatment to the readers who chose the largest type). The cost is accepted and stated: mid-scroll through a long card no edges are visible, so the object reading weakens exactly when a Section is long.

   The two themes elevate by different physics. The app's light theme fills cards with the panel tone on a white ground and sets no card shadow, which would render this card *darker* than its ground — a recess, not an object. For the reader, the pair is swapped: the panel ground takes the panel tone, the card takes the background tone, and light elevation comes from a layered shadow, while dark keeps elevating through lightness plus an edge, because shadow is invisible on near-black. No new colours; both themes use tokens the app already ships. This is a deliberate local departure from the app's flat light-mode cards, and it changes the reader's light background from white to the panel tone. It is scoped to the reader: every other light-mode card in the app stays flat and the app-wide card shadow token is not touched. The justification is that the reader is its own surface — most people who see it arrive by scanning an Entry point QR at a gathering and never open the tracker.

6. **Chrome is a slim sticky header plus a sticky progress rail.** The header carries the Meeting title, the `NN / NN` counter, and — when the reader has fallen back to an older week — a date chip. The stale-week banner condenses into that chip so it is visible from any panel: falling back is correct; falling back silently is not (ADR 0011 §3). All viewport sizing is `dvh` rather than `vh`, and header/footer respect safe-area insets.

**Editor — a document with an operating index.**

7. **The centre pane stays one textarea holding the whole Meeting's markdown; Sections stay derived from `md`.** No per-Section storage, no schema change; `md` remains the single source of truth (ADR 0012, amended below; ADR 0013 §5).

8. **The left-pane outline becomes navigation, never mutation.** `sectionOffsets(md)` gives each `##` heading's character offset; clicking a row focuses the textarea, sets the selection to that offset, and scrolls it into view. The row containing the caret is highlighted, via `sectionIndexAtOffset(md, offset)`. A `##` typed mid-body splits the Section for real and the outline updates live, because the outline is a read model over the same `md` the textarea holds.

9. **"+ Add section" is the editor's one Section mutation, and it appends at the END of the document.** `appendSection(md)` returns the new markdown plus the caret offset — right after the hashes — and the editor scrolls there, so the author immediately types the name and watches the row appear. It never reads the cursor, which is how the top-of-document bug died. A new Section carries no starter body.

10. **The toolbar's "Section" button is removed.** The toolbar holds only what goes *inside* a Section — Passage, Blank, bold, italic, Question, Discuss, Activity. **No reorder and no delete controls**: moving a Section is cutting and pasting its markdown, and deleting it is deleting its text. The cost is stated, not hidden: reordering a long week by hand is tedious. Revisit with drag-to-reorder or delete controls if reordering proves frequent.

**Preview — one rendering path.**

11. **The reader's presentational half is extracted into `StudyReaderView`,** which the public route and the editor preview both render — the route feeding it a resolved published Meeting, the preview feeding it a Meeting built from the author's unsaved markdown. This literalizes ADR 0013 §3's "the preview cannot lie." The preview renders at true phone dimensions (390×844) CSS-scaled into the pane, follows the caret's Section one-way (editor → preview; scrolling the preview never moves the caret), and Blanks reveal for real.

## Alternatives rejected

- **A swipe deck (advance/back on horizontal swipe)** for the reader: keeps a state-owned position and a gesture a reader must learn; scrolling already encodes forward, back and overshoot for free. Tap/swipe navigation also fights a Blank's tap.
- **A continuous document (no snapping at all)** for the reader: loses "one Section per screen" — the settled Structure row in `docs/design/bible-study/README.md` still holds, since a snap panel is still one Section per screen — and abandons the reader arriving at a named place when the Section index jumps.
- **Sections as stored documents** (one Firestore doc per Section): breaks ADR 0012's one-document-per-Meeting shape, multiplies rules and subscription paths, and makes cut-and-paste reordering impossible.
- **A section-stack editor** (the right pane shows one Section at a time): hides the document from the author, makes cross-Section moves awkward, and re-introduces exactly the "which panel am I editing" state this change deletes.

## Consequences
- A reader scrolls instead of tapping; the progress rail reflects where the scroll actually is, and a Section longer than the screen scrolls normally and snaps only at its boundary.
- `dvh`, safe-area insets and proximity snapping only tell the truth on a device; jsdom has no layout and browser emulation renders `vh` and `dvh` identically. The QA deploy needs a manual pass on a real iPhone before merge.
- The editor's "+ Add section" can no longer write anywhere but the end of the document, whatever the textarea's selection state.
- `docs/design/bible-study/` artboards (`Main.dc.html`, `Editor.dc.html`, `DirectionA/B.dc.html`) are stale against what shipped; updating them is a follow-up after this lands.
- `CONTEXT.md` needs no new terms: Entry point, Study, Meeting, Section, Passage, Prompt and Blank all still mean exactly what they meant, which is the signal the model held under this change.