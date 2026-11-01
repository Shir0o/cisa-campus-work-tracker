# CISA Campus Mobile App (`apps/mobile`)

Expo / React Native mobile application for CISA Campus Work Tracker across iOS, Android, and web.

[← Back to Root README](../../README.md) • [Mobile Setup Guide](SETUP.md) • [Build & Submit Reference](BUILD_AND_SUBMIT.md)

---

## Overview
Expo / React Native cross-platform mobile application for iOS, Android, and web. Implements role-tailored workflows (Full-timer, Trainee, Student, Community) for campus ministry contact management, prayer requests, The Journey tracking, offline queue state, and Firestore data synchronization.

## Interface
- `RootNavigator`: Root layout coordinator managing font loading (Lexend), splash screen lifecycle, theme/auth/language providers, Sentry initialization, and redirect gates to `PUBLIC_ROUTES` (`app/_layout.tsx`)
- `PUBLIC_ROUTES`: Unauthenticated route allowlist (`['/signup', '/login']`) (`app/_layout.tsx`)
- `V2TabBar`: Accessible tab bar implementing role-based navigation tabs (`tabsForRole`), unread message badges, and solid ink inversion (`app/(tabs)/_layout.tsx`)
- `getMobileTabTitle`: Localized tab title resolver (`app/(tabs)/_layout.tsx`)
- `TabsLayout`: Navigation shell configured for 4 canonical roles (Trainee tab-less queue with drawer; Student and Community 4 member tabs; Full-timer 4 staff tabs) (`app/(tabs)/_layout.tsx`)
- `ThemeProvider`: Appearance and theme context provider supporting light/dark modes and per-user preference persistence via `useAppearance` (`src/theme/ThemeProvider.tsx`)
- Design Tokens: Core design tokens for typography, radius, spacing, and theme color palettes (`src/theme/tokens.ts`, `src/theme/v2.ts`)
- `auth`, `db`, `rtdb`: Initialized Firebase Authentication, Firestore, and Realtime Database instances with React Native persistence (`src/lib/firebase.ts`)
- `AuthProvider`: Context provider managing authentication state, user profile subscription, and admin impersonation (`src/lib/AuthProvider.tsx`)
- `LanguageProvider`: i18n localization provider for English and Spanish (`src/lib/LanguageProvider.tsx`)
- `routeForNotificationLink`, `useNotificationTapRouting`: Deep link parser and tap listener mapping web notification URLs to native screens (`src/lib/notificationRouting.ts`)
- `useMemberPrayerData`: Live prayer subscription hook partitioned by role (`src/lib/useMemberPrayerData.ts`)
- Data Layer: Typed Firestore operations for notifications, prayers, contacts, chat, and attendances (`src/lib/data/*`)
- UI & V2 Primitives: `Widget`, `Room`, `V2RowCard`, `BufferedTextInput`, `KeyboardScrollView`, `ImpersonateLayer`, `QueueDrawer` (`src/components/*`)

## Invariants
- Dual instantiation guard: Metro explicitly blocks `packages/core/node_modules` to prevent dual Firestore class instantiation and broken `instanceof` checks (`metro.config.js`).
- Role-based tabs: Navigation shell is strictly determined by `@cisa/core:tabsForRole`: Trainee has 0 tabs (queue + drawer), Student/Community have 4 member tabs, Full-timer has 4 staff tabs (`app/(tabs)/_layout.tsx`).
- Color contrast: Active tab pills enforce solid ink inversion (15.2:1 contrast ratio); resting tab labels enforce minimum 4.5:1 WCAG AA contrast (`app/(tabs)/_layout.tsx`).
- Input height limits: All multi-line growing text inputs must cap at `MULTILINE_FIELD_MAX_HEIGHT` (160px) to prevent keyboard clipping under edge-to-edge display (`src/components/ui/KeyboardField.tsx`).
- Portal input buffering: Inputs inside bottom sheets must use `BufferedTextInput` to suppress asynchronous modal portal value echoes on Android (`src/components/ui/BufferedTextInput.tsx`).
- Route gating: Unauthenticated routes are restricted to `PUBLIC_ROUTES` (`['/signup', '/login']`); all others redirect to `/login` (`app/_layout.tsx`).
- Toolchain: Mobile toolchain runs under Node 20 / npm 10 with an isolated lockfile (`apps/mobile/package-lock.json`).

## Side Effects
- Persists user credentials and auth session in local device storage via AsyncStorage (`src/lib/firebase.ts`).
- Establishes real-time snapshot listeners and writes documents to Google Cloud Firestore (`prod` or `qa-db`) (`src/lib/firebase.ts`).
- Connects via WebSocket to Firebase Realtime Database for collaborative editing on The Board (`src/lib/firebase.ts`).
- Registers APNs / FCM push notification tokens with Expo Notifications (`src/lib/usePushRegistration.ts`).
- Transmits crash metrics and Firestore exceptions to Sentry (`src/lib/sentry.ts`).
- Stores daily completed task and prayer state maps in AsyncStorage (`src/lib/queueState.ts`).

## Verification
- Run: `npm --prefix apps/mobile test` (Jest via jest-expo)
- Typecheck: `npm --prefix apps/mobile run typecheck` (tsc --noEmit)
- E2E: `npm --prefix apps/mobile run test:e2e` (maestro test .maestro/)

---

## E2E Testing with Maestro

We use [Maestro](https://maestro.mobile.dev/) for cross-platform mobile UI end-to-end (E2E) testing on iOS Simulators and Android Emulators.

### 1. Prerequisites

- **Maestro CLI**:
  ```bash
  # macOS / Linux
  curl -fsSL "https://get.maestro.mobile.dev" | bash
  # Or via Homebrew
  brew install mobile-dev-inc/tap/maestro
  ```
- **Simulator / Emulator**:
  - **iOS**: Xcode installed with iOS Simulator (`npx expo run:ios`).
  - **Android**: Android Studio with an active Android Virtual Device (AVD) (`npx expo run:android`).

### 2. Running E2E Tests Locally

1. Start your Expo build on simulator/emulator:
   ```bash
   npm run android  # or npm run ios
   ```
2. Run Maestro test suite:
   ```bash
   npm run test:e2e
   ```
   Or run a single test flow:
   ```bash
   maestro test .maestro/01_app_launch.yaml
   ```

### 3. Continuous Integration (GitHub Actions)

Mobile E2E tests run automatically in GitHub Actions on a **daily schedule at midnight (00:00 UTC)** as well as on-demand via manual trigger (`workflow_dispatch`).
Workflows are defined in `.github/workflows/mobile-e2e.yml`.

### 4. Keeping the flows honest

The flows assert strings the app really renders, so a shell change has to reach `.maestro/` in the same PR.
