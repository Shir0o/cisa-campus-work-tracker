# Follow-up reach — design canvas sources

Source artboards for [issue #813](https://github.com/Shir0o/cisa-campus-work-tracker/issues/813).
The issue asked who a follow-up should reach. Working it through turned up the
harder question underneath: **how does a Full-timer ask a Trainee about a
contact at all, and how does it draw their attention when the Trainee never
opens the contact page?**

Published canvas: https://claude.ai/code/artifact/dd152e5e-cdfa-437e-b63a-32f4ca6be665

## The artboards

| File | What it covers |
| --- | --- |
| `Main.dc.html` | The scenario end to end at 1440 — David writes a question from the feed card he already works in, it reaches Ana's phone, and each kind ends its own way. Plus the contact-page tab renames. |
| `Inbox.dc.html` | The feed column as a worklist: seen and completed as two separate facts, the count that never lies, and the completion verb per item type. |
| `Reach.dc.html` | The four ties, where each is stored, and which can be read at write time. Then the strongest objection to the whole design — the to-do already does this, better — and why it loses anyway. |
| `Options.dc.html` | The three ways the accumulation question could go, with the term's arithmetic. Kept as the record of why C won. |
| `Mobile.dc.html` | `MyDayMobile` at 390×844 — the surface a Trainee actually lives in. |
| `canvas.json` | Layout — artboard positions, sticky notes, launch view. |

## The decisions behind the drawings

Settled with the reporter over eight rounds; every one had a live alternative.

1. **A follow up is texting or emailing the contact** after the first
   encounter — an act toward the *person*, never a reply in the app. The word
   had been doing two jobs; see `CONTEXT.md`.
2. **A follow-up ask is an ask, not an assignment.** No owner, no due date. This
   is why it stays a thread message rather than becoming a `Task`, despite
   `Task` having strictly better machinery — a to-do list is personal, and
   putting someone else's name and a date on an errand creates an obligation
   this is meant to avoid. When you *do* want Ana to own it by Friday, assign a
   to-do; that path is untouched.
3. **Everything written reaches everyone tied** to the contact — bell and push —
   unless an `@mention` narrows it to one person.
4. **Closing is always explicit.** Logging an Interaction does not close an ask
   and neither does replying: you may have texted them about something else, and
   closing it silently would lose it with nobody noticing.
5. **A question is answered by the first reply from someone other than the
   asker.** No resolve button, consistent with `/questions`, which decided
   deliberately that nothing is ever resolved.
6. **Seen and completed are separate**, per person, server-side. Opening
   something never makes the count fall.
7. **Reviewing is private.** A Trainee learns nothing about a Full-timer's
   attention unless the Full-timer deliberately sends something.
8. **The feed column is the worklist** — not History (a separate audit log,
   capped at 100 rows, sharing no item identities with the feed) and not a new
   destination.

## What the drawings assume about the code

Values were lifted from `src/index.css` and the real component source — the
stack card is `AttentionFeed.tsx:243–300` at its real dimensions, the thread
pane is `Thread.tsx` in `pane` mode. Eight findings from that reading became
rows 24–31 in [`../DRIFT.md`](../DRIFT.md); the ones the design depends on:

- **`kind: "question"` has never been posted.** `Thread.tsx` hardcodes
  `kind: "comment"` at both post sites, so a Full-timer has never been able to
  ask a question on a contact.
- **The Trainee feed branch has never run.** `attention.ts:92` gates on
  `role === "trainee"`; a Trainee is `manager`. It is deleted rather than
  revived — as written it would have handed every Trainee every Full-timer
  message about students they have never met.
- **Real push is wired to chat and nothing else.** `sendPushNotification`
  (Expo) is called from `services/chat.ts` and a Settings test button;
  `showWebPushNotification` fires only from a mounted `NotificationCenter`.
- **`contact.reviewed` has four readers and no writer.** Per-person state
  moves to `inboxState/{uid}`, under a rule already shaped for
  `userPreferences/{uid}`.
- **`contact.owner` is a tie everywhere except the notify path.**
  `permissions.ts:248` and `attention.ts:360` read it; `ThreadStakeholders`
  does not. Mobile's `postThreadMessage` passes no `stakeholders` at all.
- **`personalContactIds` cannot be read at write time** — it is indexed by
  person, not contact. That tie is resolved on the reader's own feed.
- **Closing needs `closedBy` / `closedAt` plus the matching allowance in
  `firestore.rules`** for `contacts/{id}/threads`, or every close is rejected
  while the button looks like it worked — the trap #727 hit with the `team` field.
- **`AttentionFeed` and `LandingTrainee` strings are hardcoded English.**
  Everything new goes through `en.json` and `es.json` or `npm run check:i18n`
  fails.

## Why the published page is not checked in

Publishing wraps these sources in a ~2.6 MB editor payload. That artifact is
generated, not authored: it would dominate the repository, defeat diffing, and go
stale against these files. The sources here are the record; the canvas is a view
of them.
