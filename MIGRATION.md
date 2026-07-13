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
cd packages/core && npm install && npm test        # 27 tests

# Mobile app
cd apps/mobile && npm install
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

### 🔲 Phase 0.5 — De-risking spikes (do before committing to full ports)
- [ ] **Collab editor in a WebView** — host the existing web TipTap/Yjs editor in
      `react-native-webview`, pass doc id + auth token, confirm Yjs/RTDB sync on a
      device. This is the top technical risk and gates Phase 4.
- [ ] **Native Google Sign-In** — `@react-native-google-signin` +
      `signInWithCredential` (popup sign-in doesn't exist in RN). Recovers the
      Sheets `spreadsheets.readonly` token too.
- [ ] **Fonts** — bundle Newsreader + Hanken Grotesk via
      `@expo-google-fonts/*`, load in `app/_layout.tsx` (currently system
      fallback).

### 🔲 Phase 1 — Share the data layer
- [ ] Re-home the Firestore modules (`threads`, `rsvp`, `todos`, `prayers`,
      `personalPrayers`, `gatheringTypes`, `userPreferences`, `seasons` hooks,
      `services/chat`) into `packages/core` behind an injected `db` handle, so web
      + mobile share them (not just the pure logic).
- [ ] Auth context + `ProtectedRoute`/`RoleGuard` equivalents in RN using
      `canAccessRoute` from core; gate the tabs/drawer by live role.

### 🔲 Phase 2 — Low-risk read screens (validate the pattern end-to-end)
- [ ] Landings dispatcher + LandingTrainee / Student / Community
- [ ] Prayer, Answered, History, Directory (People)
- [ ] Live Firestore data + the e2e test users (one per role)

### 🔲 Phase 3 — Medium screens
- [ ] My Day cockpit (uses `inboxItemsFor` over live subscriptions)
- [ ] Gatherings/Attendance, Settings, SignUp (phone verify), Feedback,
      Notifications, Global search, Quick add
- [ ] Modals → RN bottom sheets (`@gorhom/bottom-sheet`)
- [ ] Platform swaps: clipboard→`expo-clipboard`, screenshot→`react-native-view-shot`,
      CSV export→`expo-file-system`+`expo-sharing`, `messaging.ts`→`Linking`

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

1. **Get a real login working** on the mobile app: add `EXPO_PUBLIC_FIREBASE_API_KEY`
   to `apps/mobile/.env`, build a simple email/password sign-in screen, and log in
   as an e2e test user — proves the reused Firebase layer end-to-end on a device.
2. **Run the WebView editor spike** (Phase 0.5) — it's the one thing that could
   change the architecture, so validate it early.
3. **Phase 1 + one Phase 2 screen** (Prayer is a good first — medium complexity,
   clear design in `prayer*.png`) to lock the "screen port" pattern, then fan out.

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
  (`mobile.html` + `screenshots/`).
