# Streams & threads — one grammar for every written stream

Source artboards for the rework of every place people write to each other:
a contact's **Conversation** and **Full-timers**, an Interaction's Thread, the
Around card strip, DMs, groups, announcements, and Feedback **Follow-ups**.

Published canvas: https://claude.ai/artifact/QZmbvvtW6xpU21LWN4cADf

Decision record: [`../../adr/0033-one-written-stream-grammar.md`](../../adr/0033-one-written-stream-grammar.md).
Terms: **Thread (replies to one message)** in [`CONTEXT.md`](../../../CONTEXT.md).
Announcement drifts fixed separately, ahead of this: [#1243](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1243).

## The artboards

The canvas has three pages.

**Full set — web** (direction A, kind tag beside the name)

| File | What it covers |
| --- | --- |
| `Main.dc.html` | Conversation in the 460px drawer at the reported 1107×662 laptop. Grouping, @mention, a replies chip with the hover toolbar, an open Follow-up ask, a question. |
| `FT-Drawer.dc.html` | Full-timers — lock and "Trainees can't" in the header, no kind chips, the new placeholder. |
| `Drawer-Thread.dc.html` | A Thread replacing the drawer, with back. |
| `Interaction-Thread.dc.html` | An Interaction's Thread: the story entry carries the chip; the drawer quotes the interaction as the parent. |
| `Around.dc.html` | `/around` at 1440 with one card open, reading in place. |
| `Around-Thread.dc.html` | A Thread replacing the strip inside the card. |
| `A-Messages.dc.html` | An announcement channel as a Trainee sees it, Thread beside. |
| `Announce-FT.dc.html` | The same channel as its poster sees it: receipts, the audience line, the composer. |
| `Chat.dc.html` | A group chat: left-aligned, contact card, @mention open, staged composer. |
| `Composer.dc.html` | Six composer states. |
| `Followups.dc.html` | Your notes with Follow-ups as rows. |

**Full set — phone** (390×844)

| File | What it covers |
| --- | --- |
| `M-Person.dc.html` | Person screen, Conversation tab (was "Alongside") with the Full-timers switch. |
| `M-Person-FT.dc.html` | The same, Full-timers selected. |
| `M-Thread.dc.html` | A Thread as a pushed screen. |
| `M-Story.dc.html` | Story entries with a replies chip / "Think it through together". |
| `M-LongPress.dc.html` | Long-press sheet — the hover toolbar on a phone. |
| `M-DM.dc.html` | A DM, left-aligned. |
| `M-Announce.dc.html` | An announcement as a member sees it: Got it and Reply in thread. |

**Directions compared** — the fork that was picked from: `B-Contact`, `B-Messages`
(Ink post cards), `C-Contact`, `C-Messages` (rows, cards only for things with
state), and `Kinds.dc.html` (tag / gutter rule / status line only). Kept as the
record of what was rejected; see ADR 0033 for why.

## Acceptance checklist

Each build PR ticks the lines it delivers, or records the deviation in
[`../DRIFT.md`](../DRIFT.md) with which side was right. A line is not ticked by
"close enough" — the announcements build drifted in eight places because nothing
held it to its canvas (#1243).

### Grammar — every stream, web and phone

- [ ] **G1** No bubble. A message is a row: 36px avatar (28px inside an Around card), name and time on one line, the body beneath.
- [ ] **G2** A message from the same author within 5 minutes of their last continues without avatar or name.
- [ ] **G3** Everything left-aligned, your own messages included; your own name shows, not "You".
- [ ] **G4** Oldest at top, composer pinned at the foot; the stream opens on the newest message.
- [ ] **G5** Day dividers: Today, Yesterday, then weekday and date.
- [ ] **G6** A "New" line above the first unread, where read state exists (chat, announcements).
- [ ] **G7** Hover lights the row and shows a toolbar — Reply in thread, Make a to-do, More. On a phone, long-press opens a sheet with those plus Copy text, and Delete for the author or a Full-timer.
- [ ] **G8** No reactions anywhere (#1107 stands).

### Threads

- [ ] **T1** Replies are one level deep. A parent with replies carries a chip: up to three replier avatars, "N replies", "Last reply …". The chip of the Thread that is open is marked.
- [ ] **T2** A Thread opens *beside* the stream where there is width (Messages at 1440, a 340px pane) and *replaces* it, with a back arrow, where there isn't — the contact drawer, an Around card, the phone (a pushed screen).
- [ ] **T3** The Thread header says where it lives: "Thread · in Conversation · Daniel Reyes".
- [ ] **T4** An Interaction's Thread hangs off its log / Story entry — a replies chip, or "Think it through together" when there are none — and quotes the interaction as its parent. It no longer appears in the Conversation stream (the phone merged them).

### Kinds

- [ ] **K1** A Question or a Follow-up ask shows a tag beside the author's name: Question in blue, Follow-up ask in amber.
- [ ] **K2** An open ask shows "Open N days" under the body with **I followed up** (anyone tied) and **Never mind** (the asker only).
- [ ] **K3** A closed ask reads "✓ {name} followed up · {when}"; a withdrawn one mutes its tag and reads "{asker} withdrew this".
- [ ] **K4** An ask can be closed in the stream, on an Around card, and on the phone — not only from My Day.

### Composer

- [ ] **C1** One box everywhere: the text, then a tools row — attach where the source supports it, @, the shortcut hint, send.
- [ ] **C2** Kind chips (Comment · Question · Ask a follow-up) sit inside the box on a Conversation only. A selected ask chip takes the amber; each kind keeps its placeholder.
- [ ] **C3** An audience line above the box on every contact stream — "Everyone tied to Daniel sees this." / a lock and "Only Full-timers see this." — and above an announcement composer, naming the real audience.
- [ ] **C4** @mention candidates are unchanged from ADR 0007: any teammate on a Conversation, Full-timers only on Full-timers, the members of a chat.
- [ ] **C5** Chat stages files and contact cards above the text, each removable before sending.

### Surfaces

- [ ] **S1** Contact drawer headers: "Conversation" + its audience; "Full-timers" + lock + "Only Full-timers see this — Trainees can't."
- [ ] **S2** Copy: the Full-timers placeholder becomes "Write something only Full-timers will see…" (en + es).
- [ ] **S3** Around: ADR 0022 unchanged — one card open, reading in place, the Conversation / Full-timers segment, the composer posting into the open one, the just-posted message landing above the composer, marked "Just posted".
- [ ] **S4** Announcements: a member sees Got it / You said got it and Reply in thread; the poster sees "Read by X of Y · N said got it" as one link to the receipts; the pinned post stays first under "Pinned by {name} · stays at the top until {they} unpin it"; the footer "Only Full-timers post here. Anyone can reply in a thread." is set in regular, not italic, text.
- [ ] **S5** Chat headers: a group says "Group · N people"; an announcement says "Announcement · N people · {names} post here".
- [ ] **S6** Your notes: Follow-ups are rows; the team posts as "The team"; your own can be edited and then say "Edited"; the public-tracker line stays under the composer.
- [ ] **S7** Phone person screen: "Alongside" becomes **Conversation**; a Full-timer gets a Conversation / Full-timers switch at its top; a Trainee never sees the switch.
- [ ] **S8** Phone announcements: a member can say Got it and reply in a thread.

## What the drawings assume about the code

- **`Thread.tsx` never renders `kind`** (`ThrRow` shows the body only), so today a Follow-up ask looks like a comment and closes only from a My Day card. K1–K4 are new behaviour, not restyling.
- **The phone merges every contact stream into one list.** `ContactScreen.tsx` builds "Alongside" from `mergedContactThread(feedVisibleThreads(...))`, which for a Full-timer includes `scope: "team"` messages, unmarked. S7 and T4 undo that.
- **`MsgThreadPane` re-implements the bubble renderer** (`renderBody`, `canRemoveForEveryone`, `messageGoneLabel` copied from `Messages.tsx`). The shared row replaces both.
- **Four sources, one UI.** `contacts/{id}/threads`, `contacts/{id}/teamThreads`, `chatRooms/{id}/messages` and `feedback/{id}/replies` keep their paths and rules; each gets an adapter. Contact-thread rules sit near the expression ceiling — nothing here needs a rules change.
- **Web and React Native share no components, and the web app takes no `@cisa/core` dependency.** Grouping (G2), dividers (G5, G6), ask state (K2, K3) and the row model are one pure stream model in `packages/core`, mirrored in `src/lib` and held in step by a mirror-parity test — test-first.
- Values are Ink, lifted from `src/index.css`: Lexend over Plus Jakarta Sans, `#F4F4F5` surfaces, `#F0F0F2` hairlines, the ADR 0009 radius ladder, the 460px `.cd-drawer`, `.page.msgs`'s 328px rail column. Sample people; no real record is depicted.

## Shipping order

1. #1243 — announcement behaviour, no layout.
2. `packages/core` — the stream model: grouping, dividers, ask state, row model.
3. Web contact surfaces — Conversation, Full-timers, Interaction Threads, the Around strip (one component today).
4. Web Messages — DMs, groups, announcements — and Your notes.
5. Phone — the person screen, then chat and announcements.

## Why the published page is not checked in

Publishing wraps these sources in an editor payload of a few megabytes. It is
generated, not authored: it would dominate the repository, defeat diffing, and go
stale against these files. The sources here are the record; the canvas is a view
of them.
