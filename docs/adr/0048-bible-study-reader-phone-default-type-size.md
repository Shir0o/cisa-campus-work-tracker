# 0048: The reader's default type size follows the box's measure

## Status
Accepted. Adds to [ADR 0014](0014-bible-study-reading-deck-and-editor-document-index.md) and [ADR 0043](0043-bible-study-reader-pages-on-wide-screens.md); the four-step control itself is unchanged.

## Context

Issue [#1840](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1840), a follow-up from the `/bible-study/read` critique ([#1770](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1770)). #1770 took the reader's phone insets to 12px of ground and 16px of card, leaving a 317px text column at 375 — the most a layout change can buy.

At 20px body type, Lexend gives **32 characters per full line** (median of ten study-style paragraphs, last line of each excluded) in that column, and 31 for the Passage at `fs + 3px` = 23px. Continuous prose wants ~45–75 characters and 30–40 is the tolerated floor for a narrow phone column, so the raised default turned multi-sentence paragraphs into a column of phrases. The four-step range (16/18/20/22) already puts the choice in the reader's hands, but the default is what most readers get.

Each step, measured on the real box:

| Default | Body | @317px (phone) | Passage (`fs + 3px`) |
| --- | --- | --- | --- |
| 16 | 16px | 42 (40–44) | 19px: 38 |
| 18 | 18px | 36 (34–38) | 21px: 33 |
| 20 (the old default) | 20px | 32 (31–34) | 23px: 31 |
| 22 | 22px | 29 (26–31) | 25px: 26 |

No ADR held the 20px default; the only record was a comment above `READER_TYPE_DEFAULT` citing #923. Whatever won here needed a home, and one that carries the characters-per-line baseline so the next pass can measure against it.

## Decision

1. **The default comes from the reader's own box, not from the device class.** Under the measure floor the reader opens at **18px**; at or above it, the raised **20px**. Nothing is stored, so a reader who never chose cannot be overridden by a device guess, and the editor's phone preview and `/s/:slug` inherit the same behaviour because they render through the same component.
2. **The floor is the reader box under 400px** (`NARROW_READER_BOX`). The text column is the box minus the panel and card insets — 12 + 1 + 16 per side, 58px — so 400px of box is a 342px column, the ~340px where 20px stops holding a line of prose. 375 gets 18px (36 characters); 390 in the editor preview gets 18px, so the preview matches a real phone; a tablet or laptop keeps 20px.
3. **A choice always outranks the box.** A size in `cisa.reader.type-size.v1` is read once on mount and wins, and a size picked during the visit wins even if storage is unavailable — the person who cannot read the text is the person who can fix it (#923). The box only ever supplies the default.
4. **One measurement, before paint.** The default resolves from the ResizeObserver the paged deck already owns (#1590), in a `useLayoutEffect`, so a phone never flashes the wide default. A box that measures 0 (no layout, as in jsdom) has no measure to judge and keeps 20px.
5. **The range stays 16/18/20/22.** 18 is one tap from either neighbour; 16 is still the only step that reaches a true prose measure (42) and is available to anyone who wants it.

## Considered options

**Keep 20px.** Honest for what most Sections are — a heading, an outline point, a one-sentence prompt — and weak for a paragraph, which is what the Passage and prose blocks are.

**Global 18px.** Rejected: a 10% type shrink for a 10% longer line on the phone, paid for by shrinking the paged deck's column on a tablet or laptop, where the Passage basis is already 380px+ and the measure was never the problem.

**16px as the default.** Rejected for now: it is the only step that reaches 42 characters, but it is below iOS body (17px) for a page read standing at arm's length, which is a bigger change of character than "one step down" and should be chosen deliberately, not derived from a character count.

**A device-class or breakpoint default.** Rejected: the reader already measures its own box (#1590) precisely so the editor's 390-wide preview stays a phone inside a wide desktop window; a `window.matchMedia` default would make the preview lie.

## Consequences

A reader with no stored size on a phone now gets 18px body and 21px Passage, 36 characters; on a wide screen they get the 20px they had. Anyone who had already chosen keeps their choice, including a stored 20 on a phone.

The measure baseline is now written down: **32 characters at 20px, 36 at 18px, 42 at 16px, on a 317px column at 375**. A future inset or font change can be judged against those numbers instead of re-deriving them.

Known gap: the arm's-length check — whether 36 characters at 18px reads as prose in a room, on a real phone — was **not** performed for this decision. The call rests on the measured measure and the triage on #1840, which recommended this option; if 18 and 20 turn out to feel the same in the hand, the honest follow-up is 16, not a return to 20.
