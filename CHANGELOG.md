# Changelog

A distilled history of notable changes to CISA Campus Work Tracker, newest first.
This project is not version-tagged; entries are grouped by month. Format loosely
follows [Keep a Changelog](https://keepachangelog.com/) (Added / Changed / Fixed).

## [Unreleased]

### Added
- **Mobile v2 — The Board · Messages · Settings in the design's language.**
  The last three screens the trainee's ☰ drawer and the full-timer's More list
  reach no longer drop into a Material screen mid-app. **The Board** is the
  pages grouped as they already group, each row a date block · title ·
  "time · place · *who's leading*" · audience pill, opening onto the page
  itself and a foot naming who keeps it — `facilitatorId` has been stored since
  Session 3 and shown nowhere, and a new `useFullTimerNames` finally resolves
  it. **Messages** is the conversations you're part of, newest first, and a
  thread with a group sender chip and "Open {First}'s page →" in a DM.
  **Settings** is one screen again, as the design has it: `/queue-settings`
  folded back in, with the queue blocks shown only to someone who has a queue,
  so a full-timer gets the me block, the care line, *How it looks* and the
  foot. New pure `boardRowLine` / `boardKeeperFoot` / `boardCountNote` /
  `AUDIENCE_TONE_KEY`, `chatRowPreview` / `chatKindNote` / `messagesScreenNote`,
  `settingsCareLine` / `settingsFoot` / `caredForBy`, `onCampusNowLine` and
  `contactIdForEmail` in `@cisa/core` (412 → 430 tests).

  **Following the design strictly costs working capability this time, not just
  surfaces.** Board pages are read-only on the phone: the admin WebView editor,
  pinning and the Trash entry point are gone (the `/coordination/trash` route
  still works, it just isn't linked). Messages loses New conversation, chat
  details, invite, leave and search — **a trainee now has no way to open a
  conversation**, only to reply in one. Settings loses team management
  (approve, invite, change role, remove access), the roles reference and the
  notifications card — **a new signup can now only be approved from the desktop
  site**, which is what the screen's own foot line says. No notification opt-out
  was lost: the card only ever offered "Enable" and "Open Settings", and push
  registration is wired independently of it.

  Two of the design's affordances are **blocked rather than dropped**:
  per-message reactions and the "kept" pin need fields `ChatMessage` doesn't
  carry, and `firestore.rules` makes a sent message immutable, so both would
  need a schema change *and* a rules deploy.
- **Mobile v2 — People · The Journey · Gatherings in the design's language.**
  The three screens the trainee's ☰ drawer and the full-timer's More list reach
  no longer drop into a Material screen mid-app. **People** is a search over two
  groups — *In your care*, longest since you talked first, then *Everyone else*
  with who added them; **The Journey** is the kanban as a horizontal step picker
  with a "Move a step" sheet per person; **Gatherings** is *Who we've missed*
  (with a text you can send), the sessions we've had with each roster expanding
  in place, and *Coming up*. New pure `splitDirectory`, `stageToneKey` and
  `touchWords` in `@cisa/core` (402 → 412 tests), and `V2Screen`/`V2PersonRow`
  grew the back row, action slot and stage dot the design's `M2Screen` /
  `M2PersonRow` carry. Following the design strictly costs some surfaces:
  People's stage-filter pills, The Journey's "Welcome someone new" button, and
  Gatherings' hero figures, type filter and **CSV export** are gone — stage
  filtering is The Journey's job in v2, and export is desktop work.
- **Mobile v2 — the three role shells.** The design project builds mobile as
  three apps, each with its own frame (`MOBILE-V2.md`;
  `views/mobile/{m2,member,ft}.jsx`), and `apps/mobile` had ported all four home
  screens but none of the shells — every role shared one Material six-tab bar.
  Now: the **trainee** has no tab bar at all (the queue fills the screen and a
  new ☰ drawer carries People · The Journey · Gatherings · The Board ·
  Messages · Settings), a **student** gets Today · Prayer · Messages · You, a
  **Community** member What's on · Prayer · Messages · You, and a
  **full-timer** Today · People · Messages · More. Which route each tab sits on
  is a pure `tabsForRole` in `@cisa/core`'s new `shell.ts`, so the bar and the
  screens that need a back row when they aren't a tab read one source. The bar
  itself is the design's `.mbr-tabs`: words rather than invented icons, a small
  active dot, and a terracotta unread badge on Messages. Messages moved into
  the tab group (`app/(tabs)/messages/`, with its own nested stack) so the
  thread opens with the bar still under it; its paths are unchanged, so every
  deep link still lands.
- **Mobile v2 — the full-timer's Prayer log** (the design's `FtPrayerLog`), the
  screen `More` opens and the home's "Carrying" tile now points at. It reads
  the same `ftCarryRows` the "Prayers to carry" widget reads — uncapped here,
  capped there — so the tile's number and the list's length can't disagree.
  `FtCarryRow` gained a `contactId` so a row can open the person's page.

### Changed
- **Mobile — `/queue-settings` folded into `/settings`.** The separate "Your
  queue" screen existed only because the Material `/settings` owned "How it
  looks" and who you are; now that `/settings` is the design's one settings
  screen, the split has no reason left. *Everything today → How today is built*
  and the old trainee-only row both land on `/settings`, and
  `app/queue-settings.tsx` is gone.
- **Mobile v2 — the trainee's queue chrome caught up with the design.** The
  meta row is now ☰ · "Today · N to look after" · "P of N", and the counter
  spans the whole day (what's left plus what's already been looked after)
  instead of only what remains; the floor names who's coming ("Then Ana, Rio,
  Kofi +2" / "Last one today") instead of counting them; the all-clear reads
  "That's everything, {name}."; and "Look back at your week" is a pushed
  screen rather than a list unfolding under the all-clear.
- **Mobile — screens the design's shells don't have lost their entry point.**
  Following the design strictly, the drawer is exactly its six rows and the
  full-timer's More exactly its five, which retires the old generic "More"
  list: Search, Notifications, Looking back, Answered, the Welcome form, Leave
  a note and Notes from the team are no longer linked from anywhere on the
  phone (their routes and deep links still work). Students also lose the People
  and Log tabs — the design gives members no CRM — and the team prayer screen
  is now desktop-only for staff: the full-timer's Prayer log is read-mostly,
  and a trainee meets prayers as queue cards. Logging keeps both its real
  entry points (the queue's ＋ and the full-timer's "Log a moment"), so the Log
  tab went with the list.

- **Default Unresolved Filter for User Feedback** — updated `FeedbackList.tsx` status filter to default to `unresolved` (hiding resolved feedbacks and issues by default), while providing an option to view all or resolved-only items in the status dropdown filter.
- **Enlargeable Feedback Screenshots on Settings Page** — added click-to-enlarge functionality with a full-screen Lightbox overlay modal, zoom cursor styling, hover hint badge, and Esc key/backdrop dismiss support for captured feedback screenshots in `FeedbackList.tsx`.
- **Direct Chat Channel Deduplication** — deduplicated 1-on-1 direct chat channels by recipient UID in `Messages.tsx` sidebar to prevent multiple chat list entries for the same person, and updated `getOrCreateDirectChat` in `src/services/chat.ts` to check and reuse any existing direct chat channel between the user pair.
- **Stored / Generated Short Summary on `/coordination` docs** — retired AI Insights sidebar/actions and replaced with concise 1-2 sentence document summaries (`mdSummary`) generated and stored upon document save, displayed under page titles in sidebar rails (`CoordinationNotes.tsx`, `CoordinationNotesMobile.tsx`).
- **Caret Preservation on Undo in `/coordination` editor** — added `CaretPreserveExtension` ProseMirror state plugin in `CoordinationNotes.tsx` to prevent the caret from jumping to the end of the document (`doc.content.size`) when undoing edits (Cmd+Z) near the active cursor position.
- **Strikethrough formatting on `/coordination` doc editor** — added a Strikethrough button to the document editor toolbar in `CoordinationNotes.tsx`, configured TipTap strike extension integration, enabled HTML paste normalization for strikethrough tags (`<del>`, `<s>`, `<strike>`), and rendered `<del>` elements in read-only document view.
- **Smart NLP date parsing for `/coordination` text to to-do conversion.** Integrated `chrono-node` to automatically detect natural language dates (e.g., "by tomorrow", "next Friday", "Aug 15") when converting selected text on `/coordination` or typing in the `TodoComposer` popup, setting the parsed date as the task's `dueDate`.
- **Full screen mode for `/coordination` board docs** — added a full screen mode toggle option for reading and collaborative editing of coordination pages on `/coordination` (`CoordinationNotes.tsx`). Displays a Full Screen / Exit Full Screen button in the document header toolbar that expands the workspace into a full-screen view with HTML5 Fullscreen API integration and Esc key support.
- **Announcement conversations** — a chat room the whole audience reads and
  only Full-timers post to, the design's "broadcast" (`MOBILE-V2.md`).
  `ChatRoom['type']` gains `'announcement'`; `firestore.rules` gates both
  creating one and posting to one on `isAdmin()`, and stops a member flipping
  the room's kind to get around it. `canPostToRoom` in `@cisa/core` is the
  client-side mirror, so web and mobile both show "replies go to the team
  directly" instead of a composer whose write would be denied. Full-timers
  create one from an admin-only third tab on the existing Create-chat modal
  (web) and sheet (mobile) — a group and an announcement take the same two
  inputs, so they share a form and differ only in which call runs.
- **The schema mobile v2's member app needs** (`prayerRequests`,
  `hospitalityOffers/{uid}`): the shared `@cisa/core` data modules, the
  `firestore.rules` for both, and `hospitality.ts`'s availability vocabulary. A
  prayer request is deliberately NOT a `Prayer` — that entity hangs off a
  `contactId`, and a member is a user account, not a contact — and it is a
  top-level collection rather than a `users/{uid}` subcollection precisely
  because staff must be able to list every open ask in one subscription. A
  hospitality offer's doc id IS the uid, so a household has one standing offer
  that gets updated rather than a pile of stale ones.
- **19 new emulator-backed cases in `src/test/firestore.rules.test.ts`**
  (65 → 84) covering all three: a member writing their own request/offer, a
  member denied someone else's, staff reading, only staff listing the open
  homes, and a non-admin denied both creating an announcement room and posting
  into one.
- **Mobile v2 — the member app (Student · Community), the last role shape.**
  Ported the design project's `M2Member` (`MOBILE-V2.md`, "the MEMBER app"):
  a calm single scroll, not a dashboard and not the trainee's queue, because
  members browse. Students and Community members now land on
  `src/components/member/MemberHomeScreen.tsx` instead of the Material
  `LandingStudent` / `LandingCommunity`, and their Prayer, Messages and "You"
  screens are v2 too. Shape: date + greeting + one honest line → **the next
  thing** as the one hero (RSVP, students also get "Bring a friend") → **a note
  from the team** → **announcements** → **also coming up** → Community's **Open
  your home** / a student's **Bring someone with you** → foot line. No CRM
  anywhere: no stages, no owners, no contact ids, no metrics. Derivations are a
  pure `packages/core/src/memberHome.ts` with 46 tests; live data comes from
  `useMemberHomeData` / `useMemberPrayerData`, siblings of `useFtHomeData`.
  As #168/#170 both did, the app's own bottom tab bar stays and the design's
  four-tab member shell is not ported — Prayer is the existing tab, Messages
  and You are reached through More, and each of those routes forks on
  `memberRoleOf(role)` so deep links still land on the right screen for
  whoever opened them. One substitution is documented in the module header:
  the design's "the person who cares for you" has no equivalent here (there is
  no student↔full-timer relationship, and no link at all between a user account
  and a `Contact`), so `noteFromTheTeam` reads the newest direct message from
  any full-timer and the copy promises only that.
- **What members send now reaches a Full-timer.** The two member powers the
  design describes — "Ask the team to pray" and "Open your home" — write to the
  `prayerRequests` / `hospitalityOffers` collections shipped alongside, and
  each lands somewhere real on the full-timer's home rather than sitting in a
  collection nobody reads. Open requests join **"Prayers to carry"** as rows a
  Full-timer can pray for and mark answered: `ftCarryRows` flattens a member's
  ask and a logged prayer into one list (asks first, because someone reached
  out and is waiting), and `ftCarrying` now reads those same rows, so the "At a
  glance" tile's number and the widget under it can't disagree. Offers fill a
  new **"Homes open to students"** widget — read-only, with a "Message them"
  that opens the DM, because matching a student to a table is a conversation,
  not a button.
