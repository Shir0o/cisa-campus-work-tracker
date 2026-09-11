# Gatherings page — design canvas

Source artboards for the Gatherings redesign. Build from the issues, not from
these files, wherever the two disagree.

- [#956](https://github.com/Shir0o/cisa-campus-work-tracker/issues/956) — the
  stopgap: recurring terms never group, because `parentEventId` has no writer.
  Ships ahead of the redesign.
- [#957](https://github.com/Shir0o/cisa-campus-work-tracker/issues/957) — the
  redesign: Rhythm becomes a record, the kind is retired, the page reorders.
- [#958](https://github.com/Shir0o/cisa-campus-work-tracker/issues/958) —
  attendance moves onto the Gathering. Filed as a destination, not scheduled.

Canvas: https://claude.ai/code/artifact/b6ade64c-5559-428e-aca9-685a62152a25

| File | What it shows |
| --- | --- |
| `Main.dc.html` | The redesigned page, clickable — chip selection, the return-to-today control, the Rhythm drawer with a working roster editor, the two-act create choice |
| `Today.dc.html` | The same three Rhythms as the shipped code actually renders them against production data |
| `ChipStates.dc.html` | Rhythm row anatomy and the five chip states, with the reasoning for each |
| `canvas.json` | Artboard layout |

## What the artboards assume

Sample data, not real records: the term runs 26 Aug – 9 Dec 2026, "today" is
Thursday 10 September, rosters are 18 / 11 / 24, and the names are invented.
Two things in the data are deliberate rather than incidental — Wednesday 2
September is a past week nobody marked, and Thursday 26 November is cancelled.
Both exist to show a state that is otherwise hard to see.

`Today.dc.html` is evidence for #956 rather than a design: it is what the page
does now, drawn so the defect can be seen instead of described.

## The design system

These match the app, not a house style: Plus Jakarta Sans over Lexend, `#FFFFFF`
page on `#F4F4F5` surfaces, `#0A0A0B` ink with `#52525B` dim, `#E4E4E7` borders,
`#131316` as the only strong fill, and the radius ladder from ADR 0009.

One caveat found while lifting those values: `.light` in `src/index.css`
re-declares `--radius-lg` and `--radius-xl`, overriding the `@theme` ladder, so
`rounded-xl` and `rounded-2xl` both render 32px in light and differ from dark.
The artboards follow ADR 0009's documented intent rather than the shipped
values. Unrelated to this work; worth its own issue.

## Regenerating

The `.dc.html` files are the source; the published canvas is generated from them
and is not committed (it embeds a ~2.4 MB editor payload). Re-seed with the
`design` skill's helper, passing each artboard and `canvas.json`.

## History

An earlier canvas explored the misaligned figures card and finding the current
week in a term-long Rhythm, for [#765](https://github.com/Shir0o/cisa-campus-work-tracker/issues/765)
and [#776](https://github.com/Shir0o/cisa-campus-work-tracker/issues/776). Those
artboards are removed rather than kept: they disagreed with the settled design on
the type, the kind taxonomy, the calendar's role and the page order, and an
artboard that needs four warnings attached does negative work. The reasoning they
carried lives in #776 and in ADR 0016.
