# Mobile migration — React Native + Expo

Living status + roadmap for moving the CISA Campus Work Tracker from a React web
app to a **React Native + Expo** app for iOS, Android, and (eventually) web.

- **Decision:** React Native + Expo, not Flutter — keeps TypeScript/React, reuses
  business logic and the React-authored design. (Full rationale in the plan file
  `~/.claude/plans/use-the-claude-design-mcp-structured-sparrow.md`.)
- **No SEO required** (closed app). This means we can consolidate onto **one
  codebase** (RN/Expo serving web too) and retire the old web app at parity —
  there's no need to preserve a separate SEO-friendly web surface.

---

## Does the existing app still work? — Yes

The migration is **purely additive**. The only existing file changed is
`.claude/launch.json` (added a `mobile-web` run config). No web app source
(`src/`, `server.ts`, `functions/`, `vite.config.ts`, `index.html`, root
`package.json`) was touched. The desktop site and the responsive mobile web app
build, deploy, and behave exactly as before. Everything new lives in `apps/` and
`packages/`.

## What React Native changes (and doesn't)

| | Before | After |
|---|---|---|
| Business logic / types / permissions | in `src/lib` | shared once in `packages/core` (web + mobile) |
| Mobile UI | HTML + Tailwind, responsive web | RN primitives (`View`/`Text`/`StyleSheet`) |
| Build tool (mobile) | Vite | Metro / Expo |
| Distribution | URL only | App Store + Play Store via Expo EAS (+ OTA updates) |
| "Native feel" | simulated (safe-area/back-gesture/hover hacks) | real OS behavior |
| Browser-only APIs | localStorage, popup auth, html2canvas, clipboard | AsyncStorage, native Google Sign-In, view-shot, expo-clipboard |

**Nothing is removed today.** The native app grows alongside the web app; once it
reaches parity you can point web users at the Expo web build and retire the old
React app (Phase 6).

---

## Repo layout

```
/ (repo root = existing React web app, UNCHANGED)
├── src/, server.ts, functions/, firestore.rules, ...   ← web app + backend
├── packages/core/     ← NEW shared TS (types, permissions, board, inbox, …) + tests
└── apps/mobile/       ← NEW Expo (React Native) app  ← the deliverable
```

`apps/mobile` is intentionally **not** an npm workspace (the web app is on React
19, Expo on React 18.3 — hoisting would clash). It has its own `node_modules` and
resolves `@cisa/core` via a Metro alias + a tsconfig path. See
[apps/mobile/SETUP.md](apps/mobile/SETUP.md).

## How to run

```bash
# Existing web app (unchanged)
npm run dev

# Shared logic tests (the behavior oracle for the port)
cd packages/core && npm install && npm test        # 90 tests

# Mobile app
cd apps/mobile && npm install
# Set EXPO_PUBLIC_FIREBASE_API_KEY in apps/mobile/.env (see .env.example) for a
# live login — copy the value from the root .env's VITE_FIREBASE_API_KEY.
npx expo start            # i = iOS sim, a = Android emu, w = web, or scan w/ Expo Go
npx expo start --web      # fastest to eyeball; launch.json config "mobile-web" (:8081)
```

---

## Status

### ✅ Phase 0 — Foundations (DONE, verified on Expo web)
- `packages/core`: types, `permissions` (+`NAV_ITEMS`), `board`, `inbox`,
  `walking`, `seasons` (pure), `threads` (pure), `utils`. **Typecheck clean +
  27/27 unit tests.**
- `apps/mobile`: Expo SDK 52 + expo-router; self-contained; `@cisa/core` via Metro
  alias.
- Theme (`src/theme/`): light+dark ported from the web Material tokens; warm
  "Field notes" palette; follows OS color scheme.
- Primitives (`src/components/ui/`): Screen, AppText, Button, Card, Chip, Avatar,
  SectionHead, StatusPill.
- Nav shell: bottom tabs driven by shared `NAV_ITEMS`.
- Firebase RN init (`src/lib/firebase.ts`): `getAuth` auto-persistence (v12
  removed `getReactNativePersistence`), named Firestore db id, opt-in RTDB.
- **Verified:** clean web build (1405 modules, 0 console errors), both themes,
  working tab navigation, shared core consumed live (season label, NAV_ITEMS,
  roleLabel).

---

## Remaining work

