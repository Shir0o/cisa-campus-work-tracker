# 0033: Every written stream shares one grammar — Slack-literal rows and a Thread pane

## Status
Accepted

## Context

The product has grown seven places where people write to each other, drawn four different ways:

- a contact's **Conversation** and **Full-timers** streams, an Interaction's "think this through together", and the Around card strip all render through `Thread.tsx` — chat bubbles, mine on the right, replies nested inline behind a toggle;
- DMs and groups render through `.msgb` bubbles in `Messages.tsx`, with Slack-shaped reply threads in `MsgThreadPane` (which re-implements the bubble renderer);
- announcements render as `.post` cards (#743), built from a canvas (`docs/design/announcements/`) the build drifted from in eight places (#1243);
- Feedback **Follow-ups** have their own renderer in `MyNotes.tsx`;
- the mobile app has a separate copy of each, and on the person screen merges every stream into one "Alongside" list.

`Thread.tsx` never renders a message's kind, so a **Follow-up ask** is indistinguishable from a comment and can only be closed from a My Day card.

The glossary had held that a contact's staff stream is "not chat". Three densities were drawn side by side at real sizes (the 460px contact drawer at 1107×662; an announcement channel with its Thread open at 1440) and compared on the canvas at `docs/design/threads/`.

## Decision

1. **One grammar for every written stream**, web and mobile: Conversation, Full-timers, Interaction threads, the Around strip, DMs, groups, announcements, and the rows of Feedback Follow-ups. Questions for the team stays a card board (#646 moved it off the chat grammar on purpose).
2. **Slack-literal rows** (direction A). No container around a message: 36px avatar, name and time on one line, the body beneath; consecutive messages from one author drop the avatar; everything is left-aligned, including your own. A row lights on hover and grows a toolbar (long-press on mobile). Oldest at top, composer pinned at the foot, the stream opens on the newest message, day dividers, a "New" line at the first unread. Cards (direction B) and cards-only-for-things-with-state (C) were rejected: B spends the narrow drawer on frames — about three messages where A shows five — and C's two grammars in one stream were a rule people would have to learn.
3. **The kind is a tag beside the name**, with state in a line under the body (treatment 1). An open Follow-up ask says how long it has been open and carries **I followed up** / **Never mind** in the stream itself. A gutter rule and a status-line-only treatment were rejected.
4. **A Thread is replies to one message, one level deep**, read in a pane *beside* the stream when there is width and *replacing* it, with a back arrow, when there is not — the contact drawer, an Around card, a phone. No "also send to channel".
5. **Grammar, not navigation.** Every surface keeps its home; no contact appears as a channel in Messages. ADR 0015 and 0022 stand.
6. **One UI over per-source adapters.** `contacts/{id}/threads`, `teamThreads`, `chatRooms/…/messages` and `feedback/{id}/replies` keep their paths and rules; no data migration. Web and React Native cannot share components, so the shared part — grouping, dividers, ask state, the row model — is one pure stream model. It lives in `packages/core` for the phone and is mirrored in the web app's own `src/lib`, because the web app deliberately takes no `@cisa/core` dependency; a mirror-parity test corpus is the contract between the two copies, as for `feedVisibleThreads`.
7. **No reactions.** #1107 removed them; explicit state (Got it, I followed up) does what 👀 and ✅ would.

## Consequences

- Dropping mine-on-the-right reverses the mobile member thread ported from the `MbrMessages` design, and the web `.msgb` layout.
- The canvas's README carries an acceptance checklist; each build PR ticks its lines or records the deviation in `docs/design/DRIFT.md`.
