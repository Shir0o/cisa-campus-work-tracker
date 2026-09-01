# Ink in dark — design canvas sources

Source artboards for the dark-theme review of the navigation rail, and for the
four directions that came out of it. The floating rail (**direction B**) is what
shipped; see [`docs/adr/0003-nav-rail-floating-shell.md`](../../adr/0003-nav-rail-floating-shell.md)
for the decision and [`docs/design/DRIFT.md`](../DRIFT.md) for everything else
the review turned up.

Published canvas: https://claude.ai/code/artifact/8456b8e0-7050-423d-ba18-c25bad5dc5f1

This is a second canvas, not an extension of [`../ink/`](../ink). A canvas is
defined by its `canvas.json`, so two of them cannot share a folder.

## The artboards

| File | What it covers |
| --- | --- |
| `Directions.dc.html` | The four directions — A Raised, B Floating, C Inverted, D Rule — each with its motivation, its tradeoff and its values. Also the side-by-side showing that the black rail was in the design and never in the build. |
| `Floating.dc.html` | Direction B at 1440×900. This is what shipped. |
| `Main.dc.html` | The rail shell as it was *before* B, at 1440×900. Kept as the baseline the directions were drawn against. |
| `Rail.dc.html` | Both rail widths 1:1 against a 900px viewport, item states, and the resolved dark token values. Pre-B. |
| `Findings.dc.html` | The four things the dark walk turned up, each as a light/dark pair. All four are fixed; the artboard is the evidence for why. |
| `canvas.json` | Layout — artboard positions, sticky notes, launch view. |

## These artboards are a record, not a target

`Main.dc.html`, `Rail.dc.html` and `Findings.dc.html` draw the rail as it was
before this work: flush, `bg-surface`, hover states that did nothing in dark, a
badge whose count was unreadable on a resting item. They are deliberately not
updated. They are the argument that produced the decision, and rewriting them to
match the outcome would leave the ADR and the drift register with nothing to
point at.

`Floating.dc.html` is the one artboard that describes the current build.

## A caution the Ink canvas should have carried

[`../ink/README.md`](../ink/README.md) says its values "were lifted from
`src/index.css` and the real component source rather than invented, so they can
be read as the target rather than as an impression of it."

That is true of the token artboards and **false of the rail ones**.
`NavPref.dc.html`, `Shells.dc.html` and `Home.dc.html` were drawn from the
navigation spec before the rail existed, so their rail is aspirational — and the
gap between that drawing and what got built is most of
[`DRIFT.md`](../DRIFT.md). When reading any artboard here, check whether it
describes the build or proposes one; this README says which for each.

## Why the published page is not checked in

Same reason as [`../ink/README.md`](../ink/README.md): publishing wraps these
sources in a ~2.6 MB editor payload that is generated rather than authored. It
would dominate the repository, defeat diffing, and go stale against these files.
The sources here are the record; the canvas is a view of them.