### 🔲 Phase 0.5 — De-risking spikes (no longer blocking Phase 2 — see "How to
proceed"; these are ordinary Firestore CRUD screens with no editor/WebView
involved, so screen-porting can continue in parallel)
- [ ] **Collab editor in a WebView** — host the existing web TipTap/Yjs editor in
      `react-native-webview`, pass doc id + auth token, confirm Yjs/RTDB sync on a
      device. This is the top technical risk and gates Phase 4. **Scoped**: the
      web `DocEditor` is a nested, unexported component inside
      `src/views/CoordinationNotes.tsx` (~2791 lines) sharing code with the
      parent screen — it needs to be extracted into a standalone bundle a
      WebView can load (bridged via `postMessage` for doc id/auth token)
      before the Yjs↔RTDB sync (`src/lib/yjsRtdbProvider.ts`'s
      `RtdbYjsProvider`, path `board_docs_rtdb/{docId}`) can even be tested.
      `react-native-webview` is already installed in `apps/mobile` (13.12.5),
      but there's no Board/Coordination-notes route stub yet. This machine has
      iOS simulators available locally (`xcrun simctl list devices`) for the
      on-device verification step; no Android emulator/`adb`.
- [ ] **Native Google Sign-In** — `@react-native-google-signin` +
      `signInWithCredential` (popup sign-in doesn't exist in RN). Recovers the
      Sheets `spreadsheets.readonly` token too. **Less blocked than it looks**:
      `gcloud`/`firebase` CLI are already authenticated in this environment
      (account `yilongwang05@gmail.com`, project `sac-campus-hub` — confirmed
      via `.firebaserc`/`firebase.json`). `firebase apps:list --project
      sac-campus-hub` shows only one app today (`ai-studio-applet-webapp`,
      WEB) — no iOS/Android app registered, no `GoogleService-Info.plist`/
      `google-services.json` in the repo. Registering the iOS/Android apps for
      `com.cisa.campus` (already set in `apps/mobile/app.json`) via `firebase
      apps:create`/`apps:sdkconfig` is CLI-doable — **but is a
      permission-required action** (creates persistent config in a live
      Firebase project), so confirm with the user before running it. Still
      unverified: whether enabling the Google sign-in provider itself
      (Firebase Auth → Sign-in method → Google) and registering the Android
      OAuth client's SHA-1 can also be done via CLI, or needs one manual
      console toggle.
- [ ] **Fonts** — bundle Newsreader + Hanken Grotesk via
      `@expo-google-fonts/*`, load in `app/_layout.tsx` (currently system
      fallback).
- [x] **Firebase API key guard** (PR #115 review comment) — a dev `console.warn`
      now fires from `apps/mobile/src/lib/firebase.ts` when the resolved API key
      is empty, so the failure mode is obvious.

### ✅ My Day cockpit — DONE, verified live (Phase 1 auth slice + Phase 3 screen)
Landed ahead of the phase order below because it's the flagship home screen and
forces the two real prerequisites (auth + live data) through one concrete path.
- `packages/core/src/myday.ts` — the pure derivations (leaders/stale-leader,
  task + prayer splits, this-week, due-date presets) ported from
  `src/views/MyDay.tsx` + `src/lib/todos.ts`, **unit-tested** (packages/core is
  now 49/49 tests). Shared behavior oracle for web + mobile.
- `apps/mobile/src/lib/AuthProvider.tsx` + `app/login.tsx` — minimal email/
  password auth (no invitation/auto-provisioning — e2e users already have
  `/users/{uid}` docs), gated by a `<Redirect>` in `app/_layout.tsx`.
- `apps/mobile/src/lib/useMyDayData.ts` + `src/lib/data/*` — live Firestore
  subscriptions (contacts/stages/events/prayers/tasks/personalPrayers/threads +
  interactions+comments collection-groups for last-touch) and writes, mirroring
  the web's `MyDay.tsx`/`lib/*` modules.
- `apps/mobile/app/(tabs)/index.tsx` + `src/components/myday/*` — the full
  screen: hero, relational nudge, "From the team" inbox (scan/encourage/remind,
  AsyncStorage-backed read-state), tasks (add/edit/complete/delete), your sheep,
  your week, your prayers (status + answered-testimony composer), figures
  footer, contacts picker sheet.
- Bottom tabs re-aligned to the design's mobile shell: Home · People · Log ·
  Journey · Prayer · More (Journey + Log are placeholder screens).
- **Verified live** on Expo web (both themes, mobile viewport): logged in as
  the e2e Full-timer, real Firestore data rendered (13 real "From the team"
  items), scan/mark-read persisted through a reload, zero console errors.
- **Not yet done** (as of this writing): the *web* app's own Firestore modules
  (`rsvp`, `gatheringTypes`, `seasons` hooks, `services/chat`, and web's
  separate copies of `threads`/`todos`/`prayers`/`personalPrayers`/
  `userPreferences`) still have their own implementations — only My Day's
  mobile-side modules have been generalized so far (see Phase 1 below).

### ✅ Phase 1 — Share the data layer (My Day's slice DONE)
- [x] Re-homed My Day's Firestore CRUD/subscriptions — `threads` (the
      `subscribeAllThreads`/`addThreadMessage` subset), `todos`, `prayers`,
      `personalPrayers`, `userPreferences` — into `packages/core/src/data/`
      behind an injected `db: Firestore` handle. `apps/mobile/src/lib/data/*.ts`
      are now thin wrappers (mobile `db` + `handleFirestoreError`);
      `useMyDayData.ts` and every screen were untouched (same external API).
      `addThreadMessage` takes an `onNotify` callback so the mobile-specific
      push write (`sendNotification`) stays out of the shared module.
  - [ ] Still open: `gatheringTypes`, `seasons` hooks (partially — see the
        Quick Add entry below), `services/chat`, and re-pointing the *web*
        app's own copies of the re-homed modules at the shared
        `packages/core/src/data/` versions (today only mobile consumes
        them — web's `src/lib/*.ts` are unchanged). `rsvp` is now re-homed
        too (`packages/core/src/rsvp.ts` + `data/rsvp.ts` — see the Landing
        dispatcher entry in Phase 2).
- [x] Gated the tabs/drawer by live role (`canAccessRoute` from core) — the
      bottom tab bar hides People/Journey when the signed-in role is below
      their `NAV_ITEMS` minRole (Expo Router `href: null`), and the "More"
      screen filters its destination list the same way. Verified live against
      the fulltimer (admin, all 6 tabs) and student (operator: Journey hidden,
      "Looking back" absent from More) e2e test users.
- **Gotcha hit + fixed**: `packages/core` needs its own `node_modules/firebase`
  for standalone `npm test`/`typecheck`, but Metro's default upward
  `node_modules` crawl found that copy *before* `apps/mobile/node_modules`,
  bundling two separate `firebase` packages — a `db` built with one copy fails
  `instanceof Firestore` checks in functions from the other ("Expected type
  'Firestore$1', but it was: a custom Firestore object"). Fixed by adding a
  `resolver.blockList` entry for `packages/core/node_modules` in
  `apps/mobile/metro.config.js` (not `disableHierarchicalLookup` — that also
  breaks resolution of `apps/mobile`'s own non-hoisted nested deps, e.g.
  firebase's own `node_modules/@firebase/auth`).

### ✅ Phase 2 — Low-risk read screens (validate the pattern end-to-end, DONE)
- [x] ~~Landings dispatcher + LandingTrainee / Student / Community~~ — done,
      verified live against all four e2e role users (Full-timer, Trainee,
      Student, Community) on Expo web. `app/(tabs)/index.tsx` is now a thin
      `pickLandingForRole` (new, in `packages/core/src/permissions.ts`) switch;
      My Day was extracted verbatim into
      `src/components/myday/MyDayScreen.tsx` so Full-timers see no change.
      `src/components/landing/LandingTrainee.tsx` — a cockpit-lite: "What's
      waiting on you" (the full-timer's nudges/questions, reusing
      `traineeWaitingItems`/`fullTimerOf` from the already-ported
      `inbox.ts`/`walking.ts`), "Your people" (contacts you created, longest-
      since-seen, via new `traineeMyPeople`/`weighedInContactIds` in a new
      `packages/core/src/landing.ts`, unit-tested), and "Prayers you're
      holding" (reuses `myday.ts`'s `splitPrayers` and the now-exported
      `TeamPrayerRow`/`PersonalPrayerRow`/`AddPersonalPrayerRow` from
      `components/myday/YourPrayers.tsx`). `src/components/landing/
      LandingStudent.tsx` and `LandingCommunity.tsx` both share a new
      `components/landing/UpcomingEventsRsvp.tsx` (events + per-event RSVP
      toggle), backed by a new `packages/core/src/rsvp.ts` (pure
      `upcomingEventsForRsvp`, unit-tested) + `data/rsvp.ts`
      (`setRsvp`/`subscribeMyRsvps`, porting the web app's `lib/rsvp.ts` —
      Firestore rules already permit it, no new index needed). Community also
      adds a new `data/users.ts` (`subscribeFullTimers`) for the "Reach out"
      Full-timer roster; the button opens `mailto:` (or an "isn't wired up
      yet" alert) rather than a real chat write, since Messages has no mobile
      route yet (separate, unstarted Phase 4 item) — a `chatRooms` doc with no
      reader would be pure risk for no benefit.
- [x] ~~Prayer~~ — done, verified live against the e2e Full-timer (both
      themes): `apps/mobile/app/(tabs)/prayer.tsx` + `src/components/prayer/`
      (`PrayerThreadCard`, `HoldPrayerSheet`), backed by new
      `subscribeAllPrayers`/`addPrayer`/`updatePrayerBurden` in
      `packages/core/src/data/prayers.ts` and a unit-tested pure
      `groupPrayerThread` in `packages/core/src/prayerThread.ts`. Answered
      (`/answered`), History, and Directory (People) are still open.
- [x] ~~Directory (People)~~ — done, verified live against real Firestore
      data on Expo web (both themes, mobile viewport): search, stage-filter
      pills, and a contact list sorted longest-since-touched first.
      `apps/mobile/app/(tabs)/people.tsx` + `src/components/people/`
      (`StagePills`, `ContactRow`), backed by new
      `subscribeContacts`/`subscribeStages`/`subscribeTouches` in
      `packages/core/src/data/contacts.ts` and a unit-tested pure
      `filterAndSortDirectory` in `packages/core/src/directory.ts` (reuses
      `myday.ts`'s `lastTouchByContact`/`daysSince`/`parseMs`). Scoped
      read-only per the design's mobile branch — no bulk-select, no tag
      editing, no quick-add (the design's "Add someone" header button stays
      deferred to the item below); `onOpenContact` is an `Alert.alert`
      placeholder matching Prayer's. Answered, History are still open.
- [x] ~~History ("Looking back")~~ — done, verified live against the e2e
      Trainee/manager (both themes; confirmed hidden from the e2e Student):
      `apps/mobile/app/history.tsx` + `src/components/history/`
      (`HistoryRow`, `HistoryFilterSheet`), backed by new
      `subscribeActivities` in `packages/core/src/data/activities.ts` and
      unit-tested pure `humanize`/`dayInfo`/`buildHistoryRows` in
      `packages/core/src/history.ts` (icon selection stays in each
      platform's UI layer — the shared package can't import
      `lucide-react`/`@expo/vector-icons`). Faithfully ported the web app's
      already-shipped `HistoryMobile.tsx` mobile-native design (filter
      bottom sheet with kind/staff pills, live chips) rather than the
      `views/answered.jsx` design-tool source, which has no mobile branch.
      First pushed (non-tab) route in the app — reached from "More",
      establishing the back-button pattern for future detail screens.
- [x] ~~Answered~~ — done, verified live: `apps/mobile/app/answered.tsx` +
      `src/components/answered/AnsweredTile.tsx`, backed by the existing
      `subscribeAllPrayers`/`subscribeContacts` and a new unit-tested pure
      `groupAnsweredPrayers`/`toneForAnsweredId` in `packages/core/src/answered.ts`.
      Ported the shipped `src/views/AnsweredList.tsx` behavior (recent/earlier
      grouping, "answered this year" stat, tone-hashed initial tile) rather
      than the design tool's unbuilt photo-wall/featured-hero concept. A
      single-column vertical stack, matching the design's own phone-width
      collapse — no masonry needed. Pushed route reached from "More", same
      pattern as History.
- [x] ~~Quick add (new contact)~~ — done, verified live: the design's
      People-header "Add someone" button now opens
      `apps/mobile/src/components/people/AddContactSheet.tsx`, backed by a new
      `addContact` in `packages/core/src/data/contacts.ts` (self + walking-together
      full-timer notifications, mirroring `NewContactModal.tsx`) and a new
      `packages/core/src/data/seasons.ts` (`subscribeSeasonSettings`, re-homing
      the season Firestore read mobile didn't have yet) consumed via a new
      `apps/mobile/src/lib/useActiveSeason.ts` hook for cohort-tag stamping.
      Also wired `logActivity` (existed but was unused on mobile) so new
      contacts now surface in the already-shipped History screen. Gated behind
      `role !== 'viewer'`, matching the web modal's self-gate. The design MCP
      was unreachable during this pass (HTTP 503) — built against
      `HoldPrayerSheet`'s Modal chrome and the web modal's field set instead of
      `views/contacts.jsx`'s mobile branch directly; worth a cosmetic
      double-check against the design next time it's reachable.
- [x] ~~Live Firestore data + the e2e test users (one per role)~~ — the e2e
      Community (viewer) user is now verified live, on its Home tab
      (LandingCommunity, see above) — the first mobile screen ever checked
      against that role. Still worth a spot-check on Community for the other
      viewer-accessible screens (Prayer, Answered) if a regression is ever
      suspected there.

### ✅ Phase 3 — Medium screens (all screens DONE; two cosmetic polish items remain)
- [x] ~~My Day cockpit~~ — done, see above.
- [x] ~~Gatherings/Attendance~~ — done, verified live: `apps/mobile/app/attendance.tsx`
      + `src/components/attendance/` (`GatheringHero`, `MissedList`,
      `GatheringTypeFilterPills`, `SessionCard`, `RosterSheet`,
      `UpcomingGatherings`), backed by new `packages/core/src/attendance.ts`
      (pure, unit-tested `here`/`cycleAttendanceStatus`/`sessionsNewestFirst`/
      `whoWeMissed`/`avgAttendance`, ported from `src/views/Attendance.tsx`),
      `data/attendance.ts`, `data/events.ts`, `data/gatheringTypes.ts`, and a
      new `subscribeEventRsvps` on the existing `data/rsvp.ts`. Faithfully
      ported the shipped `src/views/AttendanceMobile.tsx` mobile-native
      design. Fixed the dead `/attendance` link from the Student/Community
      landings' "Full calendar" button and from "More". Full read + RSVP +
      roster attendance-taking (tap to mark present/late/absent), gated
      client-side to Student role and above — the web UI exposes the tap
      targets to every role that can reach the screen, but Firestore rules
      require operator+ to write `contacts.attendance`, so a Community
      (viewer) tap would silently fail; the mobile port shows a read-only
      roster to viewers instead. Deferred: "Log a gathering", edit/delete a
      gathering, "Manage kinds", "Sync sheet", CSV export — all admin-only
      desktop tooling with complex forms (event recurrence generation,
      Google Sheets sync).
- [x] ~~Notifications~~ — done, verified live: `apps/mobile/app/notifications.tsx`
      ("What's stirring") + `src/components/notifications/NotificationRow.tsx`,
      backed by new `packages/core/src/notifications.ts` (pure, unit-tested
      `typeToTone`/`toneForNotification`/`mergeNotifications`/`groupNotifications`)
      and `packages/core/src/data/notifications.ts` (`subscribeNotifications`
      merges the personal + `ALL_ADMINS` broadcast queries;
      `markNotificationRead`/`markAllNotificationsRead`/`setAsideNotification`).
      The write side (`sendNotification`) already existed on mobile. No
      persistent header exists yet to host a bell icon, so this is a pushed
      route reached from "More" (which now shows a live unread-count badge)
      rather than an always-open dropdown like web's. Footer nav ("See the
      whole record in History" / "Open Prayer") is pinned to the screen
      bottom rather than floating, so it stays reachable on a long list.
      **Also widened the `firestore.rules` `notifications` `update` rule** —
      it only allowed `hasOnly(['read'])`, but `markAsRead` writes `read`+
      `readBy` and set-aside-on-broadcast writes `dismissedBy`, so
      non-manager roles got a silent `permission-denied` on both (a
      pre-existing bug affecting web too). Reproduced live against the e2e
      Student (operator) user — `markAsRead` threw `permission-denied` — while
      the e2e Full-timer (admin) succeeded regardless, since `isManager()`/
      `isSuperAdmin()` already bypasses the `hasOnly(...)` check. The rules
      fix is committed but **not yet deployed** (needs `firebase deploy
      --only firestore:rules`, a live-project change), so it's still
      unverified for `operator`/`viewer` roles — deploy, then re-check
      mark-as-read/set-aside as the Student or Community e2e user.
- [x] ~~SignUp~~ — done, verified live: `apps/mobile/app/signup.tsx`, backed by
      new `packages/core/src/signup.ts` (pure, unit-tested
      `validateSignUpBasics`/`checkMathAnswer` + the intake option constants)
      and `packages/core/src/data/signup.ts` (`submitSignUp` — stage lookup,
      `contacts` write, best-effort `ALL_ADMINS` notification). **Correction
      to this item's old description**: there is no phone verification
      anywhere in the web app (grepped for `RecaptchaVerifier`/
      `signInWithPhoneNumber`/OTP — zero matches); `src/views/SignUp.tsx` is a
      public, unauthenticated lead-intake form (phone is a plain text field,
      never verified), so there was no RN Firebase-Auth blocker to work
      around. Ported as a genuinely public route — `apps/mobile/app/
      _layout.tsx`'s auth-redirect now exempts `/signup` (alongside `/login`)
      via `usePathname()`, since Firestore rules already allow the
      unauthenticated `contacts`/`notifications` writes this form needs (no
      rules changes required) and Phase 6 will need this page reachable
      without an account regardless. Two in-app entry points added since
      mobile has no address bar and no Global Search yet (where web's
      "quick action → open signup" lives): a link from `/login` ("New
      here?"), and a manual "Welcome form" card on "More" (same pattern as
      the existing Notifications card, since neither is a `NAV_ITEMS`
      entry). Does **not** reuse `data/contacts.ts`'s `addContact` — that
      assumes an authenticated creator and self/walking-together
      notifications, neither of which applies to an anonymous public
      submission.
- [x] ~~Feedback (submit + admin review)~~ — done, verified live: `apps/mobile/app/
      feedback.tsx` ("Leave a note", any signed-in role) + `apps/mobile/app/
      feedback-admin.tsx` ("Notes from the team", admin-only), backed by new
      `packages/core/src/feedback.ts` (pure, unit-tested kind metadata +
      `filterFeedback`) and `packages/core/src/data/feedback.ts`. Writes
      directly to Firestore rather than through web's `/api/feedback` server
      route (Admin SDK + browser-only `html2canvas` screenshot capture) —
      the existing `feedback` rules already permit everything needed
      (self-attested `create`, admin-only `update`/`delete`/`list`), so no
      rules changes were required. **Deferred**: screenshot capture
      (`react-native-view-shot` still unused — see the Platform swaps entry
      below) and GitHub issue creation (needs server-side secrets); an
      existing `githubIssueUrl` still opens via the admin list. Verified
      live against the e2e Full-timer (admin: submit, status change,
      archive) and Student (operator: submit works, admin entry point and
      direct-URL guard both correctly hidden/blocked) e2e users on Expo web.
      Settings and Global search are still open.
- [x] ~~Settings~~ — done, verified live against all four e2e role users:
      `apps/mobile/app/settings.tsx` + `src/components/settings/*`, ported in
      full from `src/views/Settings.tsx` rather than just profile/appearance —
      a profile header, a static "Roles & access" reference (highlighting
      your own role), a light/dark/system appearance picker wired to the
      already-built `ThemeProvider` (scheme persistence stays deferred,
      matching that provider's own "in a later pass" comment), and — for
      Trainee+ — full team management: search, approve/un-approve pending
      sign-ups, edit a member's role (the Full-timer option, and editing
      itself, both gated to admin actors — `canEditRole={isAdmin && !isYou}`,
      matching web's stricter-than-`isManager` RBAC exactly), soft-remove
      access, invite by email, and cancel a pending invite. Added a new pure,
      unit-tested `packages/core/src/settings.ts` and extended the existing
      `packages/core/src/data/users.ts` (previously just `subscribeFullTimers`)
      with `subscribeUsers`/`subscribeInvitations`/`toggleUserApproval`/
      `changeUserRole`/`sendInvitation`/`revokeInvitation`. The existing
      `users`/`invitations` Firestore rules (`isManager()`) already permitted
      everything needed — no rules changes required. Also extended the shared
      `Avatar` primitive (`apps/mobile/src/components/ui/index.tsx`) with an
      optional `photoURL` prop, verified rendering real Google profile photos
      for two of the three seeded Full-timers. `more.tsx`'s Settings card
      (previously inert — `/settings` was in `NAV_ITEMS` but had no
      `pushRoutes` handler) now navigates. **Deferred**, matching the mobile
      port's existing scope conventions: the Quick Add/Integrations AI
      playground and API/webhook console (both need the server
      `/api/quick-add` endpoint — Admin SDK + Gemini, not client-portable),
      and the embedded "What people are telling us" feedback list (mobile
      already has this as its own `/feedback-admin` route from the Feedback
      phase — linking out was considered but skipped as non-essential).
- [x] ~~Global search~~ — done, verified live against all four e2e role
      users: `apps/mobile/app/search.tsx` + `src/components/search/*`, a
      pushed route reached from a manual "More" card (web's version is a ⌘K
      overlay, not a routed page — same "no persistent header" precedent as
      Notifications). **MVP scope**: People (any signed-in role) + a
      role-filtered Quick actions list ("New contact" for Student+, opening
      the existing `AddContactSheet`; "Open sign-up form" for everyone) +
      History (Trainee+ only). Reuses the existing `subscribeContacts`/
      `subscribeStages`/`subscribeActivities` data layer as-is — no new
      `packages/core/data` module was needed. Added a new pure, unit-tested
      `packages/core/src/search.ts`. Two of web's four result groups and two
      of its four quick actions are intentionally trimmed: **Conversations**
      (would need a new `subscribeInteractions` — `subscribeTouches` drops
      the raw interaction id needed for navigation) and **Coordination
      Notes** (would need a new `subscribeBoardNotes` module and points at
      the unstarted Phase 4 Board) are deferred; "Log a visit" and "The
      Journey" quick actions are omitted since mobile has no log-interaction
      flow or Board route yet. People-result taps reuse `people.tsx`'s
      existing "coming in a later pass" `Alert.alert` placeholder, since no
      contact-detail screen exists yet. Also deliberately drops web's opt-in
      "Search history too" toggle — History is a single cheap `limit(100)`
      query, shown eagerly for Trainee+ like every other Phase 2/3 screen.
- [ ] Modals → RN bottom sheets (`@gorhom/bottom-sheet`) — My Day's sheets use
      plain RN `Modal` for now; revisit if a richer gesture feel is wanted.
- [ ] Platform swaps: clipboard→`expo-clipboard`, screenshot→`react-native-view-shot`,
      CSV export→`expo-file-system`+`expo-sharing`. `messaging.ts`→`Linking` is
      **done** (`apps/mobile/src/lib/messaging.ts`).

### 🔲 Phase 4 — High-risk screens
- [ ] The Journey (dnd-kit → gesture-based move / MoveSheet)
- [ ] Messages (Firestore realtime chat)
- [ ] Coordination Notes / The Board (WebView editor + native read view)

### 🔲 Phase 5 — App-store delivery
- [ ] App icon + splash, `app.json` finalize, EAS Build config
- [ ] Internal TestFlight / Play internal build on a physical device
- [ ] (Optional) `expo-notifications` for OS push (in-app notifications are
      Firestore docs today)

### 🔲 Phase 6 — Web unification (now the real end state, no SEO caveat)
- [ ] Turn on Expo Router web; reach parity with the current web app
- [ ] Retire the old React web app → one codebase for web + iOS + Android
- [ ] Reconcile React versions (web 19 vs Expo 18.3) and optionally adopt true
      npm workspaces at that point

---

## How to proceed (recommended next steps, in order)

1. ~~Get a real login working~~ — **done**: `apps/mobile/.env` has
   `EXPO_PUBLIC_FIREBASE_API_KEY`, `app/login.tsx` is a real email/password
   sign-in, and it's verified live against the e2e Full-timer on Expo web.
2. ~~Generalize My Day's data layer into Phase 1 proper~~ — **done**: My Day's
   Firestore modules live in `packages/core/src/data/` behind an injected `db`,
   and the tabs/More screen are gated by `canAccessRoute`. Verified live
   against two roles (fulltimer, student). The pattern (core function takes
   `db` first, platform wrapper supplies `db` + error handling) is ready for
   the next screen to reuse.
3. **Run the WebView editor spike** (Phase 0.5) — still the one thing that could
   change the architecture (The Board), so validate it before investing in Phase 4.
   Needs a real iOS/Android simulator or device — not verifiable on Expo web.
   **Not a blocker for step 6** — see re-sequencing note below.
4. **Native Google Sign-In** (Phase 0.5) — the current login is email/password
   only; most real users will want Google. Also needs native-platform testing.
   See the CLI findings under Phase 0.5 above before assuming this needs a
   manual Google Cloud Console walkthrough.
5. ~~Fix the cold-login crash~~ — **done** in `d700414` (#121): signing in
   from a logged-out state used to crash `<MyDay>` and bounce back to
   `/login` because `useMyDayData.ts`'s Firestore subscriptions fired before
   `app/_layout.tsx`'s `<Redirect>` took effect, hit `permission-denied`, and
   `handleFirestoreError` re-threw. Fixed by gating the team-data effect on
   `uid` and making `onLoadError` pass `{ rethrow: false }`.
6. ~~Pick the next screen to port~~ — **Prayer, Directory (People), History
   ("Looking back"), Answered, Quick Add (new contact), and the Landing
   dispatcher (LandingTrainee / LandingStudent / LandingCommunity) are now
   done** — **Phase 2 is complete.** Every mobile role now gets its own tailored
   Home screen, verified live against all four e2e role users.
7. ~~Pick a Phase 3 screen next~~ — **Gatherings/Attendance is now done**,
   fixing the Student/Community landings' previously-dead "Full calendar"
   link. **Notifications is now done too** (deploy the widened
   `firestore.rules` to finish it for `operator`/`viewer` roles — see the
   Phase 3 entry above). **SignUp is now done too** — a genuinely public
   route, not gated behind login (see the Phase 3 entry above). **Feedback
   (submit + admin review) is now done too** — writes directly to
   Firestore, no rules changes needed (see the Phase 3 entry above).
   **Settings and Global search are now done too** — **Phase 3 is
   complete.** Remaining Phase 3 items (modals → RN bottom sheets, platform
   swaps) are cosmetic polish, not new screens. Next up is a Phase 0.5 spike
   (WebView editor or Google Sign-In) or a Phase 4 screen (The Journey,
   Messages, Coordination Notes) — see the re-sequencing note below.

**Re-sequencing note**: the numbering above is historical — in practice,
Phase 2 screens (Prayer, Directory — both done) had no external blockers and
proceeded independently of the two Phase 0.5 spikes (WebView editor is a
sizable standalone extraction project; Google Sign-In needs the user's
go-ahead on a permission-required Firebase config change before an agent can
finish it). The same is true of Answered/History next. Prefer continuing
screen ports unless the user specifically wants a spike tackled next.

## Known gotchas

- Firebase JS SDK **v12 removed `getReactNativePersistence`** — RN persistence is
  automatic via `getAuth` + the package's `react-native` export condition +
  installed `@react-native-async-storage/async-storage`.
- Firestore uses a **named database** (`ai-studio-43298cca-…`) — pass it to
  `getFirestore(app, dbId)` (already wired).
- RTDB is **opt-in** (`EXPO_PUBLIC_FIREBASE_DATABASE_URL`); The Board degrades to
  Firestore-only without it.
- The web app's `src/index.css` references an **orphaned** `--panel/--text/--accent`
  alias set that isn't defined in tracked source — the RN theme resolves those to
  the Material tokens; don't trust those CSS blocks' colors literally.
- Design spec = Claude Design project `019e2501-d939-73e9-8f0f-af68b36b8e64`
  (`mobile.html` + `screenshots/`). Per-screen source components are readable
  via the DesignSync MCP (`get_file` on that project id) — e.g. `views/
  prayer.jsx` (used for the Prayer tab) and `views/contacts.jsx` (Directory,
  not yet ported) both have real `isMobile` branches worth reading before
  building a screen's RN port, rather than inferring layout from screenshots
  alone.
- ~~**Cold sign-in can crash `<MyDay>`**~~ — **fixed** in `d700414` (#121):
  `useMyDayData.ts`'s team-data effect now guards on `uid` (not just
  `fixture`), so its Firestore subscriptions no longer fire before auth is
  ready; `handleFirestoreError` also stops re-throwing when the caller
  already sets error state.
- **`packages/core`'s own `node_modules` can shadow `apps/mobile`'s copy of a
  shared runtime dep in Metro** (hit this with `firebase` in Phase 1) — Metro's
  default node_modules crawl runs from the requiring file's location, and
  `packages/core/src/data/*.ts` is closer to `packages/core/node_modules` than
  to `apps/mobile/node_modules`. `apps/mobile/metro.config.js` blocks
  `packages/core/node_modules` via `resolver.blockList` to force everything
  through the one copy mobile actually initializes. Any future runtime dep
  added to `packages/core` needs to also be a direct dependency of
  `apps/mobile` (same pattern already used for `date-fns`) — the blockList
  means core's own copy is never bundled, only used for its standalone
  typecheck/test.
