---
target: /messages and /messages/:roomId (src/views/Messages.tsx → src/components/stream/Stream.tsx at 375x812)
total_score: 19
max_score: 40
na_heuristics:
p0_count: 2
p1_count: 8
target_identity: "file:/Users/twang/cisa-campus-work-tracker/.worktrees/issue-1764/src/views/Messages.tsx"
timestamp: 2026-10-23T23-29-23Z
slug: src-views-messages-at-375x812
---
⚠️ DEGRADED: single-context (no sub-agent tool exposed in this session; one assessor read the source and then measured the live render). Numbers below are measured on the seeded emulator at 375×812, not on a mock.

# Critique: Messages — the list and the conversation at 375×812

Target: `/messages` and `/messages/:roomId`, signed in as `trainee.e2e@example.com` (Zion Adeyemi) at 375×812, on the seeded emulator through the dev server (`VITE_E2E_MODE=true`). Extra fixture rooms (a group, a direct chat with a long message, an announcement with two posts, a to-do attachment) were seeded into the emulator for the pass and removed afterwards.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | An unread room was a **7px dot** and the words "New · from Full-timer" — drawn at **1.15:1**, i.e. invisible. No unread count anywhere. A message arriving while the reader was scrolled up into history moved them **975px** to the bottom with no explanation and no cue. Nothing said a send was in flight. |
| 2 | Match System / Real World | 3 | The chat grammar is right: day dividers, a Thread chip with faces, a pinned strip, "Got it" on an announcement, last-message previews with the sender's first name. The phone also rendered a desktop instruction — *"Pick a conversation"* — underneath the list, which belongs to nobody on a phone. |
| 3 | User Control and Freedom | 1 | The phone's Back gesture closed the room but **left the URL at the room** and consumed the history entry, so a second Back did nothing and a refresh re-opened it. Message actions (reply in thread, make a to-do, delete) were reachable only by hover. There was no way to clear a search except deleting the text by hand. |
| 4 | Consistency and Standards | 1 | The 64px bottom bar sits at `z-50` **over the composer**, and an element-from-point probe on the send button returned the bar's "People" link: the primary action of the screen could not be tapped. Timestamps, previews of read rooms, section heads and the thread subtitle resolved to `--outline` — the hairline **border** colour (1.15–1.27:1, failing AA by a mile). The selected filter was a 10% ink wash, against DESIGN.md's Inversion Rule. The "full-screen thread" CSS targeted `.bottom-nav`, `.msgs-composer` and `.msgs-send`, none of which exist any more. |
| 5 | Error Prevention | 1 | The single most likely gesture on this screen — tapping Send — navigated to People instead. A 24×18 hover-only ⋯ (opacity 0 on touch) held the destructive conversation menu. |
| 6 | Recognition Rather Than Recall | 2 | Faces, names, previews, times, day dividers and the unread weight all help. But the preview of any **read** room, and every timestamp, was rendered in a colour indistinguishable from the surface, so the list read as names floating over blanks. |
| 7 | Flexibility and Efficiency | 2 | "Search messages…" only matches room **names**. No way to jump to unread, no swipe, and on touch not one per-message action. The composer still says "⌘↵ to send" on a screen without a keyboard. |
| 8 | Aesthetic and Minimalist Design | 3 | Calm Field Notebook surface — soft slate rows, a serif room title, stage-free monochrome. But 110px of header (13.5% of the height) held a title wrapped to **three lines** and a subtitle cut to "Group · 4 p…", and the phantom second pane left half the list screen empty. |
| 9 | Error Recovery | 1 | A denied or failed conversations query was swallowed into `console.error`; the screen said **"Nothing here yet."** — the same sentence it used for an empty filter, an empty search and a failed load. No retry. |
| 10 | Help and Documentation | 2 | The composer names who will see the message, and an announcement carries a one-line "Only Full-timers post here…" note — but that note sat **entirely behind the bottom bar** (64 of its 68 pixels), so the only explanation on the screen was unreadable. |
| **Total** | | **19/40** | **Poor at the edges, good in the middle (47.5%)** |

