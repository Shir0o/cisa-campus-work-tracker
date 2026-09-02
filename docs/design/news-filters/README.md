# News feed filters — design canvas sources

Source artboards for [issue #727](https://github.com/Shir0o/cisa-campus-work-tracker/issues/727):
filtering the home news feed by team and teammate, and highlighting the stacks
that contain an interaction.

Published canvas: https://claude.ai/code/artifact/00f4d4b1-0398-4f5d-827d-0a4dc2ec43b4

## The artboards

| File | What it covers |
| --- | --- |
| `Main.dc.html` | `AttentionFeed` on Home at 1440, on the rail shell. The feed gains a visible header carrying the title, the count, "Mark all scanned" and the filter row; both columns keep their shape. |
| `States.dc.html` | The filter row at 1:1 with its measurements, then all four states: resting, a team chosen, down to one teammate, and nothing matching. |
| `Highlight.dc.html` | The emphasis ladder for "has interactions", drawn against the emphasis the card already has — including the finding that the existing unread border does not render. |
| `Mobile.dc.html` | `MyDayMobile` at 390&#215;844. Same component, so the filter row has to survive the narrow width; chips hold one line and the select wraps under them. |
| `Teams.dc.html` | Settings — the new per-trainee team assignment beside the existing gospel-partner pairs, as two readings of one roster. |
| `canvas.json` | Layout — artboard positions, sticky notes, launch view. |

## The two decisions behind the drawings

1. **The filter cuts on the actor** — the trainee who added the contact or logged
   the conversation — not on the contact. It is the only axis on which a team
   means anything, and it is what makes the two halves of #727 one feature.
2. **Team is a field on the trainee**, not on the pair. Pairs stay independent
   and can in principle straddle teams; the feed reads the person's team.

Both were settled with the reporter before drawing.

## What the drawings assume about the code

Values here were lifted from `src/index.css` and the real component source rather
than invented — the filter row is `History.tsx:419–451` verbatim, and the stack
cards are `AttentionFeed.tsx:219–289` at their real dimensions. Three things the
drawings depend on:

- `stack.kinds` (`src/lib/attention.ts:32`) already carries the set of item types
  per stack and is never read by the UI. The highlight needs no new derived data,
  and neither does the teammate filter, which reads `stack.by`.
- A `team` field on the user document must also be added to the
  `firestore.rules` user allowlist, or every write is rejected while the picker
  looks like it worked.
- `AttentionFeed`'s strings are hardcoded English, unlike History's `history.*`
  namespace. New copy has to go through `src/locales/en.json` and `es.json` or
  `npm run check:i18n` fails.

`Highlight.dc.html` also records a drift finding: the stack card's unread
emphasis (`bg-surface border-outline-variant` against a `bg-surface` parent) is
1.04:1 in light theme and does not render. Only the accent dot carries unread
today. Fixing that is a token conversation, not a feed one; the marker is drawn
so it does not depend on it. See [`../DRIFT.md`](../DRIFT.md).

## Why the published page is not checked in

Publishing wraps these sources in a ~2.6 MB editor payload. That artifact is
generated, not authored: it would dominate the repository, defeat diffing, and
go stale against these files. The sources here are the record; the canvas is a
view of them.
