# Bible study — weeks index, editor, present mode, no-week states

Design for issue [#822](https://github.com/Shir0o/cisa-campus-work-tracker/issues/822)
— "bible study needs a index and not just replace the same one every week".

Canvas: https://claude.ai/code/artifact/abbe5271-3a17-4539-b720-89062eccde59

Decisions and rejected alternatives live in
[ADR 0011](../../adr/0011-bible-study-entry-points.md). Glossary terms (Entry
point, Study, Meeting) live in `CONTEXT.md`. This round reverses three rows
previously marked Settled in [`../bible-study/README.md`](../bible-study/README.md)
— Entry, Splits and Desktop — which are edited in place there.

## Settled

| | |
|---|---|
| Entry | One durable QR per **Entry point** (`/s/:slug`) → active Study → newest published Meeting. Shown from a phone, never printed. |
| Index | Full-timers only, at `/bible-study`. No public archive: students scan and read on the spot. |
| Editor | Moves to `/bible-study/:meetingId`. Loses the week list, the QR panel and "Split into two". |
| Guard | Leaving an unsaved week asks; three buttons, because cancelling and discarding are different intentions. |
| Publish | Unpublishing falls back to the previous week **with its date shown**. Delete only while unpublished. |
| Present | White ground, not the phone's theme — a dark ground behind a QR hurts scan reliability. |
| Splits | Two Entry points, made with duplicate-week. `siblingId` removed. |
| QR origin | `VITE_PUBLIC_APP_URL`, defaulting to the production URL — never `window.location.origin`. |

## Artboards

- `Main.dc.html` — weeks index, desktop
- `IndexPhone.dc.html` — weeks index, phone (where "Show QR" is actually pressed)
- `Editor.dc.html` — week editor, desktop
- `UnsavedGuard.dc.html` — leaving an unsaved week
- `Present.dc.html` — the code you hold up in the room
- `EmptyStates.dc.html` — the three states a scan can find with no week to show

Static mockups. Values are lifted from the app — Lexend / Plus Jakarta Sans, the
Ink palette, 24px cards, 14px panels, 44px rows, the 232px rail. The Romans week
titles and body copy are realistic sample content, not final.

## Open

- The index's All / Published / Drafts filter earns its place at 12 weeks and is
  clutter at 4. Probably cut for v1.
- The weeks index is designed for web only (desktop + responsive phone). Whether
  a Full-timer should reach it from the native app is undecided.