## Design Specificity Verdict

**LLM assessment.** This is not a generic messaging clone. It is a ministry's inbox: conversations carry a person's name and a preview of the last thing said, announcements are a distinct section with a bell and *who posts here*, a Full-timer sees read receipts, and every message can be turned into a to-do or quoted into someone's story. The thread grammar (ADR 0033) — Slack-literal rows, day dividers, a Thread chip rather than a modal — is a decision, not a default.

Where it drifts is where the phone passes have drifted before: **the rules were written for a 1040px two-pane screen, and the phone was branched off with utility classes that lost the cascade.** `hidden md:flex` on the thread never applied because the base `.msgs-thread { display: flex }` is unlayered and Tailwind's `hidden` is not — so the desktop placeholder rendered *under* the rail, adding a second scroll region and 64px of phantom page height. The same drift renamed `.bottom-nav`/`.msgs-composer`/`.msgs-send` out from under three "full-screen chat" rules, which is precisely why the bottom bar sat on top of the composer and stole the Send tap.

**Deterministic scan.** `impeccable detect --json src/views/Messages.tsx` → 3 advisory findings, all `design-system-font-size` (10px, off the DESIGN.md ramp) inside the Full-timer read-receipts modal — a real but cosmetic drift this pass left alone. The detector cannot see a tap that lands on the wrong element, a text colour equal to a border, or a rule whose selector no longer exists. Every finding below is from the live DOM.

**Visual overlays.** One live render at 375×812 (device scale 1), light and Spanish, plus one desktop render at 1440×900 to check for regressions. Dark mode was **computed from the tokens, not observed** — the local theme key did not apply (`html.light` persisted), so the dark numbers are marked unverified.

## Overall Impression

The conversation view is the better half: the rows, the day dividers and the composer are a calm place to read and write, and three of the four P0/P1 failures there were one-line selector drifts, not design mistakes. The list is where the screen was broken: half of its information was painted in the border colour, and the other half — the send button, the conversation menu, the read-only note — was underneath something.

This pass fixed both P0s, all eight P1s and the cheap P2s. On the same seed the Trainee can now send with the on-screen button, cannot fall into the desktop placeholder, reads every timestamp and preview, keeps their place when a message lands below, and gets the list back with the phone's own Back.

## What's Working

1. **The written-stream grammar.** Names, times, day dividers and a Thread chip instead of a modal: a Trainee can read a room the way they read a page, and a reply stays attached to the sentence that caused it.
2. **Announcements are their own section, not a pinned chat.** The bell, the audience line and "Got it" make a broadcast read as a broadcast.
3. **The list is a relationship, not a log.** Each row is a face, a name, the last thing said and when — the four facts a campus worker needs before opening anything.
4. **The composer states its audience**, and the announcement's read-only note says who may post. When it is visible it is the most useful sentence on the screen.

## Priority Issues

### [P0] The Send button could not be tapped on a phone
- **What**: the fixed bottom navigation (`nav[aria-label="Mobile Navigation"]`, 64px, `z-50`) covered `.strm-composer` from y=748 to y=812 at 375×812. The send control measured `x287 y749 44×44`; `document.elementFromPoint` at its centre returned the bar's **People** link. The announcement's read-only note (`y744 h68`) was 64 of 68 pixels under the same bar.
- **Why it matters**: the one action the screen exists for either did nothing useful (navigated away from the conversation) or was invisible. `body.msgs-fullscreen .bottom-nav { display:none }` was written to prevent exactly this, but the bar's class is `app-mobile-nav` — the rule had been dead since the bar was rewritten (#1775).
- **Fix**: the bar carries `app-mobile-nav` and the full-screen rule names it; `.msgs-composer`/`.msgs-send` in that block were renamed to the live `.strm-composer`/`.strm-send`. Verified: the nav reports `display:none`, send is 44×44 at `y749`, and the probe at its centre now returns the send button.

