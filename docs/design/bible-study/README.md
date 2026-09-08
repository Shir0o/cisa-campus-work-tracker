# Bible study — public QR page, in-app reader, admin editor

Design for migrating the Bible study off the Google Site / Subsplash app onto a
public URL a student reaches by scanning a QR code.

Canvas: https://claude.ai/code/artifact/ba2465c0-a117-42d7-88e4-6b94b876ff07

Glossary terms (Entry point, Study, Meeting, Section, Passage, Prompt, Blank)
live in `CONTEXT.md`.

## Settled

| | |
|---|---|
| Entry | One durable QR per **Entry point** (`/s/:slug`), shown on a leader's phone, never printed. Resolves slug → active Study → newest published Meeting. Reversed the earlier "one QR per Meeting" — see ADR 0011. |
| Public surface | Read-only. Nothing anonymous is ever written. |
| Structure | Author-defined Sections, one per screen; outline points, Passage, Prompt — all optional, order as written. Confirmed by ADR 0014: a scroll-snap panel is still one Section per screen. |
| Motion | Scrolling deck: Sections stack as scroll-snap panels (proximity), content top-aligned, sized in `dvh`. Scrolling is the navigation — no click-to-advance, no parallax. See ADR 0014. |
| Prompts | Question / Discuss / Activity. Never answered on the page. |
| Blanks | Outline points and Passage, tap to reveal, per-Meeting author's choice. A Blank's tap is the only tap left — there is no surface tap to compete with. |
| Navigation | Auto-hiding edge scrubber, Sections only, labelled from headings. Jumping scrolls the deck (`scrollIntoView`); the scrubber never owns position. |
| Theme | Light and dark, following the phone. |
| Content | Own collection. One markdown document per Meeting + three conventions (`## ` = Section, blockquote = Passage, `Question:`/`Discuss:`/`Activity:` line = Prompt), parsed live as written — see ADR 0013. |
| Splits | Two **Entry points**, each with its own Study, populated by duplicate-week. Opening and closing are duplicated, not shared. `siblingId` removed — see ADR 0011. |
| Reader surfaces | Public web (phone), plus the native app and installed PWA for signed-in users. No desktop reader. |
| Desktop | Admin editing only — but the Meetings index and present mode must also work on a phone, since the QR is displayed from one. Reversed — see ADR 0011. |

Governing principle from the last round: **the author decides, the page obeys.**
Sections sit exactly where they are written; the index is labelled from the
headings; nothing warns, auto-splits or shrinks type on the author's behalf.

## Why not `board_docs`

The audience ladder in `src/lib/board.ts` bottoms out at `everyone` = "anyone in
CISA", and `boardLevelForRole` returns -1 for anyone unauthenticated. Public is a
rung *below* the bottom of the same ladder that guards team pastoral coordination
notes, mirrored in `firestore.rules`. The machinery is reusable — `ReadOnlyDoc`
already renders a doc's markdown with `react-markdown` and no TipTap or Yjs — the
collection is not.

## Artboards

- `Main.dc.html` — the public reader, interactive (scrolling deck, Blanks, edge index; theme tweak)
- `InApp.dc.html` — the same Meeting inside the native / PWA shell
- `Editor.dc.html` — desktop admin editor (document with a navigating outline, real-reader preview)
- `DirectionA` / `DirectionB` — considered and rejected, kept on page 2

## Fullscreen — the one ask that cannot be built as stated

iPhone Safari does not expose the Fullscreen API for ordinary elements; only
video can go fullscreen there. Android Chrome does. Since students scan into
Safari on a phone, `requestFullscreen` would silently do nothing for a large
share of them.

The CSS distraction-free mode the prototype once shipped as the workaround is
gone: ADR 0014 deleted it along with the tap-to-advance chrome it existed to
hide — the reader is a scrolling deck, and there is not enough chrome left to
be worth a mode that dims it.

True fullscreen has one reliable route on iOS: Add to Home Screen.
`public/manifest.json` already declares `display: standalone`, so an installed
copy runs with no browser chrome. That should stay an invitation, never a wall —
it is the one place the no-download promise softens. Confirm against your target
iOS version before building on it.

## Open

- Second-pass reading features parked at Q5: Spanish toggle, cross-reference sheets, read-aloud.
- Leader-paced follow mode, parked at Q2. Every Section carries a stable id so it stays an addition rather than a rewrite.
