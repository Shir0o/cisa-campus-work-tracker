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

### ✅ Phase 0.5 — De-risking spikes — DONE, all four items complete
- [x] **Collab editor in a WebView** — done, verified live on the iOS
      Simulator: typed edits in the RN app's WebView showed up in a normal
      desktop browser tab within ~1s and vice versa, with live cursor
      presence ("1 other editing: Tony Wang") — the top technical risk is now
      resolved. **Design pivot from the original scoping below**: rather than
      extracting `DocEditor` into a standalone bundle with new build tooling
      (none existed in the repo), the spike reuses the **already-deployed web
      SPA** as the "bundle." `DocEditor` only needed one `export` keyword
      added ([CoordinationNotes.tsx:1787](src/views/CoordinationNotes.tsx:1787)) — it already closes over its
      module-scope siblings lexically, so no real extraction was needed. New
      pieces: a bare, unauthenticated `/embed/coordination/:docId` route
      ([EmbedCoordinationDoc.tsx](src/views/EmbedCoordinationDoc.tsx), wired in [App.tsx](src/App.tsx) next to the
      existing `/signup` public-route precedent) that signs itself in via
      `signInWithCustomToken`; a new `POST /api/mint-custom-token` endpoint
      ([server.ts](server.ts), reusing the existing `authenticateFirebaseUser` helper) that
      exchanges the caller's own ID token for a short-lived custom token — no
      privilege escalation, self-service for the caller's own uid; and
      `apps/mobile/app/coordination.tsx`, which fetches that token and hosts
      the WebView, delivering the token via
      `injectedJavaScriptBeforeContentLoaded` (not a post-load `postMessage`,
      to avoid a listener-not-mounted-yet race). **Known environment gotcha
      hit + fixed**: `admin.auth().createCustomToken()` needs a signing
      credential; this environment's ADC is a user identity, not a service
      account, so it failed with "Failed to determine service account" until
      granting `yilongwang05@gmail.com` the `roles/iam.serviceAccountTokenCreator`
      role on the `firebase-adminsdk-fbsvc` service account (keyless, matching
      this project's existing WIF-over-keys convention — see
      `server.ts`'s new `serviceAccountId` on `admin.initializeApp`). Scoped
      narrowly per the spike's intent: hardcoded to the seeded `demo-board-team`
      doc (no doc-picker), `contacts`/`onPromote`/`onDelete` stubbed as
      no-ops in the embed route. Verified against `http://localhost:3000`
      only (Simulator reaches the Mac's loopback directly) — pointing at a
      deployed URL would additionally need redeploying the new server
      endpoint, not done here. A **full Board/doc-browser mobile screen** is
      still separate, unstarted Phase 4 work.
- [x] **Native Google Sign-In** — done, verified live on the iOS Simulator:
      tapping "Sign in with Google" on `apps/mobile/app/login.tsx` launches
      the real native OAuth sheet (`"CISACampusWorkTracker" Wants to Use
      "google.com" to Sign In`), confirming `@react-native-google-signin/
      google-signin` is correctly linked and configured end-to-end. **Both
      of the doc's open questions resolved as fully CLI-doable, no manual
      console step needed**: the Google sign-in provider was already enabled
      project-wide (confirmed via a read-only GET to the Identity Toolkit
      Admin API's `defaultSupportedIdpConfigs` — the web app's existing
      `signInWithPopup` Google flow already depended on this), and the two
      Firebase apps were registered via plain `firebase apps:create IOS`/
      `ANDROID --project sac-campus-hub` for `com.cisa.campus` (iOS App ID
      `1:914549253362:ios:bb80c6b60eb05d760f1c6b`, Android App ID
      `1:914549253362:android:a5ff4711ab863ef50f1c6b`), with
      `GoogleService-Info.plist`/`google-services.json` pulled via
      `firebase apps:sdkconfig` and referenced from `app.json`'s
      `ios.googleServicesFile`/`android.googleServicesFile`. The Android
      debug keystore's SHA-1 (`~/.android/debug.keystore`) was attached via
      a direct REST call to the Firebase Management API (`POST
      v1beta1/projects/{project}/androidApps/{appId}/sha` — `firebase-tools`
      has no dedicated subcommand for this; needs the `x-goog-user-project`
      header since this environment's ADC has no default quota project set).
      `AuthProvider.tsx` gained `signInWithGoogle` (`GoogleSignin.configure`
      with the project's existing Web OAuth client ID, then
      `signInWithCredential(auth, GoogleAuthProvider.credential(idToken))`).
      **Known library gotcha hit + fixed**: `@react-native-google-signin/
      google-signin` v16's `signIn()` returns `{ type: 'success' | 
      'cancelled', data }` rather than throwing on cancellation or exposing
      `idToken` directly on the response (that's the older v10/v11 shape) —
      the first pass destructured `idToken` straight off the response,
      which silently passed `undefined` to `GoogleAuthProvider.credential()`
      on cancel and surfaced as a raw `Firebase: Error (auth/argument-error)`
      instead of a clean cancel. Fixed by branching on `response.type`.
      **Known build gotcha hit + fixed**: `pod install` initially failed
      both on a Ruby/CocoaPods UTF-8 locale error (needs `LANG=en_US.UTF-8`)
      and, once past that, on `AppCheckCore`/`GoogleUtilities`/
      `RecaptchaInterop` (transitive deps of the native Google Sign-In SDK)
      not being integrable as static libraries — fixed by adding
      `expo-build-properties` with `ios.useFrameworks: "static"`. Scoped
      narrowly per the doc's original intent: no Sheets
      `spreadsheets.readonly` scope recovery (the web app's nice-to-have,
      not required), and no live Android emulator verification (no
      Play-Services AVD configured in this environment; the Android app is
      registered and its debug SHA-1 attached, but untested live) — iOS-only
      live verification, matching how the WebView editor spike above was
      scoped. Verification stopped short of completing a real sign-in
      (entering actual Google account credentials is the user's step, not
      an agent's); the native OAuth sheet launching correctly and the
      cancel path being handled cleanly is as far as this pass verifies.
- [x] **Fonts** — done, verified live on Expo web: `@expo-google-fonts/newsreader`
      + `@expo-google-fonts/hanken-grotesk` installed in `apps/mobile`, loaded via
      `useFonts()` in `app/_layout.tsx` (gated behind the existing `loading`
      spinner alongside auth, so there's no fallback-to-system-font flash). Only
      the specific weights actually referenced anywhere in the app were bundled
      — every `typography.fontSerif` call site (28 files) uses weight 500 only,
      so `fontSerif` now resolves straight to `Newsreader_500Medium`.
      `typography.fontSans` (`HankenGrotesk_400Regular`) and a new
      `fontSansSemiBold` (`HankenGrotesk_600SemiBold`) cover the only two sans
      weights used, both solely through `AppText`
      ([apps/mobile/src/components/ui/index.tsx](apps/mobile/src/components/ui/index.tsx))
      — RN doesn't repaint a static (non-variable) custom font at a different
      `fontWeight`, so `AppText`'s `label` variant now points `fontFamily`
      straight at the SemiBold family instead of relying on an inert
      `fontWeight: '600'` override. The many other `fontWeight: '600'/'700'`
      usages elsewhere (buttons, chips, pills) never set a custom `fontFamily`
      and were already rendering in the system font before this change — left
      as-is, out of scope here.
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
- [x] **Follow-up fix**: tab-hiding/"More"-filtering only remove the entry
      point — a direct URL or deep link still rendered the screen underneath.
      `admin/feedback.tsx` already self-guarded with an in-screen
      `canAccessRoute` check; added the same guard to `journey.tsx` ('/board',
      manager+), `people.tsx` ('/directory', operator+), and `history.tsx`
      ('/history', manager+) — the three screens gated above the lowest
      ('viewer') role. `contacts`/`activities` Firestore rules allow any
      *approved* user regardless of role, so People/History were a real
      under-role data leak, not just UX; Journey has no live data yet (Phase
      4 scaffold). Verified live as the e2e student (operator) user: direct
      nav to `/journey` and `/history` now shows a lock screen, `/people`
      still renders.
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

### ✅ Phase 3 — Medium screens (all screens + cosmetic polish DONE)
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
      `isSuperAdmin()` already bypasses the `hasOnly(...)` check. **Update**:
      this doc previously said the rules fix was "committed but not yet
      deployed" — that was stale. `gh run list --workflow=deploy-firestore-rules.yml`
      confirms the commit that introduced it (`ad058b8`, #134) auto-deployed
      successfully via the existing `deploy-firestore-rules.yml` CI workflow
      on 2026-07-15 — six days before this correction. **Now live-reverified**
      (2026-07-21) against the e2e Student (operator) and Community (viewer)
      users on Expo web: both "Mark all read" (`markAllNotificationsRead`)
      and the per-item set-aside ("×") action succeeded with no
      `permission-denied`/`Firestore Error` in the console for either role —
      this item is fully closed.
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
- [x] ~~Platform swaps~~ — `messaging.ts`→`Linking` was already done
      (`apps/mobile/src/lib/messaging.ts`). Now also **done**: screenshot
      capture for Feedback (`react-native-view-shot`) and CSV export for
      Attendance (`expo-file-system`+`expo-sharing`), both verified live on
      Expo web — capture actually works there too via the package's
      html2canvas-backed web shim, better than expected (no Simulator-only
      limitation like the Phase 0.5 WebView spike). `apps/mobile/app/
      feedback.tsx` wraps the form in `ViewShot`, captures best-effort on
      submit (any platform), and downscales to a 480px-wide thumbnail — an unconstrained
      capture of a desktop-width screen came in at ~184000 chars, uncomfortably
      close to `firestore.rules`' 200000-char cap on `screenshot`; downscaling
      dropped that to ~15000 chars with plenty of margin. Capture is of *this
      form screen*, not the screen the user was complaining about — mobile's
      Feedback is a routed screen reached only from "More" (unlike web's
      persistent FAB), so the "offending" screen is already unmounted by
      submit time; still useful for device/theme/rendering context. New
      `packages/core/src/attendance.ts`'s `buildAttendanceCsv` (unit-tested,
      packages/core now 185/185 tests) ported verbatim from web's
      `Attendance.tsx` `handleExport`; new `apps/mobile/src/lib/exportCsv.ts`
      branches on `Platform.OS === 'web'` (same Blob+anchor-click trick web
      already uses) vs. native (`expo-file-system` write + `expo-sharing`
      share sheet). Export is ungated, matching web — unlike "Log a
      gathering"/"Sync sheet" which are admin-only there. clipboard→
      `expo-clipboard` was scoped out: its only web use (Settings' Integrations
      console) is itself still deferred on mobile, so there's nothing to
      attach it to yet. Modals→bottom sheets (below) is the one remaining
      Phase 3 item.
- [x] ~~Modals → RN bottom sheets (`@gorhom/bottom-sheet`)~~ — done. All 12
      hand-rolled `Modal`+scrim sheets now share one `Sheet` component
      (`apps/mobile/src/components/ui/Sheet.tsx`), giving real drag-to-dismiss
      and a proper backdrop instead of the old cosmetic (non-draggable) handle
      bar: My Day's `FromTeamInbox`/`ContactsPickerSheet`, Prayer's
      `HoldPrayerSheet`, Journey's `MoveSheet`, Settings'
      `EditRoleSheet`/`InviteSheet`/`RemoveAccessSheet`, Messages'
      `CreateChatSheet`/`ChatDetailsSheet`, History's `HistoryFilterSheet`,
      Attendance's `RosterSheet`, and People's `AddContactSheet`.
      `apps/mobile/app/_layout.tsx` gained a `BottomSheetModalProvider` nested
      *inside* `ThemeProvider`/`AuthProvider` (required, not stylistic — the
      library portals sheet content, and only ancestor providers are visible
      to it; putting it outside throws `useTheme must be used within a
      ThemeProvider` the instant a sheet renders). Uses explicit `snapPoints` +
      `enableDynamicSizing={false}` rather than the library's default dynamic
      sizing, which has a widely-reported upstream bug
      (gorhom/react-native-bottom-sheet#1751) where a sheet mounts with real
      content but never animates open. `AddContactSheet`/`CreateChatSheet`/
      `ChatDetailsSheet` gained a `footer` prop (pinned above the keyboard) for
      an action row that used to sit outside the old `ScrollView`.
      **Bug found + fixed during verification**: `@gorhom/bottom-sheet`'s
      `BottomSheetTextInput` calls the native-only `TextInput.State.
      currentlyFocusedInput()` on blur, which `react-native-web` doesn't
      implement and throws — reproduced live (a real crash, not a preview
      artifact) the moment a sheet text field lost focus. Every sheet text
      field uses plain `TextInput`/the existing `InlineInput` instead, which
      don't call that API. Verified live on Expo web against My Day, People,
      and The Journey: open/close, backdrop-tap-to-close, the pinned footer
      staying visible while scrolling/typing through the 8-field add-contact
      form, and no console errors. **Native drag physics now verified**: a
      later pass (this environment gained a working iOS Simulator — see the
      Coordination Notes entry below) opened `AddContactSheet` and
      drag-dismissed it via a real gesture on the iPhone 16e Simulator —
      smooth native animation, no crash, and the underlying screen stayed
      fully interactive after close (confirming the stuck-backdrop fix below
      holds on-device too, not just on Expo web). **Still not verified**: the
      Android-specific `Pressable`-inside-a-sheet touch nuance the library's
      own troubleshooting docs warn about — no Android emulator/AVD is
      configured in this environment (only iOS Simulator); worth a follow-up
      check on a real Android device. This closes out Phase 3 completely.

### ✅ Phase 4 — High-risk screens (all three screens DONE)
- [x] ~~The Journey (dnd-kit → gesture-based move / MoveSheet)~~ — done,
      verified live against the Trainee and Full-timer e2e users (route is
      hidden from Student/Community in the tab bar via `canAccessRoute`):
      `apps/mobile/app/(tabs)/journey.tsx` + `src/lib/useJourneyData.ts` +
      `src/components/journey/{StageTabs,JourneyRow,MoveSheet}.tsx`. Behavior
      oracle was web's `src/views/OutreachBoardMobile.tsx` (tap-to-switch
      stage tabs + a MoveSheet, not drag-and-drop). Reused almost the entire
      data layer from the People phase as-is — `subscribeContacts`/
      `subscribeStages`/`subscribeTouches`/`lastTouchByContact` needed no
      changes. Added one new core mutation, `moveContactStage` (in
      `packages/core/src/data/contacts.ts`, mirroring `setContactAttendance`'s
      shape), plus its mobile wrapper with the same oldStage-guarded activity
      log as web's `handleUpdateContactStage`. `AddContactSheet` got a small
      additive `defaultStage` prop so "Add to {stage}" pre-fills the active
      tab. **Deferred**, matching the mobile port's existing scope
      conventions: admin "Shape the journey" stage management (add/edit/
      delete stage) — People screen similarly defers contact-detail
      navigation — and swipe-between-tabs (tap is the primary interaction;
      a `PanResponder` addition later is non-breaking).
- [x] ~~Messages (Firestore realtime chat)~~ — done, verified live against
      all four e2e role users (cross-role room visibility: only the
      Full-timer/admin sees every room, other roles see only their own memberships;
      admin can read+send into a room they aren't a member of, per the rules'
      admin bypass): `apps/mobile/app/messages/{index,[roomId]}.tsx` +
      `src/lib/{useMessagesData,useChatThreadData}.ts` +
      `src/components/messages/{ChatRoomRow,CreateChatSheet,MessageBubble,ChatDetailsSheet}.tsx`.
      Behavior oracle was the shipped `src/views/Messages.tsx` +
      `src/services/chat.ts` (not the design tool's aspirational mockup, which
      models unbuilt reactions/pinning/broadcast/mentions). Added
      `packages/core/src/chat.ts` (pure, unit-tested) and
      `packages/core/src/data/chat.ts` (injected-`db` Firestore layer);
      `apps/mobile/src/lib/data/chatReads.ts` mirrors the existing
      `prayerHidden.ts`/`inboxReads.ts` AsyncStorage pattern for per-room
      last-read tracking. Sending a message now also notifies every other
      member via the existing notifications system (new behavior beyond the
      web port — mobile has no persistent header/badge to surface an
      incoming message otherwise). No bottom-tab slot (all 6 are taken), so
      it's a "More" card with a live unread-room-count badge, same pattern as
      Notifications. **Also fixed a live, pre-existing bug**, reproduced
      against the *unmodified* web app: `services/chat.ts`'s group-chat
      create/invite/leave system messages write `senderId: 'system'`, which
      fails the deployed `messages` create rule's `senderId ==
      request.auth.uid` check — every group's genesis/invite/leave system
      message has always silently failed to write (the room itself still
      gets created). `packages/core/src/data/chat.ts` uses the acting user's
      real uid instead (`senderName`/`type` still drive the "System" pill
      display) — fixes it for mobile; the web app's own `services/chat.ts`
      is untouched and still has the bug. Deferred: attachments,
      @mention autocomplete, and the "View Directory Contact Profile" deep
      link (no contact-detail screen exists yet).
- [x] **Coordination Notes / The Board — real doc browser** — done, verified
      live against all four e2e role users on Expo web. Replaced the
      single-hardcoded-doc spike with a real, role-scoped browser:
      `apps/mobile/app/coordination.tsx` is now a folder route —
      `coordination/index.tsx` (the list, self-guarded via
      `canAccessRoute(role, '/coordination')`) and `coordination/[docId].tsx`
      (the detail, role-branched on open). "Folders/dates" ended up mapping
      to the *existing* `DOC_GROUPS`/`docGroup` ("This week"/"Earlier") pure
      helpers in `packages/core/src/board.ts`, which no screen had wired up
      yet — there's no literal folder field on `board_docs`, and no
      audience-*filter* control exists on web to port either (audience is a
      query-scoping/visibility mechanism, not a user toggle, confirmed by
      reading `CoordinationNotes.tsx`). New `packages/core/src/data/board.ts`
      (`subscribeBoardDocs`/`subscribeBoardDoc`/`deleteBoardDoc`, injected-`db`)
      also fixes a confirmed sort-order gap where the existing responsive-web
      mobile view (`CoordinationNotesMobile.tsx`) skipped client-side sorting
      for the non-admin query branch. Ported `mdPreview`/`mdOpenTasks` into
      `packages/core/src/board.ts` (unit-tested, packages/core now 192/192
      tests). On open, admins get the proven WebView editor (now parameterized
      by `docId` instead of `SPIKE_DOC_ID`); everyone else — read-only per
      `firestore.rules` regardless of UI — gets a new native read view
      (`react-native-marked`, chosen over the more obvious
      `react-native-markdown-display` since that package is unmaintained
      upstream) matching web's `ReadOnlyDoc` field layout. Because mobile only
      ever routes admins into the WebView now, `EmbedCoordinationDoc.tsx`'s
      existing `isAdmin`-only gate needed no change — only its stubbed props:
      wired a real `contacts` subscription + `ContactDetailsModal`, "Save to
      archive" (exported `NoteForm`/`guessSeries`/`mdExcerpt` from
      `CoordinationNotes.tsx`, the same treatment `DocEditor` already got),
      and delete (Firestore + best-effort RTDB `board_docs_rtdb` cleanup).
      **Bug found + fixed during verification**: the first cut of
      `subscribeBoardDocs` inferred "admin" from `boardAudiencesForRole(role)`
      returning an empty array — but that function's *default* case (any role
      that isn't admin/manager/operator, including `viewer`) also returns
      `[]`, so the Community (viewer) e2e user's list screen silently sent the
      *unconstrained admin query* instead of skipping the fetch. Firestore
      rules caught it (permission-denied, no data leak), but it was a real
      correctness bug — reproduced live via console errors, fixed by branching
      explicitly on `role === 'admin'` instead. Verified live: admin
      (Full-timer) sees every doc unconstrained + sorted; manager (Trainee)
      sees `trainees`+`everyone`; operator (Student) sees `everyone`-only,
      with its audience badge correctly hidden per web's own convention, and
      its native read view renders real markdown (headings, bold, bullets)
      correctly; viewer (Community) is blocked from the whole screen, with no
      wasted Firestore call after the fix; a direct URL to an out-of-audience
      doc is denied at the rules layer as a defense-in-depth check; the
      "Coordination Notes" card on "More" still navigates correctly post
      file-restructure. **Admin WebView flow now verified**: this environment
      gained a working iOS Simulator (`xcrun simctl` shows bootable iPhone
      runtimes; Xcode present) — the prior "not available in this
      environment" blocker no longer holds. Booted an iPhone 16e Simulator
      (`npx expo run:ios`, plus the root web app's own dev server on
      `:3000`), signed in as the e2e Full-timer, opened a real doc from "The
      Board," and confirmed the `mint-custom-token` fetch succeeds (a native
      fetch bypasses the browser CORS preflight that blocks this on Expo
      web) and the live collaborative editor loads with full chrome
      (formatting toolbar, audience selector, "Save to archive," delete). A
      non-destructive edit (toggling a checklist item) round-tripped through
      "Saving…" → "✓ Saved" against real Firestore, confirming the write path
      works end to end. **Scope note**: contacts-picking/"Save to
      archive"/delete inside the editor were intentionally **not** exercised
      against real docs this pass — this project's Board holds the team's
      actual pastoral-care notes, and delete has no undo, so a full mutation
      test would need a disposable seeded doc rather than live team data;
      worth doing next time with one. **Still deferred**: redeploying
      `/api/mint-custom-token` to the live backend (+ adding CORS) so it
      works off a deployed URL for a real device, not just `localhost:3000`
      — a live-infrastructure change needing the user's explicit go-ahead,
      same as Native Google Sign-In below.

### ✅ Contact Detail screen — DONE, verified live against all four e2e role users
- [x] **A real Contact Detail screen (`apps/mobile/app/contact/[contactId].tsx`)** —
      ported `src/components/modals/ContactDetailsModal.tsx` (2300+ lines, 6
      tabs), building against its `isMobile` branch as the design/behavior
      oracle, same convention as Coordination Notes/Messages/Attendance.
      Overview (info grid, tag add/remove, notes) + an admin-only Edit/Delete
      form (same field set as `AddContactSheet.tsx`); Conversations (the
      interaction log, author/admin-gated inline edit, a per-interaction
      "Alongside" thread toggle); Alongside (the walking-together thread —
      genuinely new RN UI, no existing screen renders a thread's message
      list + reactions + kind-tagged compose box, unlike every other tab
      which reuses an already-proven CRUD-list pattern); Prayer (read + add,
      simpler than the standalone Prayer tab's `PrayerThreadCard` — no status
      cycling/burden editing here); Discussion (one level of threaded team
      comments); History (a per-contact audit timeline reusing
      `packages/core/src/history.ts`'s already-tested `humanize()`). Closes 8
      of the 9 existing `onOpenContact` placeholders scattered across My Day,
      People, Prayer, History, Answered, Attendance, Search, and
      LandingTrainee — Messages' `ChatDetailsSheet` is deliberately left as a
      placeholder, since its `otherMember` is a team user (`AppUser`), not a
      `Contact`, and there's no FK between the two to navigate to.
      New `packages/core/src/contactDetail.ts` (pure, unit-tested: the
      edit-form field diff, the interaction-type-to-activity-type map, the
      delete audit-log text) and new/extended
      `packages/core/src/data/{contacts,threads,activities,prayers,
      interactions,comments}.ts`, all following the established
      injected-`db` pattern (interactions/comments are wholly new modules;
      the other four gained a single-contact/single-doc variant alongside
      their existing team-wide one — e.g. `subscribeContact` next to
      `subscribeContacts`). Added `'/contact': 'viewer'` to
      `packages/core/src/permissions.ts`'s `ROUTE_MIN_ROLE` — the route has
      no `NAV_ITEMS` entry, so `canAccessRoute` would otherwise default it
      to `admin` and 403 every non-admin caller; this is the same
      easy-to-miss step every "no tab, no More card" pushed route needs
      (matches History/Answered's own guard comments).
      **Bug found + fixed during verification**: `data/comments.ts`'s
      `addComment` initially only wrote `parentId` when replying (mirroring
      the web modal's own `handleAddComment` verbatim), omitting the field
      entirely for a top-level comment — but the deployed `comments` create
      rule's `data.parentId == null || (data.parentId is string && ...)`
      check accesses that field unconditionally, so a genuinely-absent
      `parentId` fails the check and the write is denied with "Missing or
      insufficient permissions." Reproduced live (an uncaught error, not a
      quiet console warning) the first time a top-level Discussion comment
      was posted against real Firestore rules. Fixed by always writing
      `parentId: input.parentId ?? null` — a pre-existing bug in the
      untouched web app too (same conditional-omission pattern in
      `ContactDetailsModal.tsx`), fixed here only for mobile's new module.
      Verified live: **Full-timer (admin)** — opened from My Day's "From the
      team" inbox both bare and via "Open the conversation" (lands on the
      Alongside tab with the right interaction's thread), edit → save (diff
      text shows up live in that same contact's own History tab), tag
      add/remove, logging an interaction, adding a prayer (composes
      `logActivity` itself, since the shared `addPrayer` wrapper doesn't —
      confirmed it surfaces in History too), posting + reacting to an
      Alongside message, and a threaded Discussion reply — all against real
      Firestore. Delete's confirmation is `Alert.alert`, a documented no-op
      on Expo web (this migration's known limitation) — the button dispatch
      itself was verified there, and the full path is **now verified live on
      the iOS Simulator**: created a disposable throwaway contact, opened its
      Edit form as the Full-timer, tapped "Delete contact," confirmed the
      native `Alert.alert` ("Delete contact? … This can't be undone." /
      Cancel / Delete) rendered and functioned correctly, tapped Delete, and
      confirmed the contact was actually removed from Firestore (the
      directory's count dropped back down and the contact no longer appeared
      in search) with a clean navigate-back — no test data left behind.
      **Trainee (manager)** — opened via LandingTrainee's
      "Open" action; correct trainee-flavored Alongside compose kinds
      (Note/Question/Comment/Encourage, no Follow-up/nudge) and no Edit
      button. **Student (operator)** — opened via People; every compose
      surface writable (tags, interactions, comments, threads, prayers),
      still no Edit button. **Community (viewer)** — opened via the Prayer
      tab; every tab renders read-only (no compose boxes, no tag-add pill,
      no reaction taps), and the route itself isn't blocked (per the
      `ROUTE_MIN_ROLE` fix above). **Also found, flagged separately, and
      since fixed** (`d8b205a`, #155): closing the "From the team" inbox
      item's action sheet (`FromTeamInbox.tsx`, built on the shared
      `Sheet.tsx`/`@gorhom/bottom-sheet` primitive) used to leave an
      invisible, full-viewport, click-blocking backdrop behind on Expo web —
      reproduced with a purely local action ("Mark scanned", no navigation
      involved), a pre-existing bug in the shared sheet primitive itself
      (`@gorhom/bottom-sheet`'s backdrop only flips `pointer-events` to
      `none` once its Reanimated close animation crosses a threshold index,
      and that animation runs on `requestAnimationFrame` on web, which can
      stall indefinitely). `Sheet.tsx`'s `SheetBackdrop` now gates
      hit-testing on the `visible` prop directly instead, independent of any
      animation completing — fixes it uniformly for all 12 sheets sharing
      the primitive, verified live on Expo web by probing the backdrop DOM
      node's `pointer-events` before/after.

### ✅ Log tab ("Quick Capture") — DONE, verified live against real Firestore
- [x] **A real Quick Capture flow behind the Log tab** — since the tab bar
      was first scaffolded, `apps/mobile/app/(tabs)/_layout.tsx`'s Log tab
      had only ever shown `Alert.alert('Log a moment', "Quick capture isn't
      wired up yet — coming in a later pass.")`, never tracked as an open
      item in this doc despite being one of the app's six primary tabs. Built
      against the Claude Design project's dedicated mobile file
      `views/quick-capture.jsx` — not the desktop `LogInteractionModal.tsx`
      (a batch multi-contact logger) — since it's purpose-built for this
      exact FAB tab and is genuinely different in shape: a single-contact,
      four-step flow (who → note → saved → optional reminder/prayer) with
      inline new-contact creation and a "heads-up to the contact's creator"
      on the reminder step, mirroring `apps/mobile/src/lib/data/comments.ts`'s
      existing creator-notify pattern. New pure `packages/core/src/
      quickCapture.ts` (unit-tested, packages/core now 209/209 tests): the six
      capture kinds, a "mine-first, most-recently-touched-first" recents sort
      (the **opposite** direction from Directory's longest-since-touched
      sort — an easy mix-up, called out explicitly in the code), search
      matching, and reminder due-date presets. Widened
      `interactionActivityType` in `contactDetail.ts` to cover the six new
      kinds for the activity-log entry. No new Firestore data-layer functions
      were needed — the flow composes already-existing
      `addContact`/`addInteraction`/`addTodo`/`addPrayer`/`sendNotification`.
      Gated to non-viewer roles (`href: null` for Community, matching the
      desktop modal's own `role === 'viewer'` gate). **No native date-picker
      dependency exists anywhere in the app** (the existing task-due-date
      composer, `DUE_PRESETS`, also sticks to fixed presets for the same
      reason) — the reminder step drops the design's "Pick a date" option to
      match, and the note step uses a plain Today/Yesterday toggle instead of
      a full date field.
      **Bug found + fixed during verification**: the first cut of
      `reminderDueDate` returned a full ISO datetime (`toISOString()`, ~24
      chars) for a task's `dueDate`. The deployed `tasks` Firestore rule caps
      `dueDate` at 20 chars, so every reminder write silently failed with
      "Missing or insufficient permissions" — reproduced live as the Full-
      timer (admin) user, an uncaught error, not a quiet console warning.
      Fixed by matching `myday.ts`'s existing `duePresetToISO` format exactly
      (a bare `yyyy-MM-dd`, local-date arithmetic via `date-fns`'s `format`)
      — the same format the app's own native "Add a task" composer already
      uses. Verified live on Expo web (mobile viewport) as the e2e Full-timer:
      logged a moment against an existing contact (multiple kinds, the
      Today/Yesterday toggle), set a reminder (confirmed it lands on My Day's
      task list and — separately reproduced — that it silently failed before
      the fix), added an inline prayer (confirmed on the Prayer tab's data
      layer via the same `addPrayer` call Prayer itself uses), navigated to
      the real Contact Detail screen via "Open X's page", and created a
      **brand-new contact** end to end via "Someone new" (confirmed the
      contact, its season cohort tag, default "First Contact" stage, and the
      logged interaction all landed correctly, and that it then appears in
      My Day's "Your sheep" and Directory). Role gating verified against the
      e2e Community (viewer) user: the Log tab is absent from the bottom bar,
      and a direct URL to `/log` renders only the inert placeholder screen —
      no interaction data or write path reachable. **Not verified this
      pass**: a live cross-role reminder heads-up notification (the
      `contact.createdBy !== me` branch) — the code path mirrors
      `comments.ts`'s already-verified pattern exactly, but wasn't
      independently re-triggered live due to session/auth friction in this
      environment. **Deferred**: voice-to-text note dictation (the design
      uses the browser's Web Speech API, not portable to React Native
      without a new native speech-recognition dependency + a mic-permission
      flow) — the note field is a plain text input for now.

### ✅ Coordination Notes: undo-delete, Trash, pin — DONE (#160, #161)
- [x] **Interactions: delete-with-undo.** Contact Detail's Conversations tab
      had no delete at all, and the app had no Snackbar/Toast component
      anywhere. Added a reusable `apps/mobile/src/components/ui/Snackbar.tsx`
      and a new `deleteInteraction` (`packages/core/src/data/interactions.ts`
      + mobile wrapper — no `firestore.rules` change needed, the interactions
      delete rule already allows the owner or a manager). Tapping Delete
      hides the interaction immediately and shows an "Undo" Snackbar; nothing
      is actually deleted from Firestore unless the ~4s window elapses
      without Undo. The pending-delete state and Snackbar render in
      `apps/mobile/app/contact/[contactId].tsx` (not `ConversationsTab.tsx`
      itself), since the Snackbar needs to render above the tab's own
      `ScrollView`, not inside its scrollable content.
- [x] **Coordination Notes: soft-delete + Trash, replacing a permanent hard
      delete.** Deleting a "Board" page (`board_docs`) used to call
      `deleteDoc` directly, with no recovery path short of a full GCP
      Firestore backup restore. Added a `deletedAt` soft-delete field to
      `BoardDoc` plus `isTrashedBoardDoc`/`docSortOrder`
      (`packages/core/src/board.ts`), and `softDeleteBoardDoc`/
      `restoreBoardDoc`/`subscribeTrashedBoardDocs`/`isExpiredTrash`/
      `purgeExpiredTrash` (`packages/core/src/data/board.ts` — no
      `firestore.rules` change needed, `isValidBoardDoc` uses `hasAll`, not
      `hasOnly`). Trash auto-purges pages older than 30 days via a lazy
      sweep whenever a Trash view loads (no scheduled server-side job exists
      in this repo). New admin-only `apps/mobile/app/coordination/trash.tsx`
      (Restore, or "Delete Forever" for the old permanent-delete behavior),
      reached via a trash icon on `coordination/index.tsx`'s header
      (admin-only; intentionally not linked from "More" — one tap deeper
      matches the admin-only scope, same reasoning as other admin-only
      screens in this app). `subscribeBoardDocs` correctly excludes trashed
      docs and applies `docSortOrder` (confirmed by reading
      `packages/core/src/data/board.ts:34-54`). Since admins delete pages
      today via the web-based editor embedded in a WebView, the web delete
      handlers (`src/views/CoordinationNotes.tsx`,
      `src/views/EmbedCoordinationDoc.tsx`) were switched to the same
      soft-delete, and the desktop Pages list now filters out trashed docs
      too.
- [x] **Pin.** Coordination notes can be pinned to the top of the Pages
      list — a `pinned?: boolean` field on `BoardDoc` plus the
      `docSortOrder` comparator above (pinned-first, then newest-first). A
      pin/unpin toggle (admin-only) was added to mobile's `DocCard.tsx`
      (and web's `DocRow`), backed by a new `pinBoardDoc` helper. No
      `firestore.rules` change needed.
- [x] **Web-only, not ported to mobile** (confirmed no mobile equivalent
      exists or is needed): a new web Trash view (`/coordination/trash`,
      `src/views/CoordinationTrash.tsx` — mobile already had its own Trash
      screen, described above); the editor's "insert a link with custom
      display text" toolbar button (lives entirely in
      `src/views/CoordinationNotes.tsx` — mobile's admin editor is a
      `WebView` wrapper around the same web editor, so this is inherited for
      free rather than natively reimplemented); a live-collaboration
      cursor-label CSS fix; and a "Not auto-synced" indicator on Feedback's
      admin GitHub-sync status (unrelated to Coordination Notes, bundled
      into the same PR).
- **Known gap, not a regression**: none of this new mobile code
  (`Snackbar.tsx`, the Trash screen, the pin toggle) has any automated test
  coverage — `apps/mobile` has zero test files project-wide. This matches
  every prior phase's convention (pure logic ported into a unit-tested
  `packages/core` module, RN screens verified manually via Expo web/
  Simulator, never automated component tests), so it's not a new shortfall
  specific to this feature.

### 🔲 Phase 5 — App-store delivery
- [x] ~~App name + app icon~~ — done: `apps/mobile/app.json`'s `name` is now
      **"CISA Campus Work Tracker"** (was the shorter "CISA Campus"; the
      user's explicit pick over the manifest's "CISA Tracker", accepting that
      it may truncate under a phone home-screen icon). The app icon uses the
      web app's brand mark (`public/logo.svg`'s purple/cream sheep, the same
      asset in `Sidebar.tsx`'s top-left brand header) via two ready-made
      1024×1024 exports the user supplied (not re-rendered from the SVG):
      `apps/mobile/assets/icon.png` (opaque, wired to `expo.icon` and
      `web.favicon`) and `apps/mobile/assets/adaptive-icon-foreground.png`
      (transparent, ~19–20% safe-zone margin on every side, wired to
      `android.adaptiveIcon.foregroundImage` with `backgroundColor: "#5c5595"`
      matching the brand purple). Verified live on Expo web (favicon renders,
      no asset-resolution errors). Still open below: splash *image* (only
      `splash.backgroundColor` is set) and EAS Build config.
- [x] **Splash image, EAS Build config** — done: `expo-splash-screen` is
      configured in `app.json` (via `npx expo install`) reusing the existing
      `adaptive-icon-foreground.png` (already brand-correct, already has
      safe-zone padding for a centered icon) on the existing
      `splash.backgroundColor` (`#eaeef4`) rather than commissioning new art.
      `apps/mobile/app/_layout.tsx` now calls `SplashScreen.
      preventAutoHideAsync()` at module scope and `hideAsync()` once
      `!loading && (fontsLoaded || fontError)` — the native splash now stays
      up through the auth/font-loading window instead of auto-hiding
      instantly and flashing the `ActivityIndicator` spinner separately.
      Verified live on the iOS Simulator (Xcode 26.3): `npx expo prebuild
      --platform ios --clean` + `pod install` (needed `LANG=en_US.UTF-8` —
      this environment's Ruby/CocoaPods combo throws a Unicode-normalization
      error otherwise) + `npx expo run:ios`, screenshot confirms the cream
      sheep mark centered on the light background before the app UI
      appears, no console errors. `eas-cli` (`21.0.2`) is now a devDependency
      so `npx eas` resolves locally, and `apps/mobile/eas.json` has the
      standard `development`/`preview`/`production` build profiles (the same
      shape `eas build:configure` would scaffold). **Not done**: linking the
      project to an Expo account (`eas login`/`eas init`, which would
      populate `extra.eas.projectId`) — needs the user's own Expo
      credentials, which can't be entered on their behalf. See
      `apps/mobile/SETUP.md`'s new "App-store delivery" section for the
      remaining manual steps.
- [ ] Internal TestFlight / Play internal build on a physical device — blocked
      on the `eas login`/`eas init` step above, plus the user's own Apple
      Developer / Google Play accounts.
- [x] **Local reminder notifications** — done, unit-tested; **live permission-
      request verification is blocked** (see below), a real gap, not silently
      claimed as working. Installed `expo-notifications` (`~0.29.14`) + its
      config plugin (`apps/mobile/app.json`, reusing the brand icon/color —
      confirmed wired: the generated `ios/.../*.entitlements` gained
      `aps-environment: development` and the built `.app` includes
      `ExpoNotifications_privacy.bundle`). New pure
      `reminderNotificationTrigger`/`reminderNotificationContent`
      (`packages/core/src/quickCapture.ts`, unit-tested — packages/core now
      218/218 tests) compute a full `Date`+content for a Quick Capture
      reminder's OS notification, kept deliberately separate from
      `reminderDueDate` (which must stay a bare `yyyy-MM-dd` for the 20-char
      Firestore rule cap). New `apps/mobile/src/lib/notifications.ts`
      (`ensureNotificationPermission`/`getNotificationPermissionStatus`/
      `registerForPushToken`/`scheduleReminderNotification`, every call
      guarded `Platform.OS !== 'web'`) and `usePushRegistration.ts` (a silent
      re-sync hook, no prompting — wired into `app/_layout.tsx`). Wired into
      `QuickCaptureSheet.tsx`'s `handleSetReminder` (prompts contextually,
      the moment a reminder is actually set — not on sign-in, which would
      burn iOS's one-shot permission dialog before the user has a reason to
      say yes) and a new `apps/mobile/src/components/settings/
      NotificationsSettings.tsx` (status row + "Enable notifications" +
      "Open Settings" on denial + a `__DEV__`-only test-notification button),
      rendered in `settings.tsx` after `AppearancePicker`. Added
      `AppUser.pushToken?: string | null` (`packages/core/src/types.ts`) +
      `setPushToken` (`packages/core/src/data/users.ts` +
      `apps/mobile/src/lib/data/users.ts`) + a `firestore.rules` widening of
      the self-owner `users` update rule's `hasOnly([...])` allowlist to
      include `pushToken` (with a `<= 200`-char/string type guard) — **this
      one is genuinely proven, not just read-through**: this repo already has
      an emulator-backed rules suite (`src/test/firestore.rules.test.ts`);
      added 3 new cases (owner can set `pushToken` alone; cannot smuggle
      `role`/`approved` alongside it; an oversized/non-string value fails),
      confirmed via `firebase emulators:exec --only firestore "npm test"` —
      65/65 passing. Verified live on Expo web: the `NotificationsSettings`
      card correctly renders "Not available on web" (no button, no crash,
      clean console) — confirming every new call's `Platform.OS !== 'web'`
      guard works as intended.
      **Live iOS Simulator verification found a real, reproducible bug,
      left open rather than silently marked done**: tapping "Enable
      notifications" (→ `Notifications.getPermissionsAsync()`/
      `requestPermissionsAsync()`) hangs the entire app — no crash, no
      thrown error, no console output at all (confirmed via a temporary
      diagnostic `console.log` at the very top of the handler, which never
      fired, meaning the freeze happens before JS's `onPress` even runs) —
      requiring a force-relaunch to recover. Reproduced 5+ times across
      fresh app relaunches, a full `xcrun simctl shutdown`+`boot` cycle, and
      after ruling out a separate, unrelated `@gorhom/bottom-sheet` crash
      (`ReanimatedError: Property 'window' doesn't exist`, hit once when
      opening Settings' `InviteSheet` — a pre-existing bug in a sheet this
      migration's native pass had never actually opened live before; not
      caused by this feature and not fixed here, flagged separately). A web
      search corroborates a known class of `expo-notifications`
      incompatibility with React Native's Bridgeless/New Architecture mode
      (`app.json`'s `newArchEnabled: true`, already on for this whole app).
      Per explicit user choice, not chased further this session — the two
      real fixes (disabling New Architecture app-wide, which would need
      re-verifying every other already-shipped native screen; or finding/
      waiting for a newer `expo-notifications` patch) are both bigger calls
      than fit in this pass. **The code itself is correct** (matches the
      installed package's actual `.d.ts` shapes, confirmed by reading them
      directly rather than assuming) — what's unverified is specifically the
      live permission dialog on this iOS Simulator + New Architecture
      combination.
- [ ] Remote push (a real Expo push token reaching a server, a server
      dispatching it via the Expo Push API) — deferred, **two independent
      blockers**: (1) minting a token needs `extra.eas.projectId`, which only
      exists after `eas login`/`eas init` — the same user-account blocker as
      TestFlight above; `registerForPushToken()` already degrades cleanly to
      a dev-only `console.warn` + `null` without it. (2) dispatching a push
      once a token exists needs new server-side infrastructure this repo
      doesn't have today — no Firestore-triggered Cloud Functions exist
      (`firebase.json` has no `functions` key) — building this means either
      standing up Cloud Functions for the first time or adding a new
      `server.ts` endpoint (mirroring the `/api/mint-custom-token` pattern)
      that the client calls after writing a notification doc. Either path is
      new live infrastructure needing the user's explicit go-ahead to
      deploy, same as the Coordination Notes WebView's
      `mint-custom-token`-to-production precedent above.

### 🔲 Phase 6 — Web unification (now the real end state, no SEO caveat)
- [x] **Turn on Expo Router web; reach parity with the current web app** — route
      parity turned out to already be complete (a route-by-route comparison of
      `src/App.tsx`'s 14 web routes against `apps/mobile/app/` found every web
      screen already has a mobile equivalent — no dead stubs). What was
      actually missing was a *production* web build: `apps/mobile/package.json`
      only had `"web": "expo start --web"` (dev server), never
      `expo export -p web`. Added `"build:web": "expo export -p web"` and ran
      it. **Bug found + fixed during verification**: the export built clean
      (0 errors) but the resulting static bundle threw
      `Firebase: Error (auth/invalid-api-key)` on load — `src/lib/firebase.ts`
      read env vars via `const env = process.env; env.EXPO_PUBLIC_FIREBASE_API_KEY`,
      and Expo's babel plugin that inlines `EXPO_PUBLIC_*` vars into a
      production bundle only statically replaces the literal
      `process.env.EXPO_PUBLIC_X` expression shape — the `env` alias defeated
      it, so the value silently came through as `undefined` in the exported
      bundle (dev mode masked this, since Metro's dev server injects a live,
      fully-populated `process.env` object at runtime instead of relying on
      static replacement). Fixed by referencing `process.env.EXPO_PUBLIC_X`
      directly for each var. Verified live: re-exported, statically served
      `apps/mobile/dist` (new `mobile-web-dist` config in `.claude/launch.json`,
      port 8092, `npx serve`), logged in as the e2e Full-timer against real
      Firestore, confirmed 0 console errors, client-side nav across Home →
      People → More → History ("Looking back") → Settings (all real data),
      and both Light/Dark themes rendering correctly.
- [ ] Retire the old React web app → one codebase for web + iOS + Android —
      **blocked on an operational decision, not code.** There's no CI workflow
      deploying either app; three competing, undocumented-in-CI deployment
      docs exist at the repo root (`CLOUDFLARE_DEPLOYMENT.md` — Cloudflare
      Pages only, `HYBRID_DEPLOYMENT.md` — Cloudflare Pages + GCP Cloud Run,
      `GCLOUD_DEPLOYMENT.md` — Cloud Run only), no `wrangler.toml`, and
      `firebase.json` only configures Firestore/RTDB rules, not hosting.
      Retiring the old app means the user picking which (if any) of these is
      real production and replacing it with a deployed `apps/mobile` web
      export — not something to decide silently. Relatedly,
      `apps/mobile/app.json`'s `web.output` is `"single"` (one HTML file, all
      client-side routing) rather than `"static"` — confirmed live that a hard
      reload on a nested path (e.g. `/settings`) 404s on a plain static server
      with no rewrite rule. Whatever host is eventually chosen will need a
      catch-all rewrite to `index.html` (e.g. Cloudflare Pages' `_redirects`
      file with `/* /index.html 200`) for deep-linking/hard-reload to work.
- [ ] Reconcile React versions (web 19 vs Expo 18.3) and optionally adopt true
      npm workspaces at that point — **deferred as a separate, higher-risk
      pass, per explicit user choice this session.** Getting to React 19 means
      bumping the Expo SDK itself (52→53+), which touches ~15 pinned native
      dependencies (`react-native-reanimated`, `-gesture-handler`, `-screens`,
      `-svg`, `-webview`, `@gorhom/bottom-sheet`,
      `@react-native-google-signin/google-signin`, `expo-build-properties`,
      etc.) across every already-shipped, already-verified screen — real
      regression risk, warranting its own dedicated pass with full
      re-verification afterward rather than folding it into this one.

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
8. ~~Pick a Phase 4 screen next~~ — **The Journey is now done** (see the
   Phase 4 entry above), reusing almost the entire People-phase data layer.
   **Messages is now done too** — the last Phase 4 screen not blocked on a
   Phase 0.5 spike. Next up is Coordination Notes / The Board, which is
   still blocked on the Phase 0.5 WebView editor spike, or one of the two
   remaining Phase 0.5 spikes themselves.
9. ~~Run the WebView editor spike~~ — **done**, verified live on the iOS
   Simulator (see the Phase 0.5 entry above) — the top technical risk is
   resolved. Coordination Notes / The Board itself (a real doc browser, not
   just the spike's one hardcoded doc) is still open — see the Phase 4 entry.
   Native Google Sign-In remains the one open Phase 0.5 spike, still needing
   the user's go-ahead on a permission-required Firebase project change
   before an agent can register the iOS/Android apps.
10. ~~Fonts~~ — **done** (see the Phase 0.5 entry above), picked specifically
    because it needed no external account/permission action and has nothing
    to do with Coordination Notes / The Board. Native Google Sign-In is now
    the only open Phase 0.5 item, still blocked on the user's go-ahead.
    Coordination Notes / The Board (Phase 4) remains the other open item.
11. ~~Build the Coordination Notes / The Board real doc browser~~ — **done**
    (see the Phase 4 entry above) — **Phase 4 is now complete**, all three
    high-risk screens shipped. What's left: Native Google Sign-In (Phase 0.5,
    needs the user's go-ahead), Phase 3's cosmetic polish (bottom sheets,
    platform swaps — not new screens), and Phase 5 app-store delivery (splash
    image, EAS Build config, a TestFlight/Play internal build). None of these
    are blocked on each other — pick based on what the user wants next.
12. ~~Platform swaps~~ — **done** (see the Phase 3 entry above): Feedback
    screenshot capture and Attendance CSV export. What's left: Native Google
    Sign-In (Phase 0.5, needs the user's go-ahead), Modals→bottom sheets
    (Phase 3, cosmetic), and Phase 5 app-store delivery.
13. ~~Modals → RN bottom sheets~~ — **done** (see the Phase 3 entry above) —
    **Phase 3 is now fully complete**, no open items left in it. What's left
    overall: Native Google Sign-In (Phase 0.5, needs the user's go-ahead) and
    Phase 5 app-store delivery (splash image, EAS Build config, a
    TestFlight/Play internal build). Neither is blocked on the other — pick
    based on what the user wants next.
14. ~~Splash image, EAS Build config~~ — **done** (see the Phase 5 entry
    above). What was left at the time: Native Google Sign-In (Phase 0.5,
    still needed the user's go-ahead), and the rest of Phase 5 — `eas
    login`/`eas init` (the user's own Expo account) followed by an Internal
    TestFlight/Play build (the user's own Apple/Google accounts). Phase 6
    (web unification) remains untouched.
15. ~~Native Google Sign-In~~ — **done** (see the Phase 0.5 entry above) —
    **Phase 0.5 is now fully complete**, no open items left in it. The
    user's go-ahead unblocked the two Firebase project registrations; both
    of the doc's remaining open questions (provider already enabled, SHA-1
    attachable via REST) resolved cleanly with no manual console step
    needed. What's left overall: the user-account-linking part of Phase 5
    (`eas login`/`eas init`, an Apple/Google developer account, and an
    actual TestFlight/Play build) and Phase 6 (web unification) — neither
    is something an agent can complete unassisted.
16. ~~Contact Detail screen~~ — **done** (see the entry above), found by
    auditing the codebase for the next unblocked unit of work: route-level
    Phase 6 parity turned out to already be complete (every web route has a
    mobile equivalent), but `ContactDetailsModal.tsx` had never been
    ported, leaving 9 `onOpenContact` placeholders across nearly every
    mobile screen. Porting it closed 8 of them at once (Messages'
    `ChatDetailsSheet` doesn't apply — see the entry above) and, along the
    way, fixed a live Firestore-rules bug in the new comments module (a
    missing `parentId` field failing the create rule) and surfaced a
    pre-existing `Sheet`/`@gorhom/bottom-sheet` web bug (stuck backdrop
    after closing `FromTeamInbox`'s sheet), flagged separately rather than
    fixed here since it's unrelated to this screen and affects a primitive
    shared by 12 other sheets. That Sheet-backdrop bug was fixed
    immediately after, in `d8b205a` (#155) — see the entry above.
17. ~~Fix the stuck bottom-sheet backdrop bug~~ — **done** (`d8b205a`, #155,
    see the entry above) — the flagged-separately item from the Contact
    Detail pass. What's left overall at this point: the user-account-linking
    part of Phase 5 (`eas login`/`eas init`, an Apple/Google developer
    account, an actual TestFlight/Play build) and Phase 6 (retiring the old
    web app, reconciling React versions) — neither is something an agent can
    complete unassisted. Auditing the rest of the app for undocumented gaps
    turned up one more: the **Log** bottom tab
    (`apps/mobile/app/(tabs)/_layout.tsx`) has, since the tab bar was first
    scaffolded, only ever shown `Alert.alert('Log a moment', "Quick capture
    isn't wired up yet — coming in a later pass.")` — never tracked as an
    open item in this doc despite being one of the six primary tabs.
18. ~~Log tab ("Quick Capture")~~ — **done** (see the entry above), verified
    live on Expo web against real Firestore as the e2e Full-timer and
    Community users, including a real Firestore-rules bug found and fixed
    (a task `dueDate` format silently exceeding the deployed rule's 20-char
    cap). What's left overall: the user-account-linking part of Phase 5
    (`eas login`/`eas init`, an Apple/Google developer account, an actual
    TestFlight/Play build) and Phase 6 (retiring the old web app,
    reconciling React versions) — neither is something an agent can
    complete unassisted.
19. ~~Phase 6 kickoff: production web export~~ — **done** (see the Phase 6
    entry above), picked because it was the one Phase 6 item with no
    external blocker (unlike retiring the old app, which needs the user to
    resolve three competing deployment docs; or reconciling React versions,
    a deliberately-deferred, higher-risk Expo SDK bump). Found and fixed a
    real production-only bug along the way: the exported bundle silently
    shipped with no Firebase API key (an `env` alias defeated Expo's static
    `EXPO_PUBLIC_*` inlining), which dev mode never surfaced. What's left
    overall: the user-account-linking part of Phase 5 (`eas login`/`eas
    init`, an Apple/Google developer account, an actual TestFlight/Play
    build), retiring the old web app (needs the user's hosting decision),
    and reconciling React versions (deferred, higher-risk) — none of these
    are something an agent can complete unassisted.
20. ~~iOS Simulator verification pass~~ — **done**. Every item MIGRATION.md
    still listed as open (TestFlight build, `expo-notifications`, retiring
    the old web app, React version reconciliation) genuinely needs the
    user's own accounts or a hosting decision — but auditing the environment
    found something the doc didn't know: a working iOS Simulator is now
    available here (it wasn't in earlier sessions), which several
    already-shipped screens had explicitly flagged as unverified for exactly
    that reason. Closed all three: Coordination Notes' admin WebView flow
    (mint-custom-token native fetch + live collab editor), Contact Detail's
    delete confirmation (native `Alert.alert` → real Firestore delete →
    navigate-back, using a disposable throwaway contact so no real data was
    touched), and the shared `Sheet.tsx` primitive's native drag-to-dismiss
    physics (see their respective entries above for detail). No bugs found;
    all three worked as designed. Android-side verification (Google Sign-In,
    the `Pressable`-in-sheet nuance) stays open — no emulator/AVD is
    configured in this environment. **Environment gotcha hit**: this
    environment runs multiple worktrees of this repo at once, and Metro
    (port 8081) was already occupied by another worktree's `expo run:ios`
    process when this pass's build ran; Expo silently proceeded against the
    already-running server rather than starting a fresh one on this
    worktree's tree. Confirmed no risk to this pass's findings by diffing
    the three files actually exercised (`ContactEditForm.tsx`,
    `coordination/[docId].tsx`, `Sheet.tsx`) against that worktree's copies —
    byte-identical — but worth checking for port conflicts before trusting a
    Simulator pass's results in a multi-worktree environment. What's left
    overall: the user-account-linking part of Phase 5 (`eas login`/`eas
    init`, an Apple/Google developer account, an actual TestFlight/Play
    build), retiring the old web app (needs the user's hosting decision),
    and reconciling React versions (deferred, higher-risk) — none of these
    are something an agent can complete unassisted.
21. ~~Doc catch-up + Notifications rules re-verification~~ — **done**. Two
    already-merged PRs (#160, #161) had shipped real mobile features —
    delete-with-undo for interactions and soft-delete/Trash/pin for
    Coordination Notes — that this doc never mentioned; documented them (see
    the new entry above). Separately, this doc had claimed the Phase 3
    Notifications `firestore.rules` fix was "committed but not yet
    deployed" — that was stale (it deployed successfully on 2026-07-15, six
    days earlier); confirmed via `gh run list` and then live-reverified
    against the e2e Student and Community users, closing that item for
    real. No new mobile screens or infra — a pure documentation-accuracy and
    verification pass. What's left overall: the user-account-linking part of
    Phase 5 (`eas login`/`eas init`, an Apple/Google developer account, an
    actual TestFlight/Play build), retiring the old web app (needs the
    user's hosting decision), reconciling React versions (deferred,
    higher-risk), and `expo-notifications` for OS push (the one remaining
    unblocked feature — see the Phase 5 entry).
22. ~~`expo-notifications` — local reminder notifications~~ — **code done,
    unit-tested, and the `pushToken` rules change is genuinely proven via
    the emulator suite; live iOS Simulator permission-request verification
    is blocked** (see the Phase 5 entry above for the full writeup). Found a
    real, reproducible hang — tapping "Enable notifications" freezes the
    app, likely an `expo-notifications`/Bridgeless-New-Architecture
    incompatibility — and, along the way, a separate pre-existing crash in
    the shared `Sheet.tsx`/`@gorhom/bottom-sheet` primitive (opening
    Settings' `InviteSheet` throws `Property 'window' doesn't exist`),
    flagged separately as its own follow-up rather than fixed here since
    it's unrelated and affects a primitive shared by 12 sheets. Per
    explicit user choice, neither was chased further this session. What's
    left overall: the user-account-linking part of Phase 5 (`eas login`/
    `eas init`, an Apple/Google developer account, an actual TestFlight/
    Play build), retiring the old web app (needs the user's hosting
    decision), reconciling React versions (deferred, higher-risk), the
    `InviteSheet`/Reanimated crash (flagged separately), and confirming the
    local-notification permission flow on a real device or after resolving
    the New Architecture incompatibility — none of these are something an
    agent can complete unassisted this pass.

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
