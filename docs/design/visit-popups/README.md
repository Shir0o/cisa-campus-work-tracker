# Visit popups — design canvas

Three design directions for the "form card" popups: Homes, Log a visit / Edit a
visit, Log interaction (opened from On our hearts and elsewhere), and "Who are
we praying for?". These popups were reported as looking plain. The canvas is for
choosing one shared popup system. Once a direction is picked, the other popup
families move to it through their own tickets.

Canvas: https://claude.ai/artifact/UHGN3NFTE6uuH1EJhmTiYG

**Picked: A · Ink, structured** (2026-10-06). B and C stay on the canvas as the
rejected alternatives. The bottom row adds A's edge states (`A-States`) and the
remaining phone sheets (`A-PhoneHomes`, `A-PhoneMore`). Build from A only.

Delete and combine for Homes ship ahead of the redesign, in the current
styling: [#1408](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1408),
ADR 0040. Every direction draws both of them.

## Rows

| Row | Thesis |
| --- | --- |
| Today | What ships now, drawn from the source. Grey fields on a grey dialog, 10 px labels, sections separated only by gaps. |
| A · Ink, structured | Stays in Ink. White dialog with a section-label column, real field edges, tinted avatars, a pinned footer. Phone: bottom sheet. |
| B · Ink colours, Material anatomy | Material 3's dialog structure (a tray of cards, outlined fields with floating labels, input chips, segmented buttons) in Ink's black and greys. Phone: full-screen dialog. |
| C · Material 3 | Material 3 with a slate-blue seed palette, filled fields and level-3 elevation. The only coloured surfaces in the app. Phone: full-screen dialog. |

Each direction row has the same columns: System, Homes list, Home editor (never
visited, so Delete is offered), Combine homes (confirm step), Log a visit, Edit
a visit, Log a visit in dark mode, Log interaction, Who are we praying for?,
and Phone.

## Files

- `<Dir>-Visit.dc.html` and `<Dir>-Homes.dc.html` are components with tweaks
  (`mode` log/edit and `dark` for Visit; `view` list/edit/combine for Homes).
  The `-VisitEdit`, `-VisitDark`, `-HomesEdit` and `-HomesCombine` boards are
  thin wrappers that import them with a different prop.
- `Main.dc.html` is direction A's System board, which is the canvas entry.
- `canvas.json` is the v3 index the canvas is published from.

## What the artboards assume

The sample data is invented: today is Tuesday 6 October 2026, homes are
alphabetical by label (ADR 0031), and "Garcia" is a deliberate duplicate of "the
Garcias" while "the Mendozas" is a deliberate mistake. Type stays Lexend / Plus
Jakarta Sans in every direction, C included, rather than switching to Roboto.

## Regenerating

The `.dc.html` files are the source. To update the canvas, publish changed
files to the canvas URL above under `project/<same name>`.
