# Bible study — public QR page, in-app reader, admin editor

Design for migrating the Bible study off the Google Site / Subsplash app onto a
public URL a student reaches by scanning a QR code.

Canvas: https://claude.ai/code/artifact/ba2465c0-a117-42d7-88e4-6b94b876ff07

Glossary terms (Study, Meeting, Section, Passage, Prompt, Blank) live in
`CONTEXT.md`.

## Settled

| | |
|---|---|
| Entry | One QR per Meeting; `/s/:studyId` redirects to newest. A stale scan shows the date, no redirect. |
| Public surface | Read-only. Nothing anonymous is ever written. |
| Structure | Author-defined Sections, one per screen; outline points, Passage, Prompt — all optional, order as written. |
| Motion | Scroll-parallax, click to advance, fullscreen. A long Section scrolls in place. |
| Prompts | Question / Discuss / Activity. Never answered on the page. |
| Blanks | Outline points and Passage, tap to reveal, per-Meeting author's choice. |
| Navigation | Auto-hiding edge scrubber, Sections only, labelled from headings. |
| Theme | Light and dark, following the phone. |
| Content | Own collection. Markdown + two conventions (blockquote = Passage, marked line = Prompt), parsed at publish. Reuses the TipTap editor and `ReadOnlyDoc`. |
| Splits | Two Meetings, two QRs, shared opening and closing. Neither shows the other's Passage. |
| Reader surfaces | Public web (phone), plus the native app and installed PWA for signed-in users. No desktop reader. |
| Desktop | Admin editing only. |

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

- `Main.dc.html` — the public reader, interactive (advance, Blanks, edge index; theme tweak)
- `InApp.dc.html` — the same Meeting inside the native / PWA shell
- `Editor.dc.html` — desktop admin editor
- `DirectionA` / `DirectionB` — considered and rejected, kept on page 2

## Fullscreen — the one ask that cannot be built as stated

iPhone Safari does not expose the Fullscreen API for ordinary elements; only
video can go fullscreen there. Android Chrome does. Since students scan into
Safari on a phone, `requestFullscreen` would silently do nothing for a large
share of them.

The prototype therefore ships a CSS distraction-free mode — chrome dims and
shrinks, the Section takes the room — following the app's existing
`body.msgs-fullscreen` pattern (`src/index.css:3684`).

True fullscreen has one reliable route on iOS: Add to Home Screen.
`public/manifest.json` already declares `display: standalone`, so an installed
copy runs with no browser chrome. That should stay an invitation, never a wall —
it is the one place the no-download promise softens. Confirm against your target
iOS version before building on it.

## Open

- Second-pass reading features parked at Q5: Spanish toggle, cross-reference sheets, read-aloud.
- Leader-paced follow mode, parked at Q2. Every Section carries a stable id so it stays an addition rather than a rewrite.