- **Announcement conversations** (shipped in the PR below this one) surface on
  the member home as their own block, and open into a thread with the reason in
  place of a composer.

### Changed
- **Coordination Series Options**: Updated board series choices to `['Small Groups', 'Outreach', 'Conferences/Trainings', 'Team']`, removing "Friday Gatherings" and replacing "Retreat" with "Conferences/Trainings".

### Fixed
- **On `/coordination`, editing a page threw your caret to the bottom, wiped what you
  had selected, and made Cmd/Ctrl+Z jump to the end of the document.** All three came
  from one line in the bi-directional task sync added by #174: the effect serialized the
  *whole* page to Markdown, diffed it line-by-line against Firestore, and on any
  difference called `editor.commands.setContent(...)` — a whole-document delete+insert.
  With `Collaboration` active that rewrites the entire `Y.Doc`, so ProseMirror mapped
  the selection to the end of the new document, the Markdown round trip lost anything
  Markdown can't express, and (since `StarterKit` runs with `undoRedo: false` and Yjs
  owns history) each rewrite landed in the undo stack as one giant entry. It fired
  constantly, because `todos`/`team` are fresh arrays on every Firestore snapshot —
  including the snapshots the editor's own 1.2s save triggers — and because comparing
  serialized Markdown lines against `formatDocTaskMarkdown` output reads as "changed"
  forever for any indented task or any title containing Markdown punctuation. The sync
  now works on `taskItem` *nodes*: `planDocTaskEdits` (`src/lib/board.ts`) works out
  which checklist lines actually went stale, and the editor patches just those in one
  transaction marked `addToHistory: false`, so a teammate's change is never something
  you can undo. The line your caret is in is skipped and re-syncs once you move off it.
  `syncMarkdownWithTasks` is gone, replaced by `formatDocTaskText`/`parseDocTaskText`
  so both directions share one format. Markdown source view took the same treatment:
  its five whole-document rewrites now go through one helper that no-ops when the text
  is unchanged and restores the caret otherwise.
- **The Board showed the same person three or four times in its live-presence stack,
  and repeated their name label inside the editor.** Confirmed against production
  RTDB: `board_docs_rtdb/{docId}/awareness` held five frozen client nodes against one
  live editor on the F26 TC page, four of them the same person. Two things were wrong.
  (1) `src/lib/yjsRtdbProvider.ts` leaked presence nodes — `destroy()` cancelled the
  `onDisconnect` remove *before* firing its own best-effort delete, so any unmount
  whose delete didn't land (tab closed on a page switch, offline, suspended mobile
  WebView) orphaned the node permanently; and a client whose initial read failed
  returned from `bootstrap()` without ever arming `onDisconnect` yet kept publishing
  presence anyway. Publishing is now gated on `onDisconnect` actually being armed,
  `destroy()` leaves the server-side remove in place as the backstop, and `pagehide`
  is handled alongside `beforeunload` (the latter never fires on iOS). A new reaper
  deletes the RTDB node whenever `y-protocols` times a peer out at 30s, so any client
  opening a page clears that page's orphans — including the ones already there.
  (2) The avatar stack rendered one entry per Yjs clientID, and a clientID is minted
  per editor mount. The awareness payload now carries `uid`, and the new pure
  `src/lib/presence.ts` collapses it to one face per person and drops your own other
  sessions (falling back to the name for clients on the older build).
  `expo-build-properties` was pinned to `^57.0.6` — an SDK 57 release sitting on
  an SDK 52 project — which fails `expo start`'s version check and the Gradle
  config step; it is now `~0.13.3`. Note that Expo Go can never run this app:
  `@react-native-google-signin/google-signin` is a native module, so every route
  throws `TurboModuleRegistry.getEnforcing('RNGoogleSignin')` there. Use
  `npx expo run:android` (a real debug build) instead — see `apps/mobile/SETUP.md`.
- **`apps/mobile/app.json` is linked to a real EAS project**
  (`@twang26/cisa-campus`), unblocking the `extra.eas.projectId` dependency that
  Phase 5's store delivery and remote push both sat behind (`MIGRATION.md`).

### Added
- **Coordination Notes Management & Display Modes**: Added edit, archive, soft-delete (trash bin), restore, permanent delete, and list/text mode toggles with interactive checklist rendering to Coordination Notes & Learnings.
- **To-Do Subtasks**: Added interactive subtask checklist support to To-Do creation, editing, and task rows with progress counts (`x/y`).

### Changed
- **Mobile v2 — the focus card is now WHITE and always fills the room**, per
  the Claude Design project's Jul 26, 2026 revision to `MOBILE-V2.md`. It was
  a cream (`#f4f1e6`) content-sized sheet that floated as a stub whenever a
  card was short; `FocusCard` is now `flex: 1` with a `minHeight: 0` body
  (direction 02, "One at a Time"), so the actions rest on the floor. The
  light palette's interior tints were retuned for the white ground —
  hairlines `#e6e3dc`, notes/about `#f4f2ee`, outline `#dcd8d0` — plus a new
  `react` token (`#fbfaf8`) so the reaction chips stop sharing `card2` with
  the "about" chip, which the revision tints differently. Ink and night mode
  are untouched.

### Fixed
- **DatePicker on `/coordination` page to-do editing overflow fixed.** `DatePicker` now dynamically checks available vertical viewport space when opened and flips its dropdown calendar above the input field (`bottom-full`) when space below is limited. `DatePicker`'s dropdown container also gained max-height clamping (`max-h-[min(380px,80vh)]`) and scrolling, and `TodoComposer` was updated to use flexible centering and dynamic repositioning on layout size changes.
- **A bottom sheet that mounted already-visible never opened.** `Sheet` calls
  `BottomSheetModal.present()` from the effect that watches `visible`, but the
  call is silently dropped when it lands in the same commit the modal mounted
  in — the ref is live, the registration with the root provider isn't finished,
  and since `visible` never transitions again nothing retries. Every sheet keyed
  by the person it's about hits this: changing that person remounts the sheet in
  the very render that opens it. The present is now deferred by one macrotask
  (`setTimeout`, not `requestAnimationFrame` — rAF never fires while the tab is
  backgrounded, the same stall the backdrop is already written to survive).

### Added
- **Push Notifications on Assigned and Created To-dos (Web & Mobile)** — Standardized to-do notification dispatch for task assignment, reassignment, completion, and due dates across both web and mobile applications. Added pure payload builders and due-date search logic (`todoNotifications.ts`) in `@cisa/core` (with 5 new unit tests, bringing `@cisa/core` tests to 301/301). Integrated notification triggers into `addTodo`, `updateTodo`, and `setTodoDone` across core, web (`src/lib/todos.ts`), and mobile (`apps/mobile/src/lib/data/todos.ts`). Added Web Browser Push Notification support (`src/lib/webPush.ts` & `public/sw.js` service worker) for desktop browser notifications, local OS due-date scheduling (`scheduleTodoDueNotification`) in mobile `notifications.ts`, and a server remote push dispatch endpoint (`/api/send-push`) in `server.ts` targeting registered user push tokens via the Expo Push API.
- **Doc-Todo & Notes/Learnings linking and bi-directional sync on the Board (`/coordination`)**:
  When a task or note/learning is created from document text selection (or assigned via `@`), it is automatically formatted and inserted into the doc markdown with linked task metadata (`- [ ] title (@AssigneeName) <!-- task:id assignee:uid -->`) or note metadata (`> 📝 **Note (Record/Learning)**: title — body <!-- note:id type:type -->`). Tasks show assignee badges directly on the document, and bi-directional sync keeps task/note status, titles, and assignees updated in real time between the document markdown and Firestore `tasks` / `board_notes`.