### [P0] The phone list rendered the desktop placeholder as a second pane
- **What**: with no room open, `.msgs-thread` still computed `display:flex` (`hidden md:flex` loses to the unlayered `.msgs-thread { display:flex }`), so "Pick a conversation" sat under the last two rows of the list. Document height was 876 on an 812 viewport, the rail was squeezed to 465px with its own inner scroll, and a **second** scroll region appeared below it. Measured: `rail y57 h465`, `thread y522 h228`.
- **Why it matters**: half the screen was a desktop instruction, the list scrolled inside a 265px window while the page scrolled behind it, and the flash of a second pane made list→conversation feel like a layout accident rather than a chat app.
- **Fix**: below 768px (the same breakpoint the view uses for `isMobile`) the pane that is not showing is `display:none`, chosen by the `msgs-fullscreen` body class the view already sets. Verified: thread `display:none` with the list open, rail `display:none` with a room open, document height exactly 812.

### [P1] Timestamps, previews and section heads were painted in the border colour
- **What**: `.page.msgs` mapped `--text-mute: var(--outline)`, and `--outline` resolves to the hairline border (`#E4E4E7`). Measured on the live page: room time **1.15:1**, announcement meta "New · from Full-timer" **1.15:1**, section head "ANNOUNCEMENTS" **1.15:1**, thread subtitle "Announcement · 5 people" **1.27:1**, preview of any read room **1.15:1**. WCAG AA needs 4.5:1 for text this size.
- **Why it matters**: the list's whole scan pattern — when, who, what — was unreadable in campus light, and the subtitle under the room title was cut to nothing.
- **Fix**: the muted token is the dim reading ink (`--on-surface-variant`). Measured after: 7.03:1 in light; dark is computed at ≈8.4:1 (unverified, see below).

### [P1] A new message yanked the reader out of history
- **What**: the stream scrolled to `scrollHeight` on every change in message count. Scrolled to `scrollTop=150` in the morning's thread, a live message moved the reader to **1124.5** — a 975px jump — with no "new messages" cue.
- **Why it matters**: reading back through a room is the normal way to catch up; being thrown to the bottom every time someone types is the single most-complained-about chat defect.
- **Fix**: the stream follows the newest message only while the reader is within 120px of it (or when the newest is their own). Otherwise it stays put and offers a **New messages** pill that jumps down. Verified: the same gesture leaves `scrollTop` at 150, the pill appears, and tapping it lands exactly at the bottom.

### [P1] The phone's Back left the URL on the room
- **What**: opening a room pushed a hand-made `history` entry (`chat-room-<id>`) beside the router's own. Popping it set `activeRoomId` to null but did not navigate, so the list rendered at `/messages/e2e-group-huddle`; a second Back did nothing (the entry was consumed) and a reload re-opened the room. Both panes then rendered at once (the P0 above).
- **Why it matters**: the gesture every phone user makes to leave a chat was a trap, and the address bar disagreed with the screen.
- **Fix**: the fake history entry is gone; the room is a real route (`/messages/:roomId`) that the list navigates to, so the platform's own Back returns to `/messages`. Verified: Back → `/messages`, list shown, bottom bar back, body class cleared.

### [P1] Message actions existed only for a mouse
- **What**: the per-message toolbar (reply in thread, make a to-do, quote, edit, delete) was `display:none` until `:hover`. `display:none` is also unfocusable, so a keyboard could not reach those buttons either — only a pointer could.
- **Why it matters**: on the device this screen is used on, replying in a thread, turning a message into a to-do and deleting your own message were all unreachable.
- **Fix**: the toolbar keeps its place in the tree (`opacity:0; pointer-events:none`) and appears on hover, on keyboard focus, or on a **tap of the message**; a tap on one of its own buttons does not count as that tap. Verified: tapping a row sets the revealed state and the toolbar paints; a tap on "Make a to-do" does not reveal.

### [P1] The room title was squeezed to three lines
- **What**: back + avatar + three 34px action icons in a 360px row left ~106px for the name: "Tuesday / Team / Huddle" over **33px of line box**, an 88–110px header, and a subtitle truncated to "Announcement · 5 peo…". 110px is 13.5% of the screen before the first message.
- **Why it matters**: the room you are in is the one thing the header must say, and it was the least legible thing in it.
- **Fix**: on phones the decorative room avatar is dropped and the action buttons grow to 44px; the title is 17px clamped to two lines. Verified: header 62px, "Tuesday Team Huddle" on one line, "Group · 4 people" intact.

