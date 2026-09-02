# Announcements rework — design canvas sources

Source artboards for [issue #725](https://github.com/Shir0o/cisa-campus-work-tracker/issues/725):
"a rework ui ux on how annoucement works", from the feedback form on `/messages`.

Published canvas: https://claude.ai/code/artifact/2104e43c-bd73-4be5-8ca8-70a2d77766b6

## The artboards

| File | What it covers |
| --- | --- |
| `Main.dc.html` | Reading an announcement — the Messages page at 1440 on the rail shell, as a member sees it. The conversation list gains sections; the stream renders posts instead of bubbles; the read-only bar becomes a footer. |
| `Compose.dc.html` | Sending one — audience presets instead of ticking 24 people, a three-step compose, and the notification that stops saying "New message". |
| `Post.dc.html` | The post at 1:1 in a real 784px pane, beside the bubble it replaces, then its five states and the poster's read-receipt view. |
| `Footer.dc.html` | The bar at the bottom: three defects in the shipped one, the proposed replacement and its states, and three options for where a reply should go. |
| `Mobile.dc.html` | The same read view and footer at 390&#215;844, at the 44px tap floor. |
| `canvas.json` | Layout — artboard positions, sticky notes, launch view. |

## The one decision behind the drawings

**An announcement is a broadcast wearing a chat's clothes.** It is created from
the second tab of New message, it sits in the conversation list beside DMs
distinguished only by a bell, it renders through `.msgb` as a 62%-wide chat
bubble, and `sendMessage` pushes it to every recipient titled "New message".
Every change on these sheets follows from separating the two.

Scope — both ends, sending and receiving — was settled with the reporter before
drawing, since the issue is one line.

## What the drawings assume about the code

Values were lifted from `src/index.css` and the real component source rather than
invented: the bubble is `.msgb`/`.msgb-bubble` verbatim, the read-only bar is
`.msgs-readonly`, the modal frame is `CreateChatModal`'s 448&#215;560 at 24px
radius, and the 784px pane is `.page.msgs`'s 328px grid column and six 16px
gutters at a 1440 window. Four things the drawings depend on:

- **Two of the three audience presets need no new data.** "The whole app" is
  every approved user, which `CreateChatModal` already queries. The per-team
  presets need the `team` field that `news-filters` proposes for
  [#727](https://github.com/Shir0o/cisa-campus-work-tracker/issues/727) and which
  is **not built** — `AppUser` carries `uid, email, displayName, photoURL,
  approved, role` and nothing else.
- **A preset stored as a rule breaks an assumption in `firestore.rules`,** which
  gates announcement reads on the room's `memberIds`. The rule has to resolve to
  a member list somewhere; that is the part to design before building.
- **Read receipts cost a write per member per post,** plus a rules path a member
  can write on a room they otherwise cannot. `Post.dc.html` records the fallback:
  the acknowledgement count alone, which is a member action and needs no passive
  tracking.
- **New copy has to go through `src/locales/en.json` and `es.json`** or
  `npm run check:i18n` fails. The strings this replaces are under `modals.*`.

## The finding worth acting on regardless

`.msgs-readonly` tells every member "replies go to the team directly". No such
route exists: the same `canPostToActiveRoom` flag that hides the composer is
passed to `MsgThreadPane` as `canPost`, so the thread reply box is closed too.
Its four quick-reactions also fire at `messages[messages.length - 1]` rather than
the post being read. `Footer.dc.html` draws three ways to settle the first —
reply to the poster, reply to a staff group, or open threads — with the cost of
each. That decision is open; the reaction target is simply a bug.

Not recorded in [`../DRIFT.md`](../DRIFT.md) yet: the register is for drift that
has been settled, and this one has an open question in it.

## Why the published page is not checked in

Publishing wraps these sources in a ~2 MB editor payload. That artifact is
generated, not authored: it would dominate the repository, defeat diffing, and go
stale against these files. The sources here are the record; the canvas is a view
of them.
