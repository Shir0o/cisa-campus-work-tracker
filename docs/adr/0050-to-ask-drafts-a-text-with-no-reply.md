# 0050: To ask drafts a line for a text nothing came back from

## Status
Accepted

## Context
**To ask** drafted lines from three signals: **Not reached yet**, a **Follow-up ask** open three days, and a Thread question unanswered three days. All three are about staff owing each other an answer.

The gap is the person who was written to and went quiet. A Full-timer asking a Trainee in person "did anyone hear back from Mei?" is exactly the errand the notepad exists for, and nothing in the app surfaced her: a logged **Interaction** of kind `chat`/`text`/`email` is a fact about what was sent, not about what came back (#1670).

The app has no inbound channel from a Contact. **Messages** is staff-only, and an Interaction is written by staff after the fact. So "no reply" can only ever mean *nothing newer has been logged with that person* — never "they replied and nobody saw it".

Recall also that tapping Call or Text writes nothing by design, so the signal has to read the logged Interaction, not the tap.

## Decision
A fourth signal drafts a line: the newest outreach **Interaction** with a person (kind `chat`, `text` or `email` — Quick Capture's older `text` included; a logged meeting or call is a conversation had, not a message waiting) with nothing newer logged for **seven campus calendar days**.

- "Nothing newer" is read from the whole reach model: any Interaction of any kind, a **Gathering** they were present at, or their reach stamp. A call back, a visit, a Friday night — all end it.
- The signal instance is the Interaction, so the line is keyed `noReply|contact|interactionId`. A second text after a reply drafts a fresh line; it never re-opens the one that was asked.
- It applies to anyone on the roster written to, whatever their kind. Unlike **Not reached yet**, it is not narrowed to new Contacts: a follow-up is as useful for a student met last term.
- Seven days, not the three the ask/question rules use, because a person answering is slower than a teammate answering. A separate constant, so the two never move together by accident.

## Considered Options

- **Reuse the three-day rule.** Fits the existing constant and needs no new number, but a text is not an internal obligation: three days is a teammate being slow, seven is a person not coming back.
- **Track a reply as data.** Would let the line say "they answered" and clear on the answer rather than on a log. There is nothing to receive it from; it would be a messaging feature wearing a notepad's shape.
- **Narrow it to Contacts.** Cheaper to reason about beside **Not reached yet**, but drops the commonest case — someone texted weeks ago who is already in church life or a student.

## Consequences

- The line is only as good as the logging. Someone who answered without anyone recording it stays in the list until an Interaction is logged; the wording says "heard nothing back" rather than "they did not reply" so the list never claims to know more than it does.
- `ToAskInteraction` now carries the Interaction's id, because the signal instance is a row rather than a person. Rows read before this change have no id and fall back to the Interaction's date.
- The cleared line reads "Cleared · {name} {verb} them", the same shape as **Not reached yet**.