### [P1] The rail was English in Spanish
- **What**: with `cisa_language=es` the live page read **"Messages / New / Search messages… / All / Unread / Groups / Announcements"** and the thread header's titles ("Search in conversation", "Group details") stayed English, though the stream itself was translated ("Anuncio · 5 personas · Full-timer publica aquí"). The conversation menu and both hidden-item notes were English too.
- **Why it matters**: bilingual access is a product commitment; a Spanish reader got a half-Spanish screen, and screen-reader users got English control names inside a Spanish page.
- **Fix**: every string on the rail, the header, the menu and the empty states resolves through `t()` — 28 new `chat.*` keys and `common.conversations` in both locales. Verified live: *Mensajes / Nuevo / Buscar mensajes… / Todos · Sin leer · Grupos · Anuncios / ANUNCIOS / CONVERSACIONES / Leído · de Full-timer*.

### [P1] A failed conversations query said "Nothing here yet."
- **What**: the `onSnapshot` error handler only `console.error`'d. The list then fell through to the same empty state used for an empty filter: "Nothing here yet.".
- **Why it matters**: a permissions failure, an offline device and an empty inbox were indistinguishable, and none of them offered a way out.
- **Fix**: a `role="alert"` line — "Couldn't load your conversations." — with a **Try again** button that re-subscribes. Verified in the unit test (first subscription rejects, retry subscribes again).

### [P2] Two empty messages and no unread count
- **What**: an empty search said "Nothing here yet." with no way to clear it; an empty Unread filter said the same thing; and unread was a 7px dot with no count.
- **Why it matters**: a search with no result and an inbox with nothing new are different states, and "how many?" is the first question a badge answers.
- **Fix**: the search says *Nothing matches “zzz”.* with a **Clear search** action, the Unread filter says *You're all caught up.*, and unread rows now carry ink previews, ink timestamps, a bolder name and an `aria-label` that says "unread". Counts are filed as **#1791** — they need a per-room read the list does not make today.

### [P2] Targets under the thumb floor
- **What**: filter pills 31px, "New" 32px, header icons 34×34, per-message tools 30×30, "Got it"/"Reply in thread" 32px, send 36×36, and the conversation ⋯ was 24×18 at `opacity:0` (hover-only, so invisible on touch).
- **Why it matters**: one-handed use while walking is this screen's real context, and the ⋯ gate held the only way to hide or delete a conversation.
- **Fix**: 44px for header icons and the send control on phones, 40px for the rail's controls and the message pills, and the ⋯ is visible and 44px on a coarse pointer.

### [P2] The selected filter was a 10% wash
- **What**: `.msgs-pill.on` used `--accent-soft` (10% ink) with ink text — legible, but exactly the "faint 6% tint" DESIGN.md's Inversion Rule forbids.
- **Why it matters**: the selected tab is orientation, and in this system orientation is expressed by inversion.
- **Fix**: selected pills invert (solid ink, paper text). Measured: `#0A0A0B` on `#FFFFFF` ≈ 19.8:1, still inverted in dark.

### [P3] The composer still advertises ⌘↵ on a phone
- **What**: the send hint is a keyboard shortcut. It was the widest thing in the composer's tool row on a screen with no keyboard.
- **Fix**: hidden below 720px.

### [P3] The notification prompt covers the composer
- **What**: the one-time `NotificationPermissionBanner` is `fixed bottom-4 … z-50` and its Enable button landed exactly on Send (it is what the first element-from-point probe hit).
- **Fix**: none in this pass — it is global chrome shown once per device. Worth a global rule that bottom-anchored prompts clear an open composer.

## Persona Red Flags

- **Alex (Trainee / field worker)**:
  - *Cannot send*: walking between two meetings, Alex types a reply, taps Send, and finds themselves on the People page (fixed).
  - *Cannot read the list*: every time and preview is a ghost; Alex opens rooms just to find out what they said (fixed).
  - *Yanked out of history*: reading this morning's thread, a message arrives and the page jumps 975px (fixed: stays put, offers the pill).
  - *Back trap*: Back shows the list but the URL says the room; a second Back does nothing (fixed).
