# Prayer testimony composer — design canvas sources

Source artboards for the "How was it answered?" compose box on `/prayer`,
reported as [issue #705](https://github.com/Shir0o/cisa-campus-work-tracker/issues/705):
*"I think the answered circle border radius is too round."*

Published canvas: https://claude.ai/code/artifact/980b48d6-09c9-4512-bf83-b31c7a5be763

## The finding

It is not a taste call. The textarea is `rounded-xl`, and Ink re-values
`--radius-xl` to **32px** on `@theme` — the step Tailwind ships at 12px. The
box is 62px tall (`rows={2}` × 20px line + `p-2.5` + border), so 32 + 32
exceeds the vertical side and CSS scales both radii to **31px** — exactly half
the height. The corner stops being a corner and the input renders as a
lozenge. The photo dropzone below it is 38px tall and clamps to 19px, the same
way.

The compose box's own frame is `rounded-2xl`, which is **not** re-valued and
stays at Tailwind's 16px. So the nesting inverts: a 16px panel holding two
31px children inside a 24px card.

## The artboards

All four are the reported viewport — **1107×662**, collapsed rail, dark theme.

| File | What it covers |
| --- | --- |
| `Today.dc.html` | The row with the composer open, redlined. Every radius in the box labelled with the utility, the token it resolves through, and what the browser actually paints. |
| `Main.dc.html` | The proposal. Five values change, all inside the compose box: panel 16 → 14, textarea 32 → 10, dropzone 32 → 10, thumbnails 24 → 10. Nothing moves or resizes. |
| `Ladder.dc.html` | Why 32 got there. The `@theme` block verbatim, the compiled resolution table, the utility strip with call-site counts, and the three places the ladder runs backwards. |
| `Detail.dc.html` | The two boxes at every candidate radius, at size and at 4×. The 38px photo row is what rules out 24 and 16. |
| `canvas.json` | Layout — artboard positions, sticky notes, launch view. |

Crimson marks what renders today; green marks what is proposed. The headline
change is **32 / 32 / 24 / 16 → 10 / 10 / 10 / 14**, giving the first
descending nest the box has had: card 24 → panel 14 → controls 10.

## Where the values came from

Lifted from `src/views/PrayerList.tsx` (L1277–1364, the `answering` block),
`src/index.css` and `src/locales/en.json`. The `rounded-*` resolutions were not
inferred — they were produced by compiling the project's own Tailwind 4 against
the `@theme` block:

```
rounded-sm   default 4px   →  --radius-sm  10px
rounded-md   default 6px   →  (not re-valued)  6px
rounded      no default    →  --radius     14px
rounded-lg   default 8px   →  --radius-lg  24px
rounded-xl   default 12px  →  --radius-xl  32px   ← the bug
rounded-2xl  default 16px  →  (not re-valued) 16px
rounded-3xl  default 24px  →  (not re-valued) 24px
rounded-full →  calc(infinity * 1px), reads no key
```

Composer geometry, as built: panel `p-3` + border, `max-w-xl` = 576px →
550px inner. Textarea 62px tall, dropzone 38px, thumbnails 64px square.

Palette, resolved (dark): bg `#0A0A0B` · surface `#161618` · panel-2 `#202023` ·
border `#2A2A2E` · outline-variant `#232327` · text `#FAFAFA` · dim `#A1A1AA` ·
mute `#71717A` · success `#51E098` · danger `#FF7B88` · rail `#202023`. Type is
Lexend over Plus Jakarta Sans.

The contact shown is sample data. No real record is depicted.

## What shipped

The boards draw the desktop composer, but the same compose box exists seven
times across three files — testimony and archive-reason, desktop, mobile and
the landing rows — and all seven carried the same defect. All seven were moved
together; splitting them would have left the same control two shapes on one
feature.

| | Was | Now |
| --- | --- | --- |
| Compose panel (×7) | `rounded-2xl` 16px / `rounded-xl` 32px | `rounded-[14px]` |
| Textarea (×7) | `rounded-xl` 32px &rarr; clamps to 31 | `rounded-sm` 10px |
| Photo dropzone | `rounded-xl` 32px &rarr; clamps to 19 | `rounded-sm` 10px |
| Composer thumbnails (×2) | `rounded-lg` 24px | `rounded-sm` 10px |

`src/test/prayerComposerRadius.test.ts` is the guardrail: jsdom has no layout
engine, so the clamp is unobservable behaviourally: the test reads the sources
and asserts the shape contract, in the style of `accentToken.test.ts`.

## Out of scope, deliberately

- The same `rounded-xl` → 32px lands on **283 call sites**, including the
  answered-testimony *display* box and the edit textarea in this same row.
  Re-basing them is a separate decision and a separate diff. The display box's
  own 64px thumbnails were left at `rounded-lg` for the same reason — they
  belong to that box, not to the composer.
- `--radius-md`, `--radius-2xl` and `--radius-3xl` are never named on `@theme`,
  so the ladder is non-monotonic in three places (`sm` > `md`, `lg` > `2xl`,
  `xl` > `3xl`). Naming them would fix the class of bug rather than this
  instance — that is ADR material, not this change.
- `--radius-pill: 999px` is defined and has **zero** uses; all 580 pills are
  `rounded-full`.

## Regenerating

The artboards are authored directly — there is no build step. Edit the
`.dc.html` files, then re-seed and republish to the same artifact.

## Why the published page is not checked in

Publishing wraps these sources in a ~2.5 MB editor payload
(`prayer-composer.html`, gitignored). That artifact is generated, not authored:
it would dominate the repository, defeat diffing, and go stale against these
files. The sources here are the record; the canvas is a view of them — the same
reasoning as [`../contact-detail/README.md`](../contact-detail/README.md).

[`../DRIFT.md`](../DRIFT.md) #4 records the neighbouring case: rail items were
`rounded-xl` and rendered as pills for the same reason.
