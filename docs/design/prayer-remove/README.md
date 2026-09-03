# Remove from the prayer list — design canvas for #715 (and #714)

Source artboards for the canvas answering
[#715](https://github.com/Shir0o/cisa-campus-work-tracker/issues/715) —
*"give me a way to remove someone from the prayer list in dropdown so that I
don't have to go all the way to the top to choose people and remove name"* —
together with its naming half,
[#714](https://github.com/Shir0o/cisa-campus-work-tracker/issues/714).

Canvas: https://claude.ai/code/artifact/d1a64146-1dfc-46dd-8f7d-63e07a438876

| File | What it shows |
| --- | --- |
| `Main.dc.html` | `/prayer` at the reported 1107×662, the card's ⋯ menu open with the proposed item. Clickable: remove, and undo |
| `Today.dc.html` | The current round trip, measured at that viewport — and which surfaces already have a per-card remove |
| `Menu.dc.html` | The item, the wording, the undo gesture, what Remove does to the data, and the popover measurement the fourth item forces |
| `canvas.json` | Artboard layout |

## What the canvas proposes

1. A fourth item in the card's existing `RowActions` menu: **Remove from prayer
   list**, last, below a hairline, in the error tone. Today that menu carries
   only *Open …'s page · Make a to-do · I followed up*.
2. The wording change #714 asks for. **Archived** is already what a prayer's
   `unanswered` mark is called in the mark row of the same card, so *Archive
   from Prayer List* reads as if it acts on the prayers. `PrayerList.tsx:911`'s
   button loses its place — the menu carries the action on every card, not only
   stale ones — and `prayers.remove_from_prayer_list` (already in `en.json`,
   used as the mobile tooltip) becomes the one spelling.
3. Remove immediately, then offer **Undo** for five seconds in the
   `UndoSnackbar` this view already renders — the gesture #706 gave
   *Clear this prayer* — rather than a confirm step.
4. Mobile keeps its per-card ×, dropping the inline *Remove / Keep* so both
   surfaces spell the action the same way.

## Two things the canvas raises that the issue does not

- **The popover must flip.** At four items the menu runs ~161px and opens 36px
  below the trigger; on a 662px-tall window it ends level with the fold on the
  *first* card and past it on every card below. `RowActions` is shared by the
  person, visit, prayer and outreach rows, so the flip lands everywhere — and
  it is the only part of this change that is not a one-line addition.
- **Removing is local, and the page's copy does not say so.** `stopHolding`
  writes the contact id into `cisa.prayer.hidden` in localStorage; Firestore is
  untouched and a teammate's page does not change. The snackbar therefore says
  *your* prayer list, while the section header says *People we're praying for*.
  The canvas patches the copy and leaves the real question — should the list be
  shared? — open for the team, since that is a data-model decision well past
  this issue.

## Regenerating

The `.dc.html` files are the source; the published canvas is generated from
them and is not committed (it embeds a ~2.4 MB editor payload). Re-seed with
the `design` skill's helper, passing each artboard and `canvas.json`.
