# Gatherings page — design concept for #765

Source artboards for the design canvas exploring [#765](https://github.com/Shir0o/cisa-campus-work-tracker/issues/765):
the misaligned figures card, and finding the current week in a Rhythm that was
created for the whole term at once.

Canvas: https://claude.ai/code/artifact/3d4d5a66-1c7c-409e-8eef-db73fef8ca16

| File | What it shows |
| --- | --- |
| `Main.dc.html` | The whole page, redesigned |
| `Alignment.dc.html` | The figures-card misalignment, measured, before and after |
| `SeriesCard.dc.html` | Anatomy of the folded recurring row and its chip states |
| `canvas.json` | Artboard layout |

## These artboards are a first pass, and the spec supersedes them

They were drawn before the design was grilled, and the following was settled
afterwards. **Build from [#776](https://github.com/Shir0o/cisa-campus-work-tracker/issues/776), not from these files, wherever the two disagree:**

- The sample data is wrong. The artboards show a Friday fellowship and a Tuesday
  small group; the team actually runs Bible Study on Wednesday, Bible Study on
  Thursday, and College Meeting on Thursday — two Rhythms landing on the same day,
  which the artboards never show.
- Chip state assumes a fact the data model does not carry. The strip distinguishes
  "attendance taken" from "not taken", which needs new fields on the Gathering
  record; the artboards show it without saying so.
- The roster is per-Gathering in the artboards. It should belong to the Rhythm,
  with a per-week override.
- A marked chip should carry a proportion (`14/18`) once the Rhythm knows who is
  expected. The artboards show no denominator.
- One-off gatherings belong in their own list below the Rhythms, and Rhythms sort
  by day of week.
- The vocabulary changed: **Rhythm**, **Gathering**, **Attendance taken**, all now
  in `CONTEXT.md`. The artboards say "series", "week" and "marked".

## Regenerating

The `.dc.html` files are the source; the published canvas is generated from them
and is not committed (it embeds a ~2.4 MB editor payload). Re-seed with the
`design` skill's helper, passing each artboard and `canvas.json`.
