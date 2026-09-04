# The prayer fold — design canvas for #709

Source artboards for the canvas answering
[#709](https://github.com/Shir0o/cisa-campus-work-tracker/issues/709) —
*"the folded looks funky and crammed and the line coloring"* — reported from
`/prayer` at 1107×662, in the **dark** theme. The artboards are dark for that
reason; `Main.dc.html` carries a `theme` tweak that flips it to light, because
the line values fail in both and have to be fixed in both.

Canvas: https://claude.ai/code/artifact/642e30e8-27b1-4c19-8e13-516b2ce0aee5

| File | What it shows |
| --- | --- |
| `Main.dc.html` | The proposed card at the reported viewport. Clickable: open and close the fold, click an earlier line to open that prayer in place. `theme` tweak: dark / light |
| `Today.dc.html` | The card as shipped, fold open, with the heights and the contrast ladder added up from the source |
| `Lines.dc.html` | The line system: one line value, the dot alphabet, the rhythm, and the two changes that reach past this card |
| `canvas.json` | Artboard layout |

## What the feedback turns out to mean

**"The line coloring."** `PrayerItem` gives each entry a `border-l-2` whose
colour is asked to carry two unrelated facts at once — *where you are* in the
thread and *how the prayer landed*. Against the dark card (`--surface`,
`#161618`) the three values it takes are:

| Rail | Token | Contrast |
| --- | --- | --- |
| This week | `border-l-primary` → `#FAFAFA` | 17.3:1 |
| Answered | `border-l-success/50` | 3.5:1 |
| Everything else | `border-l-outline-variant` → `#232327` | 1.15:1 |

So this week's 2px rail is the loudest object on the page — louder than the
person's name — and every other rail is not there at all. The three section
eyebrow rules (`flex-1 h-px bg-outline-variant`) sit at the same 1.15:1, and they
run *horizontally across* the vertical rails, each of which starts and stops
under one of them. Two line systems, crossed, neither legible. Light inverts the
same gap exactly: a `#131316` rail at 16.9:1 on a `#F4F4F5` card, `#F0F0F2` rules
at 1.04:1. A hairline is *meant* to be quiet, so 1.15:1 is not the bug on its
own — the bug is the spread. One line value in this card does sixteen times the
work of the others.

**"Crammed."** Opening the fold adds ≈396px for four prayers you are only
glancing at — 85px each. 144px of that is a Mark chip row (4×36px) reprinted once
per entry, for history nobody is marking. The four expanded entries have **no gap
and no divider** between them, so one entry's chip row butts straight into the
next entry's date. Card total with the fold open: ≈824px, on the 662px-tall
window it was reported from.

## What the canvas proposes

1. **One spine.** Every structural line in the card becomes `--outline` at 1px —
   the card edge and a single continuous rail running the whole thread, instead
   of three disconnected stubs. `--outline-variant` stops being used for
   structure; it keeps its one honest job, the rim on an unselected mark chip.
   Be clear about the size of that win: it moves a hairline from 1.15 to 1.27
   dark, 1.04 to 1.15 light, and both are still quiet. The change that matters is
   the 2px rail leaving at 17.3:1, not the hairline getting darker.
2. **Colour moves to a 9px dot on the spine.** About a third of the ink of a
   2×90px bar, and it lands where the eye is already travelling. **Status
   fills the dot; this week rings it** — two independent facts, two independent
   marks, which is why an ongoing prayer from this week and an answered one from
   August stop looking like different kinds of object.
3. **The three eyebrow rules go.** The spine separates now. `THIS WEEK` keeps
   its words as a 10.5px/600 tracked uppercase label sitting inline with its
   date — the differentiation the 11px grey label lost when its
   `uppercase tracking-wide` was stripped (the stray double spaces in those
   `className` strings are where it used to be).
4. **An earlier prayer collapses to one 30px line** — dot, date, mark, burden
   truncated. Click it and it opens in place with its text and its actions.
   Opening the fold costs ≈150px instead of 396; the card lands at ≈495px.
5. **A real chevron.** The fold's `▶` is a 9px text glyph sitting off the
   baseline of the 11px label beside it; it becomes a 16px SVG node on the
   spine, so the fold is part of the timeline rather than a third hairline.

## Two things the canvas raises that the issue does not

- **The card's own border is invisible too.** It is `border-outline-variant`,
  the same 1.15:1 / 1.04:1 value, so every card on the page floats with no edge.
  Moving it to `--outline` is one word and it is the same complaint — but it only
  reaches 1.27:1 / 1.15:1, and it is a page-wide change rather than a fold
  change, so `Lines.dc.html` calls it out separately for the team to decide.
- **Mobile carries nearly the same fold.** `PrayerListMobile.tsx` has the same
  `▶` glyph (at 10px), the same three eyebrow rules and the same three rail
  colours at `pl-3.5 border-l-2`. It is not identical — two of its rules are
  `/60`, and its earlier list has `space-y-2`, so the no-gap cramming is
  desktop-only. The line colouring is the same bug on both surfaces; the cramming
  is worse on desktop. Whatever lands here should land there, or the two drift
  apart again.

One thing outside the issue is carried in `Main.dc.html` because it is visible in
the reporter's own screenshot: the name clips to *David Alvara…* with ~380px of
the row sitting empty beside it. `Main.dc.html` simply makes the name block the
flex child that grows. The cause in the shipped card is not settled — from the
markup alone the header's left button should size to its content and never need
to truncate at that width, so it wants a look in the browser before anyone
writes the fix.

## Regenerating

The `.dc.html` files are the source; the published canvas is generated from them
and is not committed (it embeds a ~2 MB editor payload). Re-seed with the
`design` skill's helper, passing each artboard and `canvas.json`.
