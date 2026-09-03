# Contact detail — design canvas sources

Source artboards for the contact detail frame rework, specified in
[issue #780](https://github.com/Shir0o/cisa-campus-work-tracker/issues/780)
and reported as [issue #762](https://github.com/Shir0o/cisa-campus-work-tracker/issues/762).

Published canvas: https://claude.ai/code/artifact/783c3c44-b999-4c99-b522-5c5c68e5b972

## The artboards

All four are the reported viewport — **1107×662**, rail shell, light theme.

| File | What it covers |
| --- | --- |
| `Today.dc.html` | The current page, redlined. 274px of the main column's 494px is pinned chrome; the aside takes 41% of the usable width; the 32px phantom scroll is marked. |
| `Main.dc.html` | The proposed frame (titled "Frame" on the canvas). Aside deleted, head compressed to one 56px row, footer gone, `pb-8` dropped. Overview carries the profile fields. |
| `Panes.dc.html` | Discussion as a fill pane — the list scrolls inside the pane, the composer is pinned to it, and it opens on the newest message. |
| `Editing.dc.html` | The edit form at 779px, two columns at ~365px each, with the Save/Cancel footer that renders only while editing. |
| `canvas.json` | Layout — artboard positions, sticky notes, launch view. |

Crimson hatching marks what the space is spent on today; green marks what comes
back. The headline number is **220 × 435 → 422 × 779**.

## Where the values came from

Lifted from `src/index.css`, `src/App.tsx`, `src/lib/permissions.ts` and
`src/components/modals/ContactDetailsModal.tsx` rather than invented, so these
can be read as the target rather than as an impression of it:

```
viewport 1107×662 | track p-4 = 16 | rail 232px (w-[232px]) r=32 (--radius-xl) #0A0A0B
content column x=264 w=827 | chrome strip h-14 = 56
main pb-8 = 32 (today) / 0 (proposed)
.cd-page padding 24, grid minmax(0,1fr) 320, gap 24
.cd-page-main #F4F4F5, border #F0F0F2, r=24
.cd-head pad 24/28/18 → ~166 | .cd-tabs-bar 48 | .cd-page-foot ~60
```

Palette, resolved (light): bg `#FFFFFF` · surface `#F4F4F5` · panel-2 `#EAEAEC` ·
text `#0A0A0B` · dim `#52525B` · mute `#A1A1AA` · border `#E4E4E7` · border-soft
`#F0F0F2` · accent `#52525B` · primary `#131316` · danger `#B1000F` · rail
`#0A0A0B`. Note that `--accent` resolves to `--text-dim`; the
`--accent: var(--primary)` mapping is scoped to `.page.msgs` only. Type is
Lexend over Plus Jakarta Sans.

The contact shown is sample data. No real record is depicted.

## Regenerating

`build.mjs` holds the shared shell (rail, chrome strip, icons, tokens);
`boards.mjs` holds the four boards' content and writes the `.dc.html` files.
Edit those rather than the generated artboards, then:

```bash
node boards.mjs
```

## Why the published page is not checked in

Publishing wraps these sources in a ~2.4 MB editor payload
(`contact-detail-frame.html`, gitignored). That artifact is generated, not
authored: it would dominate the repository, defeat diffing, and go stale
against these files. The sources here are the record; the canvas is a view of
them — the same reasoning as [`../ink/README.md`](../ink/README.md).

Per [ADR 0003](../../adr/0003-nav-rail-floating-shell.md) the design canvas is
normative for shell chrome, and [`../DRIFT.md`](../DRIFT.md) is the register
when the build diverges from the drawing.