- **Mobile v2 — the full-timer's home is now an at-a-glance widgets screen**,

  porting the design project's `M2FT` (`MOBILE-V2.md`, "the FULL-TIMER app" +
  its Jul 26, 2026 revision item 2): direction 05 "Widgets" on a warm paper
  room by day, near-black navy by night. Full-timers land on
  `src/components/ft/FtHomeScreen.tsx` instead of the Material `MyDayScreen`.
  Shape: date + greeting + one honest summary line → two quick tiles (Log a
  moment / Hand something over) → **At a glance** → **Needs you today** →
  **From the team** → **Gone quiet in your care** → **Prayers to carry** →
  **The week ahead** strip. Powers are people actions only — log, encourage,
  write back, hand a to-do over, pray; Board pages, gatherings and kinds stay
  on the desktop site, which is what the foot line says. All the derivations
  are a pure `packages/core/src/ftHome.ts` with 45 new tests (core 251 → 296);
  live data comes from a new `useFtHomeData` sibling of
  `useTraineeLandingData`, and every write goes through the existing
  `data/todos`, `data/threads` and `data/inboxReads` modules. `theme/v2.ts`
  gained a second **room** (`V2Room` + `V2RoomContext`) so the paper/navy
  palette sits beside the trainee's green one, whose literals are untouched.
  Three substitutions the mock data allowed and this schema doesn't, each
  documented in the module: the glance's second tile is **"Next gathering"**
  off the next upcoming `Event` (there is no huddle entity, and `Event` has no
  time of day, so the design's "Team prayer" time cannot be built); **"weighs
  heavy" is `status === "ongoing"`** (no priority field exists on a prayer);
  and **"I prayed just now" is device-local**, sharing `queueState`'s per-day
  `handled` map exactly as the trainee queue's identical button does, rather
  than widening `firestore.rules` for a shared "who prayed today". As with
  #168's `LandingTrainee`, `MyDayScreen` and `components/myday/*` are left on
  disk but no longer routed to.
- **Mobile v2 — the trainee can now tune their own queue** (the piece #168
  deferred as "the queue reads the defaults"). `buildQueue` and `isOnCampus`
  already accepted a `QueuePrefs` / `OnCampusWindow`, but nothing on the
  phone could change either — which left the day-cap note ("N more are
  waiting for tomorrow — a day only holds so much") with no way to act on
  it. New v2-styled `app/queue-settings.tsx` ("Your queue") sets the
  on-campus window (days + from/until) and when to nudge you (quiet-after
  days, quiet people at a time, prayers to carry, how much a day holds),
  plus "Bring back today's queue"; it's reachable from *Everything today →
  How today is built* and from a trainee-only row on Settings. New
  `packages/core/src/queue.ts` helpers `normalizeQueuePrefs`,
  `normalizeOnCampusWindow`, `hourLabel` and `onCampusSummary` validate
  everything read back off the device, covered by 15 new tests —
  packages/core now 251/251. New `apps/mobile/src/lib/queuePrefs.ts` is the
  AsyncStorage store (`cisa.m2.prefs.<uid>`, the design's own key), a direct
  sibling of `queueState.ts`. Two deliberate departures from the design's
  `M2Settings`: the prefs are **device-local**, not Firestore (putting them
  in `UserPreferences` would mean widening `firestore.rules` and deploying it
  first, and these are phone settings), and **"How it looks" is not
  duplicated onto the v2 screen** — Settings' `AppearancePicker` already owns
  light/dark app-wide for every role.
- **Mobile v2 — the trainee's home is now a focus queue, not a dashboard.**
  Ported the Claude Design project's mobile v2 direction (`MOBILE-V2.md`,
  direction 02 "One at a Time"): one actionable card at a time on a cream sheet
  floating in a deep-green room, "Later" advances (swipe or button), and the
  queue *ends* in an all-clear + "Dates worth knowing" + a look back at the
  week. No metrics, no infinite scroll, no recurring gatherings. Five card
  kinds — a to-do due now, a message from the full-timer who cares for you, a
  follow-up you promised, someone gone quiet, a prayer to carry — each wired to
  the existing data modules (`setTodoDone`/`updateTodo`, `toggleReaction`/
  `addThreadMessage`, `InboxReads`, `sms:`, Quick Capture). New
  `packages/core/src/queue.ts` holds the ordering as a pure `buildQueue()`
  (group order, "later" re-queue, and a day cap that never holds back a to-do
  that is actually due), covered by 18 new tests — packages/core now 236/236.
  New `apps/mobile/src/theme/v2.ts` carries the v2 palette (light green room +
  the `mobile-night.css` dark layer), Manrope 500–800 + Instrument Serif, radii
  and the five card-kind tones, kept separate from the Material token set every
  other screen still uses. `LandingTrainee.tsx` is no longer routed to but is
  left on disk. Not in this pass: the ☰ drawer (bottom tabs stay), the v2
  Settings screen and its editable prefs (the queue reads the defaults), and
  the blue-room tint. One deliberate shortfall: "I prayed just now" marks the
  card done for the day only — `PrayerRecord` has no `prayedBy` field and
  adding one is a Firestore-rules change.
- **Mobile — `expo-notifications` local reminder notifications, code done
  and unit-tested; live permission-request verification blocked by a found
  bug (not silently claimed as working).** Installed `expo-notifications` +
  its config plugin; new `packages/core/src/quickCapture.ts`
  `reminderNotificationTrigger`/`reminderNotificationContent` (unit-tested,
  packages/core now 218/218) compute a real OS-notification trigger `Date`
  for a Quick Capture reminder, kept separate from `reminderDueDate` (which
  must stay a bare `yyyy-MM-dd` for the Firestore rule's 20-char cap). New
  `apps/mobile/src/lib/notifications.ts` + `usePushRegistration.ts` (every
  call guarded `Platform.OS !== 'web'`) and a new Settings
  `NotificationsSettings.tsx` card. Added `AppUser.pushToken` +
  `firestore.rules` widening — proven via 3 new cases in the existing
  emulator-backed `src/test/firestore.rules.test.ts` suite (65/65 passing).
  Verified live on Expo web: clean "Not available on web" fallback, no
  console errors. **Found a real, reproducible bug on the iOS Simulator**:
  tapping "Enable notifications" hangs the entire app with no crash/error
  (reproduced 5+ times, including after a full simulator reboot) — likely
  an `expo-notifications` incompatibility with React Native's Bridgeless/
  New Architecture mode. Not fixed this pass, per explicit user choice; see
  `MIGRATION.md`'s Phase 5 entry for the full writeup. Remote push (a real
  Expo push token + server-side dispatch) remains deferred behind `eas
  init` and new server infrastructure, same as previously.

### Fixed
- **A pre-existing, unrelated bug found while verifying the above**:
  opening Settings' "Add someone" (`InviteSheet`, built on the shared
  `Sheet.tsx`/`@gorhom/bottom-sheet` primitive used by 12 sheets) crashes
  the app on the iOS Simulator with `Uncaught Error: Property 'window'
  doesn't exist`, rooted in `@gorhom/bottom-sheet`'s `useAnimatedLayout` +
  `react-native-reanimated`. Not caused by the notifications work (no
  dependency versions changed) — flagged as a separate follow-up task
  rather than fixed here, since it's unrelated and affects a shared
  primitive.
- **`MIGRATION.md` documentation catch-up.** Two already-merged PRs (#160,
  #161 — mobile delete-with-undo for interactions, soft-delete/Trash/pin for
  Coordination Notes) had shipped real features the doc never mentioned;
  added a full entry documenting them. Separately, the doc claimed the
  Phase 3 Notifications `firestore.rules` fix was "committed but not yet
  deployed" — stale: `gh run list --workflow=deploy-firestore-rules.yml`
  shows it deployed successfully on 2026-07-15. Live-reverified against the
  e2e Student (operator) and Community (viewer) users on Expo web:
  "Mark all read" and the per-item set-aside action both succeed with no
  `permission-denied` for either role — the doc now reflects this is fully
  closed.

### Added
- **Coordination notes — pinned notes now appear at the top in a dedicated "Pinned" section.** Added `"Pinned"` as the top section in `DOC_GROUPS` (`packages/core/src/board.ts` and `src/lib/board.ts`) and updated `docGroup` so pinned coordination notes float above date dividers ("This week", "Earlier") into their own section across Web and Mobile.
- **Navigation — added external link to standalone Shared Calendar.** Added `Shared Calendar` nav link (`https://shared-calendar-6u6.pages.dev/`) opening in a new tab to `NAV_ITEMS` in `src/lib/permissions.ts` and updated `Sidebar.tsx` to support external links with `ExternalLink` indicators.
- **Web — coordination notes ("The Board") deletes now show the same undo-snackbar UX as mobile's interactions/Trash work, instead of a blocking confirm dialog.** `CoordinationNotes.tsx` and `EmbedCoordinationDoc.tsx` both used `window.confirm` + an inline `updateDoc({deletedAt})` for delete; replaced with an immediate soft-delete + a 5s "Page moved to Trash / Undo" snackbar (`restoreBoardDoc` on Undo). Extracted `MyDay.tsx`'s existing `UndoSnackbar`/`showUndoSnack` pattern (previously local to that file, used for archived-prayer undo) into shared `src/hooks/useUndoSnack.ts` + `src/components/UndoSnackbar.tsx`, now used in three places. Added a new `src/lib/data/board.ts` (web has no dependency on `@cisa/core`, so this mirrors `packages/core/src/data/board.ts`'s `softDeleteBoardDoc`/`restoreBoardDoc`/`deleteBoardDoc` for the web app).
- **Trash now auto-purges pages older than 30 days.** No scheduled server-side job exists in this repo, so this is a lazy sweep: whenever a Trash view loads (mobile's `apps/mobile/app/coordination/trash.tsx` or the new web Trash view below), any doc trashed 30+ days ago is permanently deleted. Added `purgeExpiredTrash`/`isExpiredTrash` to `packages/core/src/data/board.ts` (mobile + shared) and to the new `src/lib/data/board.ts` (web).
- **Web — a new Trash view for coordination notes (`/coordination/trash`, admin-only).** Previously Trash only existed on mobile; deleting a page from the web editor had no web-side way to view/restore/permanently-delete it. New `src/views/CoordinationTrash.tsx` mirrors mobile's Trash screen (Restore, "Delete Forever" behind a `window.confirm`), reached via a Trash icon next to the Pages list header. No `firestore.rules` change needed — the existing `board_docs` rule already gives admins an unconditional read/delete bypass.
- **Coordination notes can be pinned to the top of the Pages list.** Added `pinned?: boolean` to `BoardDoc` (both `packages/core/src/board.ts` and web's parallel `src/lib/board.ts`) and a `docSortOrder` comparator (pinned-first, then newest-first) swapped in wherever the Pages list is sorted. A pin/unpin toggle (admin-only) was added to web's `DocRow` and mobile's `DocCard.tsx`, backed by a new `pinBoardDoc` helper. No `firestore.rules` change needed (`isValidBoardDoc` uses `hasAll`, not `hasOnly`).
- **Coordination notes' editor can now insert a link with custom display text.** The TipTap `Link` mark was already active (bundled via `StarterKit`) but had no UI. Added a toolbar "Link" button and a "Link" option on the text-selection pill menu, both opening a new `LinkComposer` popover (modeled on the existing `NoteComposer`) with Display Text + URL fields — applies the link to an unchanged selection, or replaces the selection/inserts at the cursor when the display text differs from what was selected.
- **Feedback admin panel now shows a "Not auto-synced" label when a submission has no linked GitHub issue,** instead of silently showing nothing. The automatic Send Feedback → GitHub Issues sync (`server.ts`'s `/api/feedback`, `/api/feedback/update`, `/api/webhook/github`) is fully implemented but silently no-ops whenever `GITHUB_TOKEN`/`GITHUB_REPO`/`GITHUB_WEBHOOK_SECRET` are unset — these were never documented in `.env.example` or `GCLOUD_DEPLOYMENT.md`, strongly suggesting the production Cloud Run service never had them configured. Documented all three (plus the GitHub webhook callback URL) in both files; admins already had a manual "Create Issue"/"Link" fallback for this case.
- **Mobile — deleting a logged interaction now shows an undo Snackbar instead of just vanishing.** Contact Detail's "Conversations" tab (`ConversationsTab.tsx`) had no delete at all until now; there was also no Snackbar/Toast component anywhere in the app. Added a reusable `apps/mobile/src/components/ui/Snackbar.tsx` and a new `deleteInteraction` (`packages/core/src/data/interactions.ts` + mobile wrapper) — no `firestore.rules` change needed, since the interactions delete rule already allows the owner or a manager. Tapping Delete hides the interaction immediately and shows a "Undo" Snackbar; nothing is actually deleted from Firestore unless the Snackbar's ~4s window elapses without Undo. The pending-delete state and Snackbar render live in `app/contact/[contactId].tsx` (not `ConversationsTab.tsx` itself), since the Snackbar needs to render above the tab's own `ScrollView`, not inside its scrollable content.
- **Mobile — "The Board" (coordination notes) deletes are now recoverable via a new Trash, instead of a permanent hard delete.** Previously deleting a page (`board_docs`) called `deleteDoc` directly, with no recovery path short of a project-wide GCP Firestore backup restore. Added a `deletedAt` soft-delete field to `BoardDoc` (`packages/core/src/board.ts`, plus the web app's own duplicate `src/lib/board.ts`), `softDeleteBoardDoc`/`restoreBoardDoc`/`subscribeTrashedBoardDocs` (`packages/core/src/data/board.ts`, no `firestore.rules` change needed — `isValidBoardDoc` uses `hasAll`, not `hasOnly`), and a new admin-only `apps/mobile/app/coordination/trash.tsx` screen (Restore, or "Delete Forever" for the old permanent-delete behavior) reachable via a new Trash icon on the Pages list header. The existing hard `deleteBoardDoc` is kept as the permanent-purge action, now only called from Trash. Since admins delete pages today via the web-based editor (embedded in a WebView on mobile), `src/views/CoordinationNotes.tsx` and `src/views/EmbedCoordinationDoc.tsx`'s delete handlers were switched from `deleteDoc` to the same soft-delete `updateDoc`, and the desktop Pages list now filters out trashed docs too — otherwise a "soft-deleted" page would still show up there.

### Fixed
- **Mobile: opening any bottom sheet crashed with `ReanimatedError: Property 'window' doesn't exist` on a real native iOS build (not reproducible on Expo web).** Root cause was upstream: `@gorhom/bottom-sheet@5.2.14`'s `useAnimatedLayout.ts` destructures `Dimensions.addEventListener('change', ({ window }) => ...)`, and `react-native-reanimated` >=3.15's Babel plugin added `window` to its "not captured" identifier list — treating any variable named `window` referenced inside a worklet as the (nonexistent, on the UI-thread worklet runtime) global object instead of capturing it as a closure value. This is a regression the library introduced in 5.2.14 ([gorhom/react-native-bottom-sheet#2678](https://github.com/gorhom/react-native-bottom-sheet/issues/2678); fix PR [#2679](https://github.com/gorhom/react-native-bottom-sheet/pull/2679) unmerged as of this fix). Patched locally via `patch-package` (new `apps/mobile/patches/@gorhom+bottom-sheet+5.2.14.patch` + `postinstall` script) — renames the destructured variable and adds the missing listener cleanup, matching the upstream fix PR. Since all 12 sheets share the one `Sheet.tsx` primitive, this fixes all of them at once; verified live on the iOS Simulator across 11 of the 12 (InviteSheet, EditRoleSheet, RemoveAccessSheet, AddContactSheet, HoldPrayerSheet, MoveSheet, QuickCaptureSheet, RosterSheet, CreateChatSheet, ChatDetailsSheet, HistoryFilterSheet) with no crashes; `ContactsPickerSheet` wasn't independently reached via UI navigation but shares the identical `Sheet.tsx`/`useAnimatedLayout` code path.
- **Feedback submission temporarily hid the feedback button and modal during submission.** Replaced DOM `visibility: hidden` inline style toggling during `html2canvas` capture with `ignoreElements` filtering in `FeedbackFAB.tsx` and `SubmitFeedback.tsx`, keeping the modal and button visible on screen. Added an animated `Loader2` spinner loading indicator and disabled inputs during submission.
- **Feedback submission threw HTTP 413 Payload Too Large / Firestore document size error on large screens or long pages.** `FeedbackFAB.tsx` and `SubmitFeedback.tsx` captured screenshots at 1.5x scale, 1600px max dimension, and 0.85 JPEG quality, resulting in multi-megabyte base64 strings that exceeded payload limits and Firestore's 1 MB document limit. Optimized capture to 1.0x scale, 1000px max dimension, and 0.65 JPEG quality with automatic size fallback checks.
- **Coordination notes' remote collaboration cursor labels detached from carets and rendered at block line start.** `.collaboration-carets__caret` in `src/index.css` had `display: inline`, which caused `position: absolute` on child `.collaboration-carets__label` to compute relative to the nearest block container (`<li>`/`<p>`) instead of establishing an inline BFC at the cursor position. Fixed by setting `.collaboration-carets__caret` to `display: inline-block; width: 0; position: relative; z-index: 10;`, and adding opacity styling for remote text selections (`.collaboration-carets__selection`). (This entry also claimed live presence avatars were deduplicated by user name in `CoordinationNotes.tsx`; that never shipped — the commit touched no such code. Presence dedup landed later, keyed by uid, under the duplicate-avatar fix above.)
- **Coordination notes' live-collaboration cursor label was pushing page content down.** `@tiptap/extension-collaboration-caret` renamed its generated classes from `collaboration-caret__*` to `collaboration-carets__*` (plural), but `src/index.css` only had rules for the two older names from a prior rename — the remote-user name-tag div matched none of them, so it had no `position: absolute` and rendered as a normal block box in the flow, shifting subsequent content down. Added the missing `.collaboration-carets__*` selectors alongside the existing ones.
- **Mobile: My Day showed task/event due dates one day early in behind-UTC timezones.** `OnTheHorizon.tsx` and `YourWeek.tsx` parsed bare `yyyy-MM-dd` `dueDate`/`date` strings with raw `new Date(...)`, which the JS spec parses as UTC midnight — landing on the previous local day west of UTC (e.g. a task due tomorrow showed "Due: Jul 20" instead of "Jul 21" in `America/Los_Angeles`). `packages/core/src/myday.ts` already had a `toLocalDate()` helper built for exactly this (used correctly by `dueChip()`) but it wasn't exported; exported it and switched both components to use it. Verified live on Expo web by creating a task due "Tomorrow" and confirming the displayed date matched.
- **Mobile: setting a Quick Capture reminder always failed with "Missing or insufficient permissions."** The new Log tab's `reminderDueDate` (`packages/core/src/quickCapture.ts`) returned a full ISO datetime (~24 chars) for a task's `dueDate`, but the deployed `tasks` Firestore rule caps `dueDate` at 20 chars, so every reminder write was silently rejected. Fixed by matching `myday.ts`'s existing `duePresetToISO` format exactly — a bare `yyyy-MM-dd`, the same format the app's own native "Add a task" composer already uses. Reproduced live as the e2e Full-timer user.
- **Mobile: closing any bottom sheet on Expo web could leave a full-viewport invisible click-blocker over the whole app.** `apps/mobile/src/components/ui/Sheet.tsx`'s shared primitive (all 12 sheets) used `@gorhom/bottom-sheet`'s own `BottomSheetBackdrop`, whose `pointer-events` only flips to `none` once its Reanimated-driven close animation crosses a threshold index. On web that animation runs entirely on `requestAnimationFrame` (confirmed in `react-native-reanimated`'s `JSReanimated.scheduleOnUI`, no fallback), which can stall indefinitely — e.g. a backgrounded/hidden tab, or any dropped frame during the fade — leaving the backdrop stuck mid-fade with `pointer-events: auto` covering the entire screen, silently swallowing every subsequent click. Replaced it with a custom `SheetBackdrop` that gates hit-testing on the `visible` prop directly (a plain React state flip, independent of any animation ever completing); the Reanimated-driven fade is now purely decorative (`pointerEvents="none"`), so it's harmless if it never settles. Also switched the sheet's own open/close position animation to a duration-bound timing config on web only (`useBottomSheetTimingConfigs`, matching the library's existing Android default) instead of the default spring, as defense-in-depth against throttled (not fully dead) `requestAnimationFrame`. Reproduced and verified live on Expo web by directly probing the backdrop DOM node's `pointer-events`/`opacity` before and after the fix.
- **OpenWiki Update workflow still failing after the LangSmith/provider fixes.** The run now got all the way through doc generation but died on `/openwiki/AGENTS.md lacks YAML front matter.` — `openwiki/AGENTS.md` and `openwiki/CLAUDE.md` were stray duplicate files accidentally committed inside the `openwiki/` wiki output directory itself back when it was first set up, alongside an equally stray (and stale, pre-#142/#144) copy of the workflow file at `openwiki/.github/workflows/openwiki-update.yml`. Per OpenWiki's docs, `AGENTS.md`/`CLAUDE.md` are only ever meant to live at the repository root; the copies inside `openwiki/` had no YAML front matter and tripped the CLI's wiki-page validation. Deleted all three stray files — the real root-level `AGENTS.md`/`CLAUDE.md`/workflow are untouched.
- **OpenWiki Update workflow still failing after the provider switch.** Switching to Anthropic (below) fixed the immediate `OPENROUTER_API_KEY is required` error, but the run then failed later with repeated `Failed to send multipart request. Received status [403]: Forbidden` messages and a final non-zero exit — `LANGCHAIN_TRACING_V2: "true"` was enabled with no `secrets.LANGSMITH_API_KEY` configured, so every LangSmith trace upload was rejected, and the resulting unhandled rejection crashed the Node process after doc generation had otherwise completed. Removed the unused `LANGSMITH_API_KEY`/`LANGCHAIN_PROJECT`/`LANGCHAIN_TRACING_V2` env vars from `.github/workflows/openwiki-update.yml` since this repo doesn't use LangSmith tracing.
- **OpenWiki Update workflow failing on every scheduled run.** The workflow was configured for `OPENWIKI_PROVIDER: openrouter` reading a `secrets.OPENROUTER_API_KEY` that was never added to the repo, so every run failed with `OPENROUTER_API_KEY is required for non-interactive runs`. Switched `.github/workflows/openwiki-update.yml` to `OPENWIKI_PROVIDER: anthropic` / `OPENWIKI_MODEL_ID: claude-sonnet-5`, reading `secrets.ANTHROPIC_API_KEY` instead — Anthropic is natively supported by OpenWiki, avoiding an OpenRouter pass-through fee. Still requires the `ANTHROPIC_API_KEY` secret to be added to the repo before the workflow can run successfully.

### Added
- **Mobile — iOS Simulator verification pass, closing three stale "not verified" gaps in `MIGRATION.md`.** This environment gained a working iOS Simulator, unblocking checks several already-shipped screens had flagged as unverifiable. Confirmed live, no bugs found: Coordination Notes' admin WebView flow (the `mint-custom-token` native fetch bypasses the CORS preflight that blocks it on Expo web; the live collab editor loads and a real edit round-trips through Firestore); Contact Detail's delete confirmation (native `Alert.alert` → real Firestore delete → navigate-back, using a disposable throwaway contact); and the shared `Sheet.tsx` primitive's native drag-to-dismiss physics. Android-side verification (Google Sign-In, a `Pressable`-in-sheet nuance) stays open — no emulator is configured here. See `MIGRATION.md`'s Phase 3/4 entries and "How to proceed" #20 for detail.
- **Mobile Phase 6 kickoff — a real production web export for `apps/mobile`, verified live.** Added `"build:web": "expo export -p web"` to `apps/mobile/package.json` (previously only a dev-server script existed). A route-by-route comparison of the web app's 14 routes against `apps/mobile/app/` confirmed screen-level parity already existed — the actual gap was the missing production build. **Bug found + fixed during verification**: the exported static bundle threw `Firebase: Error (auth/invalid-api-key)` on load. `apps/mobile/src/lib/firebase.ts` read env vars via `const env = process.env; env.EXPO_PUBLIC_FIREBASE_API_KEY`, but Expo's babel plugin that inlines `EXPO_PUBLIC_*` vars into a production bundle only statically replaces the literal `process.env.EXPO_PUBLIC_X` expression — the `env` alias defeated it, so the value came through as `undefined` in the exported bundle (dev mode never surfaced this, since Metro's dev server injects a live, populated `process.env` object at runtime instead of relying on static replacement). Fixed by referencing `process.env.EXPO_PUBLIC_X` directly for each var. Verified live: statically served `apps/mobile/dist` (new `mobile-web-dist` launch config, port 8092), logged in as the e2e Full-timer against real Firestore, confirmed 0 console errors, client-side nav across Home → People → More → History → Settings, and both themes rendering correctly. Also confirmed (and documented in `MIGRATION.md`/`SETUP.md`) that a hard reload on a nested path 404s on a plain static server, since `app.json`'s `web.output` is `"single"` — whatever host is eventually chosen for Phase 6 will need a catch-all rewrite to `index.html`. Retiring the old web app and reconciling React versions (18.3 vs 19) remain open, out of scope for this pass — see `MIGRATION.md`'s Phase 6 section.
- **Mobile — Log tab ("Quick Capture"), verified live against the e2e Full-timer and Community users.** One of the app's six primary bottom tabs had only ever shown a placeholder alert since the tab bar was first scaffolded — never tracked as an open item in `MIGRATION.md`. Built `apps/mobile/src/components/quickcapture/QuickCaptureSheet.tsx`, a single-contact four-step flow (who did you talk to → what happened → saved → optional reminder/prayer) ported from the Claude Design project's dedicated mobile file `views/quick-capture.jsx` — not the desktop `LogInteractionModal.tsx` batch logger, which is a different, multi-contact flow. Supports picking an existing contact or creating a new one inline (reusing the existing `addContact`), six capture kinds, a Today/Yesterday toggle (no native date-picker dependency exists anywhere in the app, matching the existing task composer's own fixed-preset-only design), a follow-up reminder (`addTodo`, with a "heads-up" notification to the contact's creator if it isn't you, mirroring `data/comments.ts`'s existing creator-notify pattern), and an inline prayer add (`addPrayer`). Added `packages/core/src/quickCapture.ts` (pure, unit-tested: the six kinds, a "mine-first, most-recently-touched" recents sort — the opposite direction from Directory's longest-since-touched sort — search matching, and reminder due-date presets; packages/core now 209/209 tests) and widened `contactDetail.ts`'s `interactionActivityType` to cover the new kinds. No new Firestore data-layer functions were needed. Gated to non-viewer roles, matching the desktop modal's own gate. See the Fixed section for a real Firestore-rules bug found and fixed during verification. Deferred: voice-to-text note dictation (the design uses the browser's Web Speech API, not portable to React Native without a new native dependency).
- **Mobile — Contact Detail screen (`/contact/[contactId]`), verified live against all four e2e role users.** Ported `src/components/modals/ContactDetailsModal.tsx` to a full native screen: overview + edit/delete, a conversation log with a per-interaction "Alongside" walking-together thread, prayer, team discussion, and audit history, built against the web modal's `isMobile` branch. Closes 8 of the 9 existing `onOpenContact` placeholders across `apps/mobile` (My Day, People, Prayer, History, Answered, Attendance, Search, LandingTrainee) — Messages' `ChatDetailsSheet` is intentionally left as-is, since its `otherMember` is a team user, not a `contacts` doc, and there's no FK between the two. Added `packages/core/src/contactDetail.ts` (pure, unit-tested: the edit-form field diff, the interaction-type-to-activity-type map, and the delete-log text) and new/extended `packages/core/src/data/{contacts,threads,activities,prayers,interactions,comments}.ts` (interactions/comments are new; the rest gained single-contact/single-doc variants alongside their existing team-wide ones), all behind the injected-`db` pattern. Added `'/contact': 'viewer'` to `packages/core/src/permissions.ts`'s `ROUTE_MIN_ROLE` — the route has no `NAV_ITEMS` entry, so this was a required, easy-to-miss step. The "Alongside" tab (`AlongsideThreadView`) is genuinely new RN UI — no existing screen renders a walking-together thread's message list — while the rest reuse already-proven patterns (interaction/comment CRUD lists, a prayer card, an audit timeline via `history.ts`'s `humanize()`). **Bug found + fixed during verification**: `packages/core/src/data/comments.ts`'s `addComment` (mirroring the web modal's own `handleAddComment`) only wrote `parentId` when replying, omitting the field entirely for a top-level comment — but the deployed `comments` create rule's `data.parentId == null || (data.parentId is string && ...)` check accesses that field unconditionally, so a bare (non-existent) `parentId` fails the check and denies the write with "Missing or insufficient permissions." Reproduced live (an uncaught error, not just a console warning) the first time a top-level Discussion comment was posted. Fixed by always writing `parentId: input.parentId ?? null` — this is a pre-existing bug in the untouched web app too (same field-omission pattern), fixed here only for mobile's new data module. Verified live: Full-timer (admin) — edit/save with the diff showing up in that contact's own History tab, delete's confirmation (`Alert.alert`, a no-op on web per this migration's known limitation — needs Simulator verification), tag add/remove, logging an interaction, adding a prayer, posting + reacting to an Alongside message, and a threaded Discussion reply, all against real Firestore. Trainee (manager) — correct trainee-flavored Alongside compose kinds (Note/Question/Comment/Encourage, no Follow-up) and no Edit button. Student (operator) — every compose surface writable, still no Edit button. Community (viewer) — every tab renders read-only (no compose boxes, no tag-add, no reaction taps), reached via the Prayer tab's `onOpenContact` and not blocked by the route guard. **Also found, and left for separate follow-up (flagged as a background task)**: closing the "From the team" inbox item's action sheet (`FromTeamInbox.tsx`, built on the shared `Sheet.tsx`/`@gorhom/bottom-sheet` primitive) leaves an invisible, full-viewport, click-blocking backdrop behind on Expo web — reproduced with a purely local action (no navigation involved), so it's a pre-existing bug in the shared sheet primitive, not something this change introduced.
- **Mobile Phase 0.5 — Native Google Sign-In, the last open Phase 0.5 item, verified live on the iOS Simulator.** `apps/mobile` login now offers "Sign in with Google" alongside email/password, via `@react-native-google-signin/google-signin` + `signInWithCredential`. Registered the `com.cisa.campus` iOS + Android apps in the live `sac-campus-hub` Firebase project (`firebase apps:create`/`apps:sdkconfig`) and attached the local debug keystore's SHA-1 to the Android app via a direct Firebase Management API call (no dedicated `firebase-tools` subcommand exists for this). The Google sign-in provider itself was already enabled project-wide — no manual console step was needed, resolving `MIGRATION.md`'s open question on that point. Also required `expo-build-properties` (`ios.useFrameworks: "static"`) to fix a CocoaPods static-library integration error from the native SDK's transitive `AppCheckCore`/`GoogleUtilities` deps. Android is registered and configured but not live-verified (no Play-Services emulator in this environment); Sheets `spreadsheets.readonly` scope recovery is out of scope, matching the web app's optional nice-to-have. Phase 0.5 is now fully complete.
- **Mobile Phase 5 — splash image + EAS Build config, verified live on the iOS Simulator.** `apps/mobile` now shows a real splash screen instead of only a background color: `expo-splash-screen` (via `npx expo install`) reuses the existing `adaptive-icon-foreground.png` brand mark on the existing `splash.backgroundColor`, and `app/_layout.tsx` now calls `SplashScreen.preventAutoHideAsync()`/`hideAsync()` so the native splash stays up through auth/font loading instead of auto-hiding instantly and flashing a separate spinner. Also added `eas-cli` as a local devDependency and a hand-authored `apps/mobile/eas.json` with the standard `development`/`preview`/`production` build profiles, so `npx eas` resolves without a global install. Linking the project to an Expo account (`eas login`/`eas init`) and an actual TestFlight/Play build are left for the user, documented in `apps/mobile/SETUP.md`'s new "App-store delivery" section, since both need the user's own Expo/Apple/Google credentials.
- **Mobile Phase 3 — Modals → `@gorhom/bottom-sheet`, the last open Phase 3 item.** All 12 hand-rolled `Modal`+scrim sheet screens in `apps/mobile` (My Day's team inbox/contacts picker, Prayer, Journey's move sheet, Settings' role editor/invite/remove-access, Messages' create-chat/room-details, History's filter sheet, Attendance's roster, and People's add-contact form) now share one `Sheet` component (`apps/mobile/src/components/ui/Sheet.tsx`) built on `@gorhom/bottom-sheet`, giving real drag-to-dismiss and a proper backdrop instead of the old cosmetic (non-draggable) handle bar. `apps/mobile/app/_layout.tsx` gained a `BottomSheetModalProvider` nested inside the existing provider stack (must sit inside `ThemeProvider`/`AuthProvider`, not outside, since the library portals sheet content and only ancestor providers are visible to it). Explicit `snapPoints` + `enableDynamicSizing={false}` is used instead of the library's default dynamic sizing, which has a widely-reported bug where a sheet mounts with real content but never animates open. Three files (`AddContactSheet`, `CreateChatSheet`, `ChatDetailsSheet`) gained a `footer` prop for an action row pinned above the keyboard, replacing a sibling that used to sit outside the old `ScrollView`. **Found and fixed a real bug during verification**: `@gorhom/bottom-sheet`'s `BottomSheetTextInput` calls the native-only `TextInput.State.currentlyFocusedInput()` on blur, which `react-native-web` doesn't implement and throws — sheet text fields use plain `TextInput`/the existing `InlineInput` instead, which don't have this issue. Verified live on Expo web against My Day, People, and The Journey (open/close, backdrop-tap-to-close, the pinned footer staying visible while scrolling/typing on the 8-field add-contact form, no console errors). Native pan-gesture drag physics and an Android-specific `Pressable`-inside-a-sheet touch nuance flagged by the library's own troubleshooting docs are not verified by this pass — no simulator/device was available — and should get a follow-up check on a real device. Modals → RN bottom sheets was the last open Phase 3 item; Phase 3 is now fully complete.
- **Mobile Phase 3 — platform swaps: Feedback screenshot capture and Attendance CSV export, verified live on Expo web.** `apps/mobile/app/feedback.tsx` now captures a best-effort screenshot on submit via `react-native-view-shot`, wrapping the form in `ViewShot` and downscaling to a 480px-wide thumbnail (an unconstrained capture of a desktop-width screen ran ~184000 chars, close to `firestore.rules`' 200000-char cap on `Feedback.screenshot`; downscaling brought that to ~15000 chars). The package's web shim (backed by `html2canvas`) turned out to work on Expo web too, not just native — better than expected, since the migration's precedent (the Phase 0.5 WebView spike) needed the iOS Simulator for its native module. Capture is of the form screen itself, not the screen the user was complaining about, since mobile's Feedback is a routed screen reached only from "More" (not a persistent FAB like web's) — the "offending" screen is already unmounted by submit time. `apps/mobile/src/components/feedback/FeedbackRow.tsx` gained a collapsed-by-default "View screenshot" disclosure for admins. Separately, `apps/mobile/app/attendance.tsx` gained an ungated Export button (matching web, where Export isn't admin-only unlike "Log a gathering"/"Sync sheet"), backed by a new pure `buildAttendanceCsv` in `packages/core/src/attendance.ts` (unit-tested, ported verbatim from web's `Attendance.tsx` `handleExport`; packages/core now 185/185 tests) and a new `apps/mobile/src/lib/exportCsv.ts` that branches on `Platform.OS === 'web'` (the same Blob+anchor-click download trick web already uses) vs. native (`expo-file-system` write + `expo-sharing` share sheet). Scoped clipboard→`expo-clipboard` out of this pass: its only web use (Settings' Integrations console) is itself still deferred on mobile, so there's nothing to attach it to yet.
- **Mobile Phase 4 — Coordination Notes / "The Board" real doc browser, replacing the Phase 0.5 spike's single hardcoded doc.** `apps/mobile/app/coordination.tsx` is now a folder route: `coordination/index.tsx` lists every page the signed-in role can see (audience-scoped Firestore query, sorted newest-first, grouped into "This week"/"Earlier" via `packages/core`'s existing `DOC_GROUPS`/`docGroup`), and `coordination/[docId].tsx` role-branches on open — admins get the proven WebView editor (now parameterized by `docId` instead of the spike's `SPIKE_DOC_ID`), everyone else gets a new native read-only view (`react-native-marked`) rendering the page's markdown directly, since `board_docs` writes are admin-only regardless of UI. Added `packages/core/src/data/board.ts` (`subscribeBoardDocs`/`subscribeBoardDoc`/`deleteBoardDoc`, injected-`db`, also fixing a sort-order gap where the existing web-mobile view skipped client-side sorting for non-admin roles) and ported `mdPreview`/`mdOpenTasks` into `packages/core/src/board.ts` (unit-tested). Also wired `src/views/EmbedCoordinationDoc.tsx`'s remaining stubs now that admins can open any doc, not just the seeded one: real `contacts` subscription + `ContactDetailsModal`, "Save to archive" (exported `NoteForm`/`guessSeries`/`mdExcerpt` from `CoordinationNotes.tsx`, same treatment `DocEditor` already got), and delete (Firestore + best-effort RTDB `board_docs_rtdb` cleanup). Deploying `/api/mint-custom-token` to production (needed for a real device, not just the Simulator/localhost) remains a separate, explicit-go-ahead infrastructure step.
- **Mobile Phase 0.5 — Fonts, verified live on Expo web.** `apps/mobile` now bundles and loads its real typeface instead of silently falling back to the OS system font: `@expo-google-fonts/newsreader` + `@expo-google-fonts/hanken-grotesk`, loaded via `useFonts()` in `app/_layout.tsx` (gated behind the existing auth-loading spinner, so there's no flash of unstyled text). Only the weights actually referenced anywhere in the app were bundled — every one of the 28 `typography.fontSerif` call sites uses weight 500 only, so `fontSerif` now resolves straight to `Newsreader_500Medium`; `typography.fontSans` (`HankenGrotesk_400Regular`) and a new `fontSansSemiBold` (`HankenGrotesk_600SemiBold`) cover the only two sans weights used, both solely through `AppText` (`apps/mobile/src/components/ui/index.tsx`). Also fixes a latent bug: RN doesn't repaint a static custom font at a different `fontWeight`, so `AppText`'s `label` variant previously would have rendered at Regular weight forever even with fonts loaded — it now points `fontFamily` straight at the SemiBold family instead of relying on an inert `fontWeight: '600'` override.
- **Mobile Phase 0.5 — Collab editor in a WebView spike, verified live on the iOS Simulator.** Resolved the migration's top technical risk: the web app's TipTap/Yjs collaborative editor now runs inside `apps/mobile`'s `react-native-webview`, with live Yjs/RTDB sync confirmed bidirectionally between the Simulator and a normal browser tab (including live cursor presence). Rather than extracting `DocEditor` into a standalone bundle with new build tooling, the spike points the WebView at a new bare, unauthenticated `/embed/coordination/:docId` route on the **already-deployed web SPA** (`src/views/EmbedCoordinationDoc.tsx`) — `DocEditor` only needed one `export` added, since it already closes over its module-scope helpers lexically. Auth is bridged with a short-lived Firebase custom token: a new self-service `POST /api/mint-custom-token` endpoint (`server.ts`) exchanges the caller's own ID token for a custom token (no privilege escalation), delivered into the WebView via `injectedJavaScriptBeforeContentLoaded` to avoid a post-load `postMessage` race. Required granting this environment's ADC identity `roles/iam.serviceAccountTokenCreator` on the `firebase-adminsdk-fbsvc` service account (keyless, matching the project's existing WIF-over-keys convention) since `createCustomToken` needs a signing credential ADC alone doesn't provide locally. Scoped narrowly: one hardcoded seeded doc (`demo-board-team`), contact-linking/promote/delete stubbed as no-ops, verified against `localhost:3000` only. A full Board/doc-browser mobile screen remains separate, unstarted work.
- **Mobile Phase 4 — Messages (private direct + group chat), live end-to-end.** Built the native Messages screen in `apps/mobile`: a room list ("Fellowship Chat") with search and an unread indicator, a "Start Conversation" sheet (Direct Message / New Group tabs), and a per-room thread (day-grouped messages, a plain-text composer, and a "Group/Conversation Details" sheet for member roster + invite + leave). Ported the shipped web `src/views/Messages.tsx` + `src/services/chat.ts` behavior — room list, send/receive, unread dot — rather than the design tool's aspirational mockup (which models unbuilt reactions/pinning/broadcast/mentions). Added `packages/core/src/chat.ts` (pure, unit-tested: room name/photo resolution, unread check, day-grouping, the `CreateChatModal` candidate-user filter) and `packages/core/src/data/chat.ts` (the injected-`db` Firestore layer); mobile's read-tracking (`chatReads.ts`) mirrors the existing AsyncStorage per-uid pattern used by `prayerHidden.ts`/`inboxReads.ts`. Sending a message now also notifies every other room member via the existing notifications system — new behavior beyond the web port, since mobile has no persistent header/badge elsewhere to surface an incoming message. **Also fixed a live, pre-existing bug** in the shipped web app's group-chat/invite/leave system messages: they wrote `senderId: 'system'`, which fails the deployed `chatRooms/{roomId}/messages` create rule's `senderId == request.auth.uid` check, so every group's "X created group…"/"X added…"/"X left…" system message has always silently failed to write (the room itself still got created, just without its genesis message) — reproduced live against the unmodified web app. `packages/core/src/data/chat.ts` uses the acting user's real uid instead (display still reads "System" via `senderName`/`type`, unaffected). Deferred for this pass: attachments, @mention autocomplete, and the "View Directory Contact Profile" deep link (no contact-detail screen exists yet). Verified live against all four e2e role users on Expo web, including cross-role room visibility (only Full-timer/admin sees every room; other roles see only their own) and the admin-only cross-room read/send bypass.
- **Mobile Phase 5 — app name + app icon finalized.** `apps/mobile/app.json`'s `name` is now "CISA Campus Work Tracker" (previously the shorter "CISA Campus"), and the app now has a real icon instead of none: `expo.icon` and `web.favicon` point at a 1024×1024 export of the web app's brand mark (`public/logo.svg`'s purple/cream sheep, matching the top-left `Sidebar.tsx` logo), and `android.adaptiveIcon` uses a matching transparent foreground (`backgroundColor: "#5c5595"`, the brand purple) sized within Android's safe zone. Splash image and EAS Build config remain open Phase 5 items.
- **Mobile Phase 4 — The Journey (contact-stage pipeline board), live end-to-end.** Built the native Journey screen in `apps/mobile` (replacing the placeholder), porting web's `OutreachBoardMobile.tsx` behavior: a horizontal-scrolling stage tab switcher (plus a synthetic "Unassigned" tab when contacts have no stage) with live per-stage counts, a contact list with overdue-toned "last connected" lines and a truncated last-touch note, tap-to-switch stages, and a "MoveSheet" bottom sheet to move a contact between stages — gesture-based, not drag-and-drop, matching the migration plan's target UX. Reused almost the entire People-phase data layer as-is (`subscribeContacts`/`subscribeStages`/`subscribeTouches`/`lastTouchByContact`); added one new core mutation, `moveContactStage` (`packages/core/src/data/contacts.ts`, mirroring `setContactAttendance`'s injected-`db` shape), plus a mobile wrapper that logs the activity only for stage-to-stage moves (not moves out of "no stage"), matching web's `handleUpdateContactStage` exactly. `AddContactSheet` got a small additive `defaultStage` prop so "Add to {stage}" pre-fills the active tab. Deferred: admin "Shape the journey" stage management, and swipe-between-tabs (tap is the primary interaction). Verified live against the e2e Trainee (manager) and Full-timer (admin) users on Expo web — tab switching, live move + Firestore-backed activity log, add-contact with stage pre-fill — and confirmed the route is hidden from the Student (operator) user's tab bar.
- **OpenWiki documentation.** Added a scheduled OpenWiki GitHub Actions workflow (`.github/workflows/openwiki-update.yml`) that regenerates a code wiki under `openwiki/` (architecture, workflows, data models, integrations, operations, testing, mobile development). `CLAUDE.md`/`AGENTS.md` are now tracked in git (previously gitignored) with an OpenWiki pointer section appended, and `AGENTS.md` mirrors `CLAUDE.md`'s existing behavioral guidelines. Removed the `.claude/hooks/sync-worktree-secrets.sh` logic that used to mirror the gitignored `CLAUDE.md` into worktrees, since worktrees now get it via normal git checkout.
- **Mobile Phase 3 — Settings (full port: profile, roles reference, appearance, team management), live end-to-end.** Built the native Settings screen in `apps/mobile` (`app/settings.tsx` + `src/components/settings/*`), porting `src/views/Settings.tsx` in full rather than just profile/appearance: a profile header, a static "Roles & access" reference highlighting your own role, a light/dark/system appearance picker wired to the already-built `ThemeProvider` (scheme persistence stays deferred, matching that provider's own comment), and — for Trainee+ — full team management: search, approve/un-approve pending sign-ups, edit a member's role (both the Full-timer role option and role-editing itself gated to admin actors, matching web's `canEditRole={isAdmin && !isYou}` RBAC exactly — a Trainee can remove access but not edit roles), soft-remove access, invite by email, and cancel a pending invite. Added a new pure, unit-tested `packages/core/src/settings.ts` and extended the existing `packages/core/src/data/users.ts` (`subscribeUsers`/`subscribeInvitations`/`toggleUserApproval`/`changeUserRole`/`sendInvitation`/`revokeInvitation`) — the existing `users`/`invitations` Firestore rules already permit everything needed, no rules changes required. Also extended the shared `Avatar` primitive with an optional `photoURL` prop. **Deferred**: the Quick Add/Integrations playground and API/webhook console (server-side, dev tooling), and the embedded "What people are telling us" feedback list (mobile already has this as its own `/feedback-admin` route). Verified live against all four e2e role users on Expo web, including a full invite-create-then-cancel round trip against real Firestore.
- **Mobile Phase 3 — Global Search (MVP: People + Quick actions + History), live end-to-end.** Built a native Search screen in `apps/mobile` (`app/search.tsx` + `src/components/search/*`), reached from a manual "More" card since web's version (`GlobalSearch.tsx`) is a ⌘K overlay, not a routed page. Substring search across contacts (any signed-in role) and, for Trainee+, recent activity history; an empty-state "Recent people" + role-filtered quick actions ("New contact" for Student+, opening the existing `AddContactSheet`; "Open sign-up form" for everyone). Reuses the existing `subscribeContacts`/`subscribeStages`/`subscribeActivities` data layer as-is; added a new pure, unit-tested `packages/core/src/search.ts`. Deliberately trims web's four result groups to two and four quick actions to two — Conversations (needs a new `subscribeInteractions`) and Coordination Notes (needs a new `subscribeBoardNotes`, points at the unstarted Phase 4 Board) are deferred, as are "Log a visit" and "The Journey" (no mobile destinations yet). Verified live against all four e2e role users on Expo web.
- **Mobile Phase 3 — Feedback (submit + admin review), live end-to-end.** Built two native screens in `apps/mobile`: "Leave a note" (`/feedback`, reachable by any signed-in role) porting the web app's `SubmitFeedback.tsx` kind-picker + message form, and "Notes from the team" (`/feedback-admin`, admin-only) porting `FeedbackList.tsx`'s review list — kind/status/archived filter pills, free-text search, per-note status cycling, archive toggle, and delete, plus a "View GitHub issue" link for notes that already have one. Unlike the web app (which posts through an Express `/api/feedback` server route using the Admin SDK, with browser-only `html2canvas` screenshot capture and best-effort GitHub issue creation), the mobile port writes directly to Firestore — the existing `feedback` collection rules already permit everything it needs (self-attested `create` via `isApprovedUser()`, admin-only `update`/`delete`/`list`), so no rules changes were required. Screenshot capture and GitHub issue creation/auto-creation are deliberately deferred (no clean mobile equivalent / needs server-side secrets). Added a new pure, unit-tested `packages/core/src/feedback.ts` (kind metadata, `kindToType`/`typeToKind`, and `filterFeedback`) and `packages/core/src/data/feedback.ts` (the Firestore layer); submitting also logs the activity and self-notifies, matching web's `SubmitFeedback.tsx` and surfacing new notes in the already-shipped History screen. Verified live against the e2e Full-timer (admin) and Student (operator) users on Expo web: submit, status change, archive, and the admin-only gating (both the "More" entry point and a direct-URL guard on the screen itself).
- **Mobile Phase 3 — SignUp (public welcome form), live end-to-end.** Built the native SignUp screen in `apps/mobile`, porting the web app's public `/signup` lead-intake form (name/contact/interests/prayer request → a `contacts` doc + a best-effort admin notification). Kept it a genuinely public route rather than folding it into an authenticated "quick add" flow: `apps/mobile/app/_layout.tsx`'s sign-out redirect now exempts `/signup` (alongside `/login`), matching the web app where this route sits outside `<ProtectedRoute>` — Firestore rules already allow the unauthenticated writes it needs, so no rules changes were required. Added two in-app entry points (mobile has no address bar and no Global Search yet): a "New here?" link on the login screen, and a "Welcome form" card on "More". Added a new pure, unit-tested `packages/core/src/signup.ts` (form validation, the anti-abuse math-challenge check, and the intake option constants) and `packages/core/src/data/signup.ts` (the Firestore write) — deliberately separate from `data/contacts.ts`'s `addContact`, since that assumes an authenticated creator this anonymous public flow doesn't have. Also corrects a stale `MIGRATION.md` note: the web app has no phone verification anywhere (phone is a plain, unverified text field), so there was never an RN Firebase-Auth blocker here.
- **Disaster recovery: daily Firestore backups.** Enabled a native Firestore backup schedule on the production database (`sac-campus-hub`, database `ai-studio-43298cca-4d70-4c5d-bada-c10ab66ab897`) — daily automated snapshots with 30-day retention, managed entirely by GCP. Documented in `GCLOUD_DEPLOYMENT.md`.
- **Mobile Phase 3 — Notifications, live end-to-end.** Built the native Notifications screen in `apps/mobile` ("What's stirring"), porting the web app's header bell/dropdown (`NotificationCenter.tsx`) as a pushed route reached from "More" instead — mobile has no persistent app-shell header today. Merges the personal + broadcast (`ALL_ADMINS`) Firestore streams into "Worth a look"/"Earlier" sections, with mark-as-read, mark-all-read, and per-row set-aside (hard-delete for personal, per-user dismiss for broadcast). Added a new pure, unit-tested `packages/core/src/notifications.ts` (tone mapping, merge/sort/slice, unread/read grouping) and `packages/core/src/data/notifications.ts` (the Firestore layer; the write side, `sendNotification`, already existed on mobile). "More" now shows a live unread-count badge on the Notifications entry. Also widened `firestore.rules`' notification `update` rule — it previously only allowed `hasOnly(['read'])`, but both `markAsRead` (writes `read`+`readBy`) and set-aside-on-broadcast (writes `dismissedBy`) touch other fields, so non-manager roles got a silent `permission-denied` on those actions on web too; now allows `hasOnly(['read','readBy'])` (personal) and `hasOnly(['read','readBy','dismissedBy'])` (broadcast). Added a matching `Notifications` block to `src/test/firestore.rules.test.ts` (emulator-gated, runs in the rules-deploy CI workflow).
- **Mobile Phase 3 — Gatherings ("Attendance") screen, live end-to-end.** Built the native Gatherings screen in `apps/mobile`, faithfully porting the web app's already-shipped `AttendanceMobile.tsx` design: hero stats, "who we've missed", a type-filterable "when we met" session list with a tap-to-mark roster sheet (present → late → absent → present), and a read-only "coming up" list with live RSVP counts. This also fixes two dead links — the Student/Community landings' "Full calendar" button and the "Gatherings" entry in More both `router.push('/attendance')`'d to a route that didn't exist yet. Added `packages/core/src/attendance.ts` (pure, unit-tested `here`/`cycleAttendanceStatus`/`sessionsNewestFirst`/`whoWeMissed`/`avgAttendance`, ported from `src/views/Attendance.tsx`) plus new `data/attendance.ts`, `data/events.ts`, and `data/gatheringTypes.ts`, and `subscribeEventRsvps` on the existing `data/rsvp.ts`. Deliberately tightens one behavior vs. the web app: the roster's tap-to-cycle is gated client-side to Student role and above (`hasMinRole(role, 'operator')`), since the web UI exposes it to every role that can reach the screen while Firestore rules silently reject the write from a Community (viewer) role. Out of scope for this pass: logging/editing/deleting a gathering, managing gathering kinds, and the Google Sheets sync — all admin-only desktop tooling, left for a later pass.
- **Mobile Phase 2 — Landing dispatcher (role-based Home), live end-to-end.** The Home tab now dispatches by role, matching the web app's `Landing.tsx`: Trainees see a cockpit-lite (their full-timer's flagged nudges/questions under "What's waiting on you", the students they've brought in sorted longest-since-seen with a "weighed in"/"awaiting a look" status, and the prayers they're holding); Students see upcoming gatherings with an RSVP toggle plus a contact-free "Pray for your friends" prayer list; Community members see the same RSVP'able gatherings plus a "Reach out" card naming the lead Full-timer (opens email — Messages/chat is a separate, unstarted phase, so this intentionally doesn't write a `chatRooms` doc). Full-timers are unaffected (My Day, now `MyDayScreen.tsx`, was extracted verbatim so the route could become a thin `pickLandingForRole` switch). Added `pickLandingForRole` to `packages/core/src/permissions.ts`; a new `packages/core/src/landing.ts` (`traineeMyPeople`, `weighedInContactIds`) for the Trainee-specific derivations; a new `packages/core/src/rsvp.ts` + `data/rsvp.ts` (porting the web app's `lib/rsvp.ts` event-RSVP read/write) shared by Student and Community; and a new `data/users.ts` (`subscribeFullTimers`) for Community's roster. Verified live against all four e2e role users on Expo web, including the Community (viewer) role's Home tab for the first time on mobile.
- **Mobile Phase 2 — Quick Add (new contact), live end-to-end.** People (Directory) now has an "Add someone" header button (hidden from the Community/viewer role, matching the web app's gate) that opens a bottom sheet to create a new contact — name, contact group, location, email, phone (formatted/validated on blur), pipeline stage, tags, spiritual background, and notes. Ported the web app's `NewContactModal` behavior: the contact is stamped with the active season's cohort tag (e.g. "Fall '26", plus "Club Rush" during intake), the creator gets a confirmation notification, their full-timer is pinged if they're a trainee, and the creation is logged as an activity — so new mobile-created contacts now show up in the already-shipped History ("Looking back") screen. Added `addContact` to `packages/core/src/data/contacts.ts` and a new `packages/core/src/data/seasons.ts` (`subscribeSeasonSettings`, re-homing the season Firestore read mobile needed but didn't have yet), both following the existing "core takes `db` + an injected notify callback" pattern from Phase 1.
- **Mobile Phase 2 — Answered screen, live end-to-end.** Built the native Answered screen in `apps/mobile`: a read-only wall of the prayers the team has marked answered, grouped into "Recent answers" (last 90 days) and "Earlier this year", with an "answered this year" stat. Ported the web app's shipped `AnsweredList.tsx` behavior rather than the design tool's unbuilt photo-wall/featured-hero concept, as a single-column vertical stack (the design already collapses to one column at phone width, so no masonry layout was needed). Added a new pure, unit-tested `groupAnsweredPrayers`/`toneForAnsweredId` in `packages/core/src/answered.ts`, reusing the existing `subscribeAllPrayers`/`subscribeContacts` data layer. Pushed route reached from "More", following History's back-nav pattern.
- **Mobile Phase 2 — History ("Looking back") screen, live end-to-end.** Built the native History screen in `apps/mobile`, faithfully porting the web app's already-shipped `HistoryMobile.tsx` design: a compact hero with moment/people counts, a "Filter history" button with live active-filter chips, and an unbroken day-grouped timeline with human-readable activity copy. Filtering is a bottom sheet with kind-of-moment and team-member pill groups (RN has no native `<select>`). This is the first pushed (non-tab) route in the mobile app, reached from the "More" screen and using a new back-button pattern. Added `subscribeActivities` to a new `packages/core/src/data/activities.ts`, and pure, unit-tested `humanize`/`dayInfo`/`buildHistoryRows` helpers in a new `packages/core/src/history.ts` (icon selection is left to each platform's UI layer, since the shared package can't depend on `lucide-react` or `@expo/vector-icons`). Verified live against real Firestore data as the e2e Trainee (manager) user on Expo web (filtering, chip clearing, back navigation, both themes), and confirmed the screen is correctly hidden from the e2e Student (operator) user.
- **Mobile Phase 2 — People (Directory) tab, live end-to-end.** Built the native People screen in `apps/mobile` (replacing the placeholder): search, stage-filter pills with live counts, and a contact list (avatar, name, stage chip, year/major, overdue-toned "last connected" line) sorted longest-since-touched first. Added `subscribeContacts`, `subscribeStages`, and `subscribeTouches` to a new `packages/core/src/data/contacts.ts`, and a new pure, unit-tested `filterAndSortDirectory` helper in `packages/core/src/directory.ts` that reuses My Day's existing last-touch/days-since machinery. Verified live against real Firestore data on Expo web (search, stage filters, sort order, both themes, mobile viewport).
- **Mobile Phase 2 — Prayer tab, live end-to-end.** Built the native "On our hearts" Prayer screen in `apps/mobile` (replacing the placeholder): a "Hold someone in prayer" bottom sheet (search + add), and a per-contact card grouping each person's prayers into this week / last week (always shown, nudged when unmarked) / earlier (folded, capped). Reuses My Day's status-segment, answered-testimony, and burden-edit UI. Added `subscribeAllPrayers`, `addPrayer`, and `updatePrayerBurden` to `packages/core/src/data/prayers.ts` (legacy-doc normalization included) and a new pure, unit-tested `groupPrayerThread` helper in `packages/core/src/prayerThread.ts` shared by both platforms' week-grouping logic. Verified live against the e2e Full-timer user on Expo web (both themes).
- **Mobile Phase 1 — shared data layer + role-gated nav.** Re-homed My Day's Firestore CRUD/subscriptions (tasks, prayers, personal prayers, user preferences, walking-together threads) from `apps/mobile/src/lib/data/` into `packages/core/src/data/`, behind an injected `Firestore` handle, so web and mobile can share one implementation; the mobile files are now thin wrappers supplying `db` + error handling. Added `canAccessRoute`-based gating to the mobile bottom tabs (People/Journey drop out of the tab bar for roles below their `NAV_ITEMS` minRole) and to the "More" screen's destination list.
- **Undo snackbar on archiving prayers.** Added a floating, auto-dismissing Undo snackbar to the **My Day** dashboard (desktop and mobile) when archiving personal or corporate prayers. Consolidated the UI into a reusable `UndoSnackbar` component.
- **Mobile My Day, live end-to-end.** Built the native My Day cockpit in `apps/mobile` (Expo/React Native): hero, relational nudge, "From the team" inbox (with encourage/remind/scan actions), tasks with inline add/edit, "Your sheep", "Your week", "Your prayers" (with answered-testimony composer), a figures footer, and a contacts-picker bottom sheet — reading and writing real Firestore data. Added a minimal mobile `AuthProvider` + email/password login screen, gated by a redirect in `app/_layout.tsx`. Extracted the pure My Day derivations (leaders, stale-leader, task/prayer splits, this-week, due-date presets) into `packages/core/src/myday.ts` with unit tests, so web and mobile share one behavior oracle. Bottom tabs now match the mobile design's shell (Home · People · Log · Journey · Prayer · More).

### Fixed
- Fixed a mobile access-control gap: `(tabs)/_layout.tsx`'s `href: canAccessRoute(...) ? undefined : null` only hides a gated tab bar entry — it doesn't stop a direct URL/deep link from rendering the screen. Added the same in-screen `canAccessRoute` guard `feedback-admin.tsx` already used to `(tabs)/journey.tsx` ('/board', manager+) and, on the "More"-only routes, `(tabs)/people.tsx` ('/directory', operator+) and `history.tsx` ('/history', manager+). `contacts` and `activities` Firestore rules allow any *approved* user to read/list regardless of role, so People and History were a genuine under-role data leak, not just a UX gap; Journey has no live data yet (Phase 4), so this closes the gap pre-emptively. Verified live on Expo web as the e2e Student (operator) user: `/journey` and `/history` now show a lock screen, `/people` still renders normally.
- Fixed `humanize()` mislabeling attendance-cycling activity as the generic fallback instead of "Gatherings" in both `packages/core/src/history.ts` and the web app's own `src/views/History.tsx`: their prefix check expected `updated attendance for event`, but the actual write path (web `Attendance.tsx` and mobile `cycleAttendance`) logs `updated attendance for "<event name>" to <status> for`. Updated both checks and their tests to match the real format.
- Fixed a mobile cold-sign-in crash: `useMyDayData`'s Firestore subscriptions fired on mount regardless of auth state, so on the first render right after sign-in (before `uid` was set) they'd hit `permission-denied` and the resulting throw from `handleFirestoreError` inside an `onSnapshot` error callback crashed the My Day tree, bouncing the user back to the login screen. The team-data effect now waits for `uid` before subscribing, and its load-error path no longer rethrows (it already sets `error` state).
- Wired up the "The board" / "Pray together" quick-action buttons in the My Day mobile hero (`MyDayMobile.tsx`) — the CSS and icons had shipped in Mobile Redesign Phase 1 but the buttons were never added to the markup, so they never rendered.
- Fixed Vitest timeouts and test failures in `AnsweredList.test.tsx` by correcting the Firestore mock and date formatting assertions, and expanded coverage in `gatheringTypes.test.ts` to satisfy global statements and branches coverage thresholds.

### Security
- Closed several unauthenticated Express API endpoints found in a repo-wide security audit: `/api/webhook/logs` and `/api/analyze-notes` now require a verified Firebase ID token belonging to an admin (matching their existing admin-only client-side gating); `/api/quick-add` now derives the attributed user from a verified token when one is supplied instead of trusting a client-supplied `userId`/`userName` (falling back to a generic "External Automation" label for unauthenticated automation callers like curl/Shortcuts, preserving that use case). Added Twilio request-signature verification (`TWILIO_AUTH_TOKEN`) for `/api/webhook/sms` and an optional group allow-list (`GROUPME_GROUP_ID`) for `/api/webhook/groupme`, both no-ops until configured. New `src/lib/twilioVerify.ts` + unit tests.

### Added
- **Mobile Redesign Phase 1**: Built a dedicated mobile structure aligning with the target design files for the "My Day" screen (Dashboard). Added `MyDayMobile.tsx` to display mobile-native vertical layouts for hero greeting, inbox, people list with quick actions, events, and prayers. Introduced `useMediaQuery` in `MyDay.tsx` to conditionally render the mobile view for devices under 768px. Updated `MobileNav.tsx` to match the exact 5-tab plus center FAB (Log a moment) layout and active tab styling.
- **Session 7 — Answered page, testimonies & terminology updates.** Implemented terminology updates globally (carry -> hold, walking -> caring for). Added answered prayer testimonies: corporate and personal prayers now support an optional `answer` body and `answeredAt` date, with an inline text area popping up when marked answered. Built a keepsake masonry page at `/answered` to archive answered prayers by time group, with deterministic card color tones and a toggle header. Adjusted the notification bell badge alignment.
- Wired up ESLint (flat config, `eslint.config.js`) covering TS/TSX (`@typescript-eslint`), React hooks (`eslint-plugin-react-hooks`), and `firestore.rules` (`@firebase/eslint-plugin-security-rules`, already a devDependency but never configured). `npm run lint` now runs ESLint; type-checking moved to a new `npm run typecheck` script. CI now runs typecheck, lint, tests, and `npm run build`.
- Added the missing `activities` composite Firestore index (`targetId` + `createdAt`) so the contact Activity tab's query — which needs it — stops depending on it having been created out-of-band; the rules-deploy CI workflow now also deploys `firestore.indexes.json`.
- **Session 5 — Gatherings: managed kinds + edit a gathering.** The "kinds of gathering" (Weekly / Small Group / …) are now a **managed, team-shared list** instead of hard-coded constants: a new `gatheringTypes` Firestore collection (with a warm one-line blurb each, auto-seeded with the four classic kinds, mirroring the `stages` taxonomy) drives the type pills on **Log a gathering** and the filter pills on **Gatherings**. A **"Manage kinds"** modal lets Full-timers create / rename / remove kinds — and renaming a kind remaps every past gathering carrying the old name. Each gathering can now be **edited** (name / kind / date / location) via a new edit modal, alongside the existing delete. New `src/lib/gatheringTypes.ts`, `ManageGatheringTypesModal`, `EditEventModal`, and a `gatheringTypes` Firestore rules block (read by approved users, write by managers). Recurrence already existed and is unchanged.
- **Session 6 — Club rush + seasons.** A **season** (Spring / Summer / Fall / Winter + year) is auto-derived from today's date and surfaced as a **"Spring · '26"** strip under the brand in the sidebar. Staff (managers+) can open it to **override the active season** or toggle **Club rush** intake; both live in a team-wide, publicly-readable `settings/season` doc so the public sign-up reflects them. New sign-ups — from both the public **Sign-up** form and **Quick Add** — are now stamped with the season cohort tag (e.g. `Fall '26`, plus `Club Rush` during intake) so a whole cohort is findable later. New `src/lib/seasons.ts`, a `SeasonChip` shell component, and a `settings/{docId}` Firestore rules block. No new contact field — the cohort lives in the existing `tags`.
- Opened **The Board (Coordination Notes) to Trainees and Students**, read-mostly. Each page now carries an **audience** (`team` / `trainees` / `everyone`); Full-timers see every page (and pick a page's audience from its header), Trainees see `trainees` + `everyone`, Students see only `everyone`, and Community is unchanged (no Board). Non-Full-timers get a clean read-only render (react-markdown, no live editor) with the team to-dos hidden and the Notes & learnings archive limited to Full-timers + Trainees. Visibility is enforced in Firestore rules (role-scoped `board_docs` reads + `board_notes` limited to managers) and gated in the nav/route. New `audience` helpers in `src/lib/board.ts`; a demo seed at `scripts/seed-board-audience-demo.ts`.
- Added **Save to archive** on an open Board page — promote it into the Notes & learnings archive prefilled with its title, an excerpt, and a guessed series — plus distinct **New record / New learning** buttons to create an entry from scratch.
- Added **Walking-together threads** — a lightweight conversation between a trainee and the full-timer walking with them, attached to a contact and (optionally) to one logged interaction. New Firestore-backed `contacts/{id}/threads` subcollection with five message kinds (note / question / comment / encouragement / nudge) and per-message reactions; a reusable `<Thread>` component reusing the History/notification tonal-node look; a **"Walking with {trainee}"** tab on the contact profile (with a live message count) plus a **"Walk through this together"** toggle that expands an inline thread under each interaction. The compose kinds shift by who's viewing (trainee vs. full-timer). Also added the data layer for the upcoming My Day inbox: a full-timer↔trainee relationship config (`FT_TRAINEES`/`FT_OF`), a per-user localStorage inbox read-state store, an `inboxItemsFor` feed derivation, a `reviewed` flag on contacts, and matching Firestore rules. No "mentor" language anywhere.
- Made the home route (`/`) a **role-based landing**: Full-timers get the **My Day** cockpit, while Trainees (your caseload + the prayers you're carrying), Students (upcoming gatherings + friends to pray for), and Community members (open gatherings + a way to reach a Full-timer) each get a tailored home. Built real **event RSVP** (`events/{eventId}/rsvps/{uid}`, with a `setRsvp`/`subscribeEventRsvps`/`subscribeMyRsvps` lib and matching Firestore rules) — members RSVP from their landing and staff see a read-only "going" count on the Attendance "Coming up" list. Community "Reach out" opens a direct message to a Full-timer (with a `mailto:` fallback). Extracted the shared My Day building blocks (avatar, stage chip, section head, prayer rows, reach card, personal-prayer composer) into `src/components/landing/` for reuse.
- Reworked the **My Day** page to the updated design: two-tier to-dos (read-only "Assigned to you" team to-dos with a "From [doc]" tap-through vs. fully-editable personal tasks, plus an inline composer); a "Your contacts" picker persisted to a new `userPreferences/{uid}` doc; corporate-prayer status controls (with a "→ Prayer Log" link) plus private, fully-editable personal prayers (new `users/{uid}/personalPrayers` collection) that can be optionally tagged to a contact; an SMS/Google-Messages "Message" contact action; and a richer "Your week" featured card. Added Firestore rules for the two new per-user collections.
- Expanded unit-test coverage for core components and views, targeting `ContactDetailsModal.tsx` (blur validation, contact edit/delete, comment replies, and history), `Sidebar.tsx`, `Directory.tsx`, and `PrayerList.tsx` to cover async state changes and lifecycle events. Ratcheted the Vitest coverage thresholds to the new baselines (83% lines, 81% statements, 75% functions, 69% branches) to prevent regressions.
- Enforced unit-test coverage thresholds in CI by adding pragmatic exclusions, improving test coverage of views/modals (e.g. `Attendance`, `SignUp`, and `AddEventModal`), and ratcheting the Vitest thresholds to the new baseline (~79.5% lines) (#62).
- Unit test coverage for layout and modal components: `App`, `TopBar`, `NotificationCenter`, `AddEventModal`, `LogInteractionModal`, `SyncSheetModal`, and `ContactDetailsModal`, boosting overall line coverage to over 74% (#61).
- Unit test coverage for core views: `Directory`, `PrayerList`, `Attendance`, `History`, `SignUp`, and `FeedbackList`, boosting overall line coverage from ~39% to over 50% (#59).
- Unit test coverage for large views: `Settings` (Quick Add, Webhook console logs, role & membership updates) and `OutreachBoard` (stage creation, edits, deletion), boosting overall line coverage to over 63% (#60).
- `CHANGELOG.md` — distilled project history backfilled from git/PR log.

### Changed
- Widened the Full-timer's My Day inbox from a single trainee to the **whole team**: it now surfaces new contacts, logged interactions, and unanswered questions from everyone except the Full-timer, retitled **"From the team"** with a calm-by-default collapse ("Show N earlier" / "Show less"). Also dropped the phrase **"walking with" / "walking together"** from the UI — the contact thread tab is now **"Alongside"**, and people-summary copy reads "in your care" / "caring for".
- Removed the stale in-repo `docs/design/project` "Field Notes" design bundle; the design source now lives in the external Claude Design handoff zip, so the repo no longer carries a duplicate that drifts out of date.
- Removed the generic **"Today"** dashboard and the separate admin-only `/my-day`
  route in favor of the single role-based home at `/` (My Day is now served at
  `/` for Full-timers). The home nav item is role-aware ("My Day" for Full-timers,
  "Home" otherwise).
- Reskinned the feedback FAB + `/feedback` page to the warm Field Notes "Leave a
  note" panel — four note kinds (A thought / An idea / Something's off / A
  request), ⌘↵ to send, persona footer, and a "We got your note." success state.
  Kinds are now stored (new `kind` field) and surfaced in the admin feedback
  inbox; existing submissions fall back to their `type` (#21).
- `CLAUDE.md` is now gitignored, and the worktree-sync hook mirrors it into git
  worktrees on session start so project instructions follow each worktree (#39).

### Fixed
- The contact Activity tab now surfaces a load error the same way the other tabs do (`handleFirestoreError`) instead of only logging to console, so a missing-index or permission failure is no longer silent.
- The Board's Markdown formatting toolbar no longer disappears when scrolling a
  long page: the editor workspace now has a bounded height on desktop
  (`lg:h-[calc(100vh-6rem)]` + `lg:grid-rows-1`), so the page list and document
  canvas scroll internally and the `sticky` toolbar stays pinned (#65).
- Vitest configuration to exclude `.claude/**` subagent worktrees, preventing test suite conflicts.
- Mocking setup in `OutreachBoard` tests to prevent loading real Firebase RTDB services under unit tests.
- The Board live collaboration no longer fails with RTDB `permission_denied`:
  broadened the `board_docs_rtdb` rule to any signed-in, email-verified user
  (the previous rule required an `admin` custom claim the app never sets, so
  Firestore-role admins were denied), and added CI auto-deploy for
  `database.rules.json` so RTDB rule changes actually reach the live project.

## [2026-06] — Field Notes design system, RBAC & CI

### Added
- **Mobile Redesign Phase 1**: Built a dedicated mobile structure aligning with the target design files for the "My Day" screen (Dashboard). Added `MyDayMobile.tsx` to display mobile-native vertical layouts for hero greeting, inbox, people list with quick actions, events, and prayers. Introduced `useMediaQuery` in `MyDay.tsx` to conditionally render the mobile view for devices under 768px. Updated `MobileNav.tsx` to match the exact 5-tab plus center FAB (Log a moment) layout and active tab styling.
- Role-based access control enforced across routes and navigation (#3).
- CI workflow with a 90% test coverage threshold (#6).
- Coordination notes collection with Markdown editing and archive support.
- Global ⌘K search with a unified command palette (#37).
- "My Day" full-timer cockpit view (#36).
- Notifications "What's stirring" view (#38).
- PR Agent workflow and CODEOWNERS.

### Changed
- "Field Notes" warm design reskin rolled out across every surface: foundation
  tokens & fonts (#25), app shell / sidebar / nav relabel (#26), Today/Dashboard
  (#27), The Journey/Outreach Board (#28), People (#31), Gatherings/Attendance
  (#33), Prayer (#32), Looking Back/History (#34), and Settings (#35).
- Restored RBAC / CI / E2E setup after an AI Studio regeneration (#23).

## [2026-05] — Productionization, AI & integrations

### Added
- **Mobile Redesign Phase 1**: Built a dedicated mobile structure aligning with the target design files for the "My Day" screen (Dashboard). Added `MyDayMobile.tsx` to display mobile-native vertical layouts for hero greeting, inbox, people list with quick actions, events, and prayers. Introduced `useMediaQuery` in `MyDay.tsx` to conditionally render the mobile view for devices under 768px. Updated `MobileNav.tsx` to match the exact 5-tab plus center FAB (Log a moment) layout and active tab styling.
- User feedback system, with the feedback list surfaced in Settings.
- Server-side Gemini processing with a webhook proxy and logging system.
- Serverless functions bundled into the build and Docker image.
- AI-powered interaction parsing.
- GroupMe bot parsing cheat sheet in Settings.
- Google Sheets integration and attendance export (with dry-run summary).
- Prayer tracking feature.
- Notifications collection and Firestore rules.
- Signup enhancements: residence hall and spiritual-background fields,
  client-side validation, and anti-bot measures.
- Theming, skeleton loading states, and an ErrorBoundary component.

### Changed
- Renamed the app to **CISA Campus Work Tracker**.
- Reworked activity/interaction tracking and added nested comments.
- Added AI-powered activity summarization on the dashboard.

### Fixed
- Standardized date formatting with date-fns.

## [2026-04] — Foundation & core CRM

### Added
- **Mobile Redesign Phase 1**: Built a dedicated mobile structure aligning with the target design files for the "My Day" screen (Dashboard). Added `MyDayMobile.tsx` to display mobile-native vertical layouts for hero greeting, inbox, people list with quick actions, events, and prayers. Introduced `useMediaQuery` in `MyDay.tsx` to conditionally render the mobile view for devices under 768px. Updated `MobileNav.tsx` to match the exact 5-tab plus center FAB (Log a moment) layout and active tab styling.
- Firebase authentication with user approval and admin access control.
- PWA features and mobile navigation.
- Collapsible sidebar with persisted state.
- Contact directory and New Contact modal with configurable workflow stages.
- Outreach Board (Kanban) with drag-and-drop between stages.
- Events collection with recurring events and a reusable DatePicker.
- User roles & permissions, an invitation system, and Firestore security rules.
- Real-time dashboard with metrics and a time-based greeting.
- System activity logging.

### Changed
- Branding evolved from OutreachPro to CampusHub.
