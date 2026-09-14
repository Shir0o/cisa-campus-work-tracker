# Around the team — reading the Conversation in place

Source artboards for [issue #965](https://github.com/Shir0o/cisa-campus-work-tracker/issues/965)
and [issue #966](https://github.com/Shir0o/cisa-campus-work-tracker/issues/966).
Both landed on the same seam: **Around the team tells you that something happened
and never what was said**, and both ways out of that are broken.

Published canvas: https://claude.ai/code/artifact/428bc5aa-b877-4d5c-8ea9-7faf1ae1301d

Decision record: [`../../adr/0022-around-the-team-has-one-worked-through-state.md`](../../adr/0022-around-the-team-has-one-worked-through-state.md)

## The artboards

| File | What it covers |
| --- | --- |
| `Main.dc.html` | The card, collapsed → open → the instant after Post. The Comment button becomes `Conversation · 3`, opening releases the two-line clamp, and the posted message lands directly above the composer. |
| `State.dc.html` | Seen and Completed merging into one **Reviewed**. The reviewed card treatment, "Mark all reviewed", and the pointer card catching up to the page's own count. |
| `Page.dc.html` | `/around` at 1440 with one card open, so the 3-up grid reflow is visible and the one-open-at-a-time rule has a reason you can see. |
| `Mobile.dc.html` | The same two states at 390. 44px targets, the action row stacked. |
| `canvas.json` | Layout — artboard positions, sticky notes, launch view. |

## Still open

**Which thread does the strip show?** A contact has two: **Conversation**
(everyone tied to them) and **Full-timers** (staff-only, `scope: "team"`).
Around is Full-timer-only, so either is defensible. The canvas draws
**Conversation only** — it is the thread the card's composer already posts into,
so what you write is what you see — and the `open-question` sticky note states
the alternative. Not yet decided.

## The decisions behind the drawings

Settled with the reporter over four rounds of grilling; the reasoning is in
ADR 0022 and the terms are in `CONTEXT.md` (**Reviewed**, **To work through**).

1. **The seam is reading, not navigating.** A skim surface that makes you leave
   to learn anything is not skimmable. The strip is the fix; the back-navigation
   repair is a floor, not the answer.
2. **One control, not a new one.** Comment becomes `Conversation · N` — same
   button, now carrying the count and toggling the strip. Nothing is added to the
   action row; the accent dot is removed from the header.
3. **Opening releases both clips.** The two-line body clamp exists to keep
   collapsed cards uniform for the 3-up grid. Once a card is open that constraint
   is gone, so the interaction text unclamps in the same gesture — which is the
   whole of #965's "hard to read because of length".
4. **The evidence that a message posted is the message.** It appears at the foot
   of the strip, an inch below where it was typed; the composer stays open and
   empty; the count ticks. The snackbar is corroboration, not the only signal.
5. **One state, set deliberately.** Only the Reviewed button and "Mark all
   reviewed" (scoped to the current filter). Opening the person does not set it,
   and neither does posting.
6. **Existing `seen` stamps are abandoned, never migrated** — promoting a glance
   to "worked through" is a claim the app must not make on a teammate's behalf.
7. **The partition is untouched.** Cards render from the thread subscription the
   page already holds; `buildAttentionItems` and `partitionAttentionStacks` are
   not modified, so no stack moves between On you and Around. ADR 0015 §6 stands.
8. **A message does not move its card.** No re-dating, no re-sorting. The day
   headings mean *when the team touched this person*.

## What the drawings assume about the code

Values lifted from `src/index.css` (Ink — Lexend / Plus Jakarta Sans, `#F4F4F5`
cards on white, `#F0F0F2` hairlines, the ADR 0009 radius ladder) and from
`src/components/landing/WorklistCard.tsx` at its real dimensions. The strip is
`src/components/Thread.tsx` in its existing `compact` variant.

Findings from that reading which the design depends on:

- **`<AroundTheTeam />` is mounted with no props** (`src/App.tsx:1006`), so
  `onToast` is `undefined` and `onToast?.(t("whatsNew.posted"))`
  (`WorklistCard.tsx:527`) has never fired on that page. The encouragement toast
  (`:299`) is equally dead there. The page already renders `UndoSnackbar`
  (`AroundTheTeam.tsx:551`) and holds `useUndoSnack` (`:126`) — the composer's
  toast simply routes to a prop nobody passes.
- **A comment posted from an Around card renders nowhere.**
  `attention.ts:198` drops thread items on contacts you are not tied to, so a
  plain `kind: "comment"` on an untied contact becomes no item in Around *or* On
  you. The page subscribes to every thread in the product and renders none.
- **`onPosted` calls `markSeen`** (`WorklistCard.tsx:526`), violating the
  invariant stated 250 lines earlier at `:279` — *"Seen is set here and only
  here — opening the person is the whole of it."*
- **`state.from` carries `location.pathname` only** (`App.tsx:411`,
  `AroundTheTeam.tsx:226`, and the identity-switch path at `:434`), so returning
  from a contact resets every filter. Scroll *is* restored
  (`usePreserveScroll`), so you land at the right offset of a differently
  filtered list.
- **`navTrail.ts:40` hardcodes `/people/:id` to the `/directory` section**, so a
  person opened from `/around` shows a trail claiming they came from People.
- **The pill and the pointer count different axes.** `toWorkThrough` cuts on
  `isCompleted` (`AroundTheTeam.tsx:282`, `:360`); `PointerCard.tsx:122` counts
  `InboxState.isSeen`. ADR 0015 §2 promised they could never disagree.
- **`UserEntityState.setRead` has no production readers for attention ids** —
  every real consumer uses `isDone`. Dropping seen writes breaks nothing
  downstream.
- **`worklistVerbFor` always returns `"reviewed"` on Around**, because the page's
  stacks only ever hold `contact` and `interaction` items. The other three verbs
  and the `null` case belong to On you.
- **`COLLAPSED_LIMIT` (`AroundTheTeam.tsx:42`) is dead** — left over from the My
  Day five-row cap.
- **The comments → threads migration is unfinished**, and it is invisible from
  `src/` alone: `packages/core` and `apps/mobile` still read and write
  `contacts/{id}/comments`. This design does not depend on it, but do not let a
  cleanup delete those Firestore rules. See
  [`../DRIFT.md`](../DRIFT.md) row 33.

## Shipping order

1. **Correctness PR, no design content.** `state.from` carries `pathname +
   search`; `LEAF_ROUTES` stops claiming People; `AroundTheTeam` gets a local
   `onToast` feeding the snackbar it already renders. All three are unit-testable
   and none wait on this canvas.
2. **This design.** The Conversation strip, the single Reviewed state, and the
   pointer card — the pointer ships here and not later, because the moment `seen`
   stops being written a count derived from it freezes rather than degrades.

## Why the published page is not checked in

Publishing wraps these sources in a ~2.6 MB editor payload. That artifact is
generated, not authored: it would dominate the repository, defeat diffing, and go
stale against these files. The sources here are the record; the canvas is a view
of them.
