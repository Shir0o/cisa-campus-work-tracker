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
cd packages/core && npm install && npm test        # 54 tests

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
  - [ ] Still open: `rsvp`, `gatheringTypes`, `seasons` hooks, `services/chat`,
        and re-pointing the *web* app's own copies of the five re-homed
        modules at the shared `packages/core/src/data/` versions (today only
        mobile consumes them — web's `src/lib/*.ts` are unchanged).
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

### 🔲 Phase 2 — Low-risk read screens (validate the pattern end-to-end)
- [ ] Landings dispatcher + LandingTrainee / Student / Community
- [x] ~~Prayer~~ — done, verified live against the e2e Full-timer (both
      themes): `apps/mobile/app/(tabs)/prayer.tsx` + `src/components/prayer/`
      (`PrayerThreadCard`, `HoldPrayerSheet`), backed by new
      `subscribeAllPrayers`/`addPrayer`/`updatePrayerBurden` in
      `packages/core/src/data/prayers.ts` and a unit-tested pure
      `groupPrayerThread` in `packages/core/src/prayerThread.ts`. Answered
      (`/answered`), History, and Directory (People) are still open.
- [ ] Answered, History, Directory (People)
- [ ] Live Firestore data + the e2e test users (one per role)

### 🔲 Phase 3 — Medium screens
- [x] ~~My Day cockpit~~ — done, see above.
- [ ] Gatherings/Attendance, Settings, SignUp (phone verify), Feedback,
      Notifications, Global search, Quick add
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
   **Not a blocker for step 6** (Directory) — see re-sequencing note below.
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
6. ~~Pick the next screen to port~~ — **Prayer done** (see Phase 2 above).
   **Directory (People) is next**, reusing the Phase 1 data-layer pattern.
   Scoped from the design (Claude Design project
   `019e2501-d939-73e9-8f0f-af68b36b8e64`, file `views/contacts.jsx` — has a
   real `isMobile` branch): search bar + stage-filter pills render on **both**
   mobile and desktop in the design (not desktop-only), and **no bulk-select
   UI appears in the mobile-aware mock at all** (looks desktop-only there), so
   the mobile pass only needs search + stage-pill filtering + `contact-card`
   rows (avatar, name, stage chip, year/major, overdue-toned "last connected"
   line) — no new bottom-sheet filter panel or bulk-select needed for parity.
   Needs a genuinely new shared module, `packages/core/src/data/contacts.ts`
   (+ maybe `stages.ts`): subscribe to contacts/stages, plus tag-update/delete
   writes — none of this is shared yet (today it's inline `onSnapshot` calls
   duplicated in both `apps/mobile/src/lib/useMyDayData.ts` and the web's
   `src/views/Directory.tsx`). The last-touch (interactions+comments
   collection-group) logic already exists inline in `useMyDayData.ts` and can
   be extracted/reused rather than rewritten. Reuse `Avatar`, `StatusPill`,
   `toneForStage` (theme/tokens.ts) and `ContactsPickerSheet.tsx`'s row layout
   as a starting template for `apps/mobile/app/(tabs)/people.tsx` (currently a
   3-row hardcoded stub).

**Re-sequencing note**: the numbering above is historical — in practice,
Phase 2 screens (Prayer, done; Directory, next) have no external blockers and
can proceed independently of the two Phase 0.5 spikes (WebView editor is a
sizable standalone extraction project; Google Sign-In needs the user's
go-ahead on a permission-required Firebase config change before an agent can
finish it). Prefer continuing screen ports unless the user specifically wants
a spike tackled next.

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
