# CISA Campus Mobile App (`apps/mobile`)

Expo / React Native mobile application for CISA Campus Work Tracker.

---

## E2E Testing with Maestro

We use [Maestro](https://maestro.mobile.dev/) for cross-platform mobile UI end-to-end (E2E) testing on iOS Simulators and Android Emulators.

### 1. Prerequisites

- **Maestro CLI**:
  ```bash
  # macOS / Linux
  curl -FsSL "https://get.maestro.mobile.dev" | bash
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

Mobile E2E tests automatically run in GitHub Actions on pull requests touching `apps/mobile/**`.
Workflows are defined in [`.github/workflows/mobile-e2e.yml`](file:///Users/twang/.gemini/antigravity/worktrees/cisa-campus-work-traker/setup_mobile_e2e_testing/.github/workflows/mobile-e2e.yml).
