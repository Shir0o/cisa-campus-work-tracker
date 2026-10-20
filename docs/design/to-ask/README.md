# To ask — design canvas sources

Source artboards for [issue #1639](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1639):
"a smart notepad for Full-timers to note items to ask Trainees in person — all
the names that have no updates need to be asked in person."

Published canvas: https://claude.ai/artifact/65yh9Dy5rsh6MWoqQEUBbH

Decision record: [`../../adr/0046-to-ask-drafted-lines-stay-tied-to-their-signal.md`](../../adr/0046-to-ask-drafted-lines-stay-tied-to-their-signal.md).
Glossary: **To ask** and **Asked** in `CONTEXT.md`.

## The artboards

| File | What it covers |
| --- | --- |
| `Main.dc.html` | `/ask` at 1440. General first, then one card per Trainee (most open first), "No Trainee tied" last. Hand-written lines before drafted ones; a cleared line and an Asked line struck through. |
| `Mobile.dc.html` | Two phones at 390: the Trainee list with counts, then the list narrowed to Jae — the screen used standing next to him. |
| `Lifecycle.dc.html` | ADR 0046 drawn: a reworded line still clears itself when Jae logs; an Asked line leaves and returns only on a new signal. |
| `Entry.dc.html` | The My Day pointer card, and "Add to To ask" from a contact's overflow menu with the Trainee picker. |
| `canvas.json` | Layout — artboard positions, sticky notes, launch view. |

## The decisions behind the drawings

Settled with the reporter in grilling on 2026-10-16.

1. **Both written and drafted.** The app drafts lines from three existing
   signals — Not reached yet, a Follow-up ask open 3 days, a Thread question
   unanswered 3 days. No new staleness interval, for the same reason **Who we
   haven't seen** carries none.
2. **Grouped by Trainee**, because the moment of use is a Trainee in front of
   you. A person tied to two Trainees appears under both; no Trainee tied gets
   its own group so they are not silently dropped. Every hand-written line sits
   under a Trainee or under General.
3. **Private to each Full-timer.** No Trainee or other Full-timer sees it.
4. **Drafted lines stay tied to their signal, even reworded** (ADR 0046).
5. **Two ways to close a line:** Log on behalf (the honest record of what you
   heard) or a private Asked tick. No "I followed up" on a Trainee's behalf.
6. **Asked returns only on a new signal**, never on a timer.
7. **Ticked lines stay struck through 7 days**; Clear done empties them sooner.
8. **Team filter** as on Around the team; groups sorted most-open first; inside
   a group, hand-written first, then drafted oldest first.
9. **No notifications**, and not added to the Weekly reminders. The My Day
   pointer card carries the count.
10. **Phone and web**, phone-first.

## What the artboards assume

Sample data is invented: today is Friday 16 October 2026. Look is Ink (Lexend /
Plus Jakarta Sans, monochrome with tinted avatars), matching the other canvases.
Lines and ticks are assumed stored server-side so phone and laptop agree, as
Seen / Completed are.

## Regenerating

The `.dc.html` files are the source. To update the canvas, publish changed
files to the canvas URL above under `project/<same name>`.