- **Jordan (Student / new to the app)**:
  - *Half a screen of nothing*: the list ends in "Pick a conversation" — a panel that offers no action from the list itself.
  - *No unread count*: a dot says "something", not "two".
- **Sam (Keyboard / screen-reader user)**:
  - *Unreachable actions*: `display:none` message toolbars could not be tabbed to; conversation rows were `div`s with `onClick` and no role or focus (fixed: rows are buttons with Enter/Space, toolbars keep their place in the tree).
  - *Unnamed back*: the phone header's back control had no accessible name at all (fixed: "Back to conversations").
  - *Unread unannounced*: the dot was decorative with no text equivalent (fixed: the row's name says ", unread").

## Minor Observations

- The composer grows with `field-sizing: content` and is capped at 160px — the draft is readable, but the list above shrinks without an anchor, so a long draft lifts every message out of view.
- The rail's four filter pills wrap to a second line at 328px on desktop ("Announcements" alone on its own row).
- Search matches room names only; a trainee looking for a phrase has to open rooms one at a time.
- The announcement's "Got it" / "Reply in thread" row is 32px tall and the floating feedback button overlaps its right edge (global; **#1785**).
- The room subtitle still ellipsizes the poster line on an announcement ("Announcement · 5 people · Full-timer …"); the stream's own header says it again, so nothing is lost.
- `msgs-item-preview` truncates at one line — long subjects lose their distinguishing half, which is right for a chat and wrong for a search result list.

## Questions to Consider

- **Should the list carry an unread count?** A dot answers "something" and a count answers "how many"; the list does not query messages today, so a count is a data decision (one aggregate read per room, or a denormalised counter on the room) rather than a CSS one. Filed as a follow-up.
- **Does the composer survive the soft keyboard on Android?** `interactive-widget=resizes-visual` means the layout viewport does not shrink, so the composer likely sits under the keyboard; the popup system already measures `visualViewport` for its sheets (`PopupFrame`), and the messages page does not. Unverified — no device in this environment — and filed as **#1790**; it should be fixed with that precedent rather than by changing the global meta tag.
- **Should a tap on a message reveal actions, or a long-press?** Tap-reveal is what this pass shipped because it is text-free and works with a screen reader; long-press is the platform convention. If the list ever gets inline reply gestures, tap will collide with them.
- **Is the thread's search worth its 44px icon** when the room's name search is right behind the back chevron? Two searches with different scopes in one screen is a real recall cost.

## What this pass changed (same PR)

- The bottom bar yields to an open conversation; the composer and send control are reachable and 44px.
- One pane at a time on the phone, chosen by the route; no desktop placeholder, no phantom page height, no second scroll region.
- Muted text clears AA (7.03:1 light) — times, previews, section heads, thread subtitle.
- The stream keeps a reader's place and offers **New messages**.
- The room is a real route; the phone's Back returns to the list with the URL agreeing.
- Message actions appear on tap as well as hover, and stay reachable by keyboard.
- A 62px phone header with a two-line title at most; 44px header controls.
- The rail, header, conversation menu and hidden-item notes are in English *and* Spanish.
- Empty search and empty Unread states say what happened; a failed load says so and retries.
- Unread rows read as unread (weight, ink, a labelled dot); selected filters invert.
- Two follow-ups filed: **#1790** (composer above the soft keyboard) and **#1791** (unread counts).

**Unverified**: the soft keyboard (no device; `interactive-widget` is `resizes-visual`); dark-mode appearance (local theme switch did not apply — computed from tokens: muted ≈8.4:1, inverted pill ≈17:1); the coarse-pointer rule in this pass (headless Chrome reports `pointer: fine`, so 40/44px targets and the revealed toolbar were measured with the media query inactive); iOS VoiceOver's reading order over the new row buttons; and whether the real Android back gesture pops the route the same way the headless Back does.
