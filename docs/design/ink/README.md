# Ink — design canvas sources

Source artboards for the Ink design system and the navigation shell work, as
specified in [`docs/specs/ink-design-system.md`](../../specs/ink-design-system.md)
and [`docs/specs/navigation-shell-preference.md`](../../specs/navigation-shell-preference.md).

Published canvas: https://claude.ai/code/artifact/15037373-dc36-41fa-98df-ca1d16678d73

## The artboards

| File | What it covers |
| --- | --- |
| `Main.dc.html` | Foundations — surfaces, ink, accent, signal, data hues, shape, type. Each swatch carries the new value and the Bento value it replaces. |
| `Components.dc.html` | The existing components at their real dimensions, retoned. Buttons, selection states, fields, marks, cards, list rows, and the rail spec. |
| `Home.dc.html` | Home at 1440, on the rail shell. |
| `Journey.dc.html` | The Journey at 1440 — the hardest case, since stage colours are persisted in Firestore as class names and stay vivid. |
| `Dark.dc.html` | The `.dark` block, plus the two dark-mode findings: `--accent-on` inverts, and the rail cannot stay black. |
| `Shells.dc.html` | Top bar vs rail, side by side, same page and same content. |
| `NavPref.dc.html` | The three navigation states, both rail widths at 1:1, the preference model and the width rules. |
| `canvas.json` | Layout — artboard positions, sticky notes, launch view. |

Values in these files were lifted from `src/index.css` and the real component
source rather than invented, so they can be read as the target rather than as an
impression of it.

## Why the published page is not checked in

Publishing wraps these sources in a ~2.6 MB editor payload. That artifact is
generated, not authored: it would dominate the repository, defeat diffing, and
go stale against these files. The sources here are the record; the canvas is a
view of them.
