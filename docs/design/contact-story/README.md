# Contact story — design canvas sources

These are the two canvases behind [ADR 0034](../../adr/0034-contact-page-is-a-story-beside-a-conversation.md) and the spec in
[issue #1284](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1284). Each file is a single HTML page. Open it in a
browser, or publish it as-is.

| File | Published | What it answers | Picked |
| --- | --- | --- | --- |
| `Directions.html` | https://claude.ai/artifact/B61dajxMhYgBC5ez9ipzfd | Where a person's **Conversation** lives relative to **The story so far**. Five layouts are drawn with the same eleven entries: A folded newest first, B folded oldest first, C folded with "waiting on a reply" pinned, D the story beside a Conversation pane, E the story with pointers into the Conversation. | **D**. The fold (A) was the first choice and was rejected after seeing it: one list was too messy. |
| `Composer.html` | https://claude.ai/artifact/C8Wvku3SBeQTmFdpUr95Wk | What the story's composer looks like. Four designs are shown at rest and while writing, in the 640px story column: (a) text first with details as chips, (b) a sentence, (c) a sheet, (d) the current form restyled. | **(a)** |

The ticket that builds the composer ([#1292](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1292)) must match `Composer.html` direction (a), or record any difference in [`DRIFT.md`](../DRIFT.md).

The colours and type are lifted from `src/index.css` (Lexend over Plus Jakarta Sans), in light and dark. The people and messages shown are sample data. No real record is depicted.

In `Directions.html`, the red and green callouts mark which row a note refers to. Their positions are hand-placed, so treat them as approximate.
